// Via di un posto a partire dal nome (per i Ristoranti), con OpenStreetMap
// (Nominatim): gratuito, senza chiave. Regole d'uso di Nominatim: un'app che si
// presenta (User-Agent), al massimo una richiesta al secondo, risultati salvati
// e non richiesti di nuovo. L'app chiede un posto alla volta e salva la
// risposta nell'elemento. Google Maps non si usa: la sua API è a pagamento.

import { verifyRequest } from "./auth.js";
import { aiConfigured, quartiereWithAi } from "./ai.js";

const DEFAULT_BASE = "https://nominatim.openstreetmap.org";
const TIMEOUT_MS = 8000;
// Una richiesta al secondo per tutta l'app (per istanza del server).
let last = 0;

const str = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const plain = (s) => str(s, 300).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Posti veri (non vie, quartieri o città): solo questi valgono come risposta.
const POI_CATEGORIES = new Set(["amenity", "shop", "tourism", "leisure", "craft", "office", "historic"]);
const GENERIC = new Set(["bar", "caffe", "pizzeria", "trattoria", "ristorante", "osteria", "pasticceria", "gelateria", "pub", "birreria", "enoteca", "the", "del", "della", "dei", "da", "al", "il", "la", "lo", "le", "di", "e", "and"]);

export function geocodeQuery(place) {
  const name = str(place?.name, 150);
  const address = str(place?.address, 200);
  if (!name && !address) return "";
  // Se l'indirizzo comincia già con il nome, non lo si ripete.
  if (address && name && address.toLowerCase().startsWith(name.toLowerCase())) return address;
  return [name, address].filter(Boolean).join(", ");
}

// Il risultato è proprio quel posto? Almeno una parola significativa del nome
// (non "bar", "da", "trattoria"…) deve comparire nel nome trovato.
export function sameName(requested, found) {
  const want = plain(requested);
  const got = plain(found);
  if (!want || !got) return false;
  const words = want.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w));
  return words.length ? words.some((w) => got.includes(w)) : got.includes(want);
}

// Città scritta in fondo a un indirizzo ("Via X 1, 00153 Roma" → "Roma"); "" se
// l'ultima parte è una via.
export function cityOf(address) {
  const parts = str(address, 200).split(",").map((x) => x.replace(/\b\d{5}\b/g, "").trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return last && !VIA.test(last) ? last : "";
}

// Il risultato è nella città cercata? (Un locale con lo stesso nome in
// un'altra città non vale: "Controluce, Roma" non è il Controluce di La Spezia.)
export function sameCity(city, a) {
  const want = plain(city);
  if (!want) return true;
  return [a?.city, a?.town, a?.village, a?.municipality, a?.county].some((v) => {
    const got = plain(v);
    return got && (got === want || got.includes(want) || want.includes(got));
  });
}

// Via, numero civico e città del primo risultato che è davvero il posto cercato
// (con addressdetails=1), nella città cercata; null se non c'è.
export function parseStreet(list, name, city = "") {
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || !POI_CATEGORIES.has(r.category)) continue;
    const a = r.address || {};
    const road = str(a.road || a.pedestrian || a.footway || a.square, 120);
    if (!road || !sameName(name, r.name || r.display_name) || !sameCity(city, a)) continue;
    const number = str(a.house_number, 12);
    const found = str(a.city || a.town || a.village || a.municipality, 80);
    const zona = zonaOf(a);
    return { street: [number ? `${road} ${number}` : road, found].filter(Boolean).join(", "), label: str(r.display_name, 300) || null, ...(zona ? { zona } : {}), hints: hintsOf(a) };
  }
  return null;
}

// Nomi di zona di OpenStreetMap, come indizi per l'AI.
function hintsOf(a) {
  return Object.fromEntries(["suburb", "quarter", "neighbourhood"].map((f) => [f, str(a?.[f], 60)]).filter(([, v]) => v));
}

// Quartiere di un indirizzo di OpenStreetMap (Trastevere, Brera…), senza i
// municipi o le circoscrizioni amministrative; "" se non c'è.
export const AMMINISTRATIVO = /^(municipio|circoscrizione|quartiere\s+\d|zona\s+\d|\d)/i;
export function zonaOf(a) {
  for (const f of ["suburb", "quarter", "neighbourhood", "city_district"]) {
    const v = str(a?.[f], 60);
    if (v && !AMMINISTRATIVO.test(v)) return v;
  }
  return "";
}

// Quartiere di una via (quando il locale non si trova per nome): il primo
// risultato con un quartiere.
export function parseZona(list) {
  for (const r of Array.isArray(list) ? list : []) {
    const zona = zonaOf(r?.address);
    if (zona) return zona;
  }
  return "";
}

const VIA = /\b\d{1,4}[a-z]?\b|\b(via|viale|piazza|piazzale|corso|largo|vicolo|lungotevere|borgo|strada|street|road|avenue|rue|calle)\b/i;

export async function handleGeo({ authHeader, body, env, fetchImpl = fetch, aiFetch = fetch, now = Date.now, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const auth = await verifyRequest({ authHeader, env });
  if (!auth.ok) return { status: auth.status, json: { error: auth.error } };
  const q = geocodeQuery(body?.place);
  if (!q) return { status: 400, json: { error: "Posto mancante." } };
  const base = (env.GEOCODE_API_BASE || DEFAULT_BASE).replace(/\/$/, "");

  // Una ricerca su Nominatim: elenco dei risultati, o { status, error }.
  const search = async (text) => {
    const gap = last + 1100 - now();
    if (gap > 0) await wait(gap);
    last = now();
    const url = `${base}/search?${new URLSearchParams({ q: text, format: "jsonv2", limit: "3", addressdetails: "1", "accept-language": "it" })}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "second-brain/1.0 (archivio personale; https://second-brain-qqwi.vercel.app)", Accept: "application/json" },
      });
      if (res.status === 429) return { status: 429, error: "Troppe richieste a OpenStreetMap: riprovo più tardi." };
      if (!res.ok) return { status: 502, error: "OpenStreetMap non risponde." };
      return await res.json();
    } catch {
      return { status: 502, error: "Impossibile contattare OpenStreetMap." };
    } finally {
      clearTimeout(timer);
    }
  };

  const list = await search(q);
  if (list?.error) return { status: list.status, json: { error: list.error } };
  const address = str(body?.place?.address, 200);
  let found = parseStreet(list, str(body?.place?.name, 150), cityOf(address));
  // Il quartiere: con l'AI, il nome che usa la gente a partire dalla via (le
  // zone di OpenStreetMap sono spesso amministrative, come "Città giudiziaria");
  // senza AI, quello di OpenStreetMap.
  const via = found?.street || (VIA.test(address) ? address : "");
  if (via && aiConfigured(env)) {
    try {
      const zona = await quartiereWithAi({ env, name: str(body?.place?.name, 150), address: via, hints: found?.hints || {}, fetchImpl: aiFetch });
      found = { ...(found || { street: "" }), zona };
    } catch {
      // AI non raggiungibile: resta il quartiere di OpenStreetMap, se c'è.
    }
  } else if (!found && via) {
    // Locale non trovato per nome ma con la via: il quartiere si ricava dalla via.
    const byStreet = await search(address);
    const zona = byStreet?.error ? "" : parseZona(byStreet);
    if (zona) found = { street: "", zona };
  }
  if (found) delete found.hints;
  return { status: 200, json: { query: q, found } };
}
