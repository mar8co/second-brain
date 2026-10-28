// Via di un posto a partire dal nome (per i Ristoranti), con OpenStreetMap
// (Nominatim): gratuito, senza chiave. Regole d'uso di Nominatim: un'app che si
// presenta (User-Agent), al massimo una richiesta al secondo, risultati salvati
// e non richiesti di nuovo. L'app chiede un posto alla volta e salva la
// risposta nell'elemento. Google Maps non si usa: la sua API è a pagamento.

import { verifyRequest } from "./auth.js";
import { aiConfigured, quartiereWithAi } from "./ai.js";
import { isAppleMaps, isGoogleMaps, parsePlaceFromUrl } from "../src/lib/detect.js";
import { safeFetch } from "./net.js";

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

// Parte di un indirizzo che è una via (nel testo di Google Maps).
const VIA_NOME = /^(via|viale|piazza|piazzale|corso|largo|vicolo|lungotevere|borgo|strada|salita|circonvallazione|lungomare|contrada|località|loc\.)\b/i;
const VIA = /\b\d{1,4}[a-z]?\b|\b(via|viale|piazza|piazzale|corso|largo|vicolo|lungotevere|borgo|strada|street|road|avenue|rue|calle)\b/i;

// Indirizzo scritto nel link di Google Maps ("/maps/place/Nome, Via X, 44,
// 00153 Roma RM, Italia" → "Via X 44, Roma"); "" se nel link c'è solo il nome.
export function addressFromMapsName(text) {
  const parts = str(text, 300).split(",").map((x) => x.trim()).filter(Boolean);
  const i = parts.findIndex((x, j) => j > 0 && VIA_NOME.test(x));
  if (i < 0) return "";
  let rest = parts.slice(i).filter((x) => !/^(italia|italy)$/i.test(x));
  // Il civico separato da una virgola va con la via.
  rest = rest.reduce((acc, x) => (/^\d{1,4}[a-z]?(\/[a-z0-9]+)?$/i.test(x) && acc.length ? [...acc.slice(0, -1), `${acc[acc.length - 1]} ${x}`] : [...acc, x]), []);
  const via = rest[0];
  const city = rest
    .slice(1)
    .map((x) => x.replace(/\b\d{5}\b/g, "").replace(/\s+[A-Z]{2}$/, "").trim())
    .filter(Boolean)
    .pop();
  return [via, city].filter(Boolean).join(", ");
}

// Via di un risultato di OpenStreetMap (ricerca inversa da coordinate).
export function streetOfAddress(a) {
  const road = str(a?.road || a?.pedestrian || a?.footway || a?.square, 120);
  if (!road) return "";
  const number = str(a?.house_number, 12);
  const city = str(a?.city || a?.town || a?.village || a?.municipality, 80);
  return [number ? `${road} ${number}` : road, city].filter(Boolean).join(", ");
}

export async function handleGeo({ authHeader, body, env, fetchImpl = fetch, aiFetch = fetch, linkFetch = safeFetch, now = Date.now, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const auth = await verifyRequest({ authHeader, env });
  if (!auth.ok) return { status: auth.status, json: { error: auth.error } };
  const link = str(body?.link, 2000);
  const q = geocodeQuery(body?.place);
  if (!q && !link) return { status: 400, json: { error: "Posto mancante." } };
  const base = (env.GEOCODE_API_BASE || DEFAULT_BASE).replace(/\/$/, "");

  // Una richiesta a Nominatim (al massimo una al secondo): JSON, o { status, error }.
  const nominatim = async (path, params) => {
    const gap = last + 1100 - now();
    if (gap > 0) await wait(gap);
    last = now();
    const url = `${base}/${path}?${new URLSearchParams({ ...params, format: "jsonv2", addressdetails: "1", "accept-language": "it" })}`;
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

  const search = (text) => nominatim("search", { q: text, limit: "3" });

  // Quartiere col nome comune dato dall'AI a partire dalla via ("" se non sa,
  // null senza AI o se l'AI non ha risposto: allora aiFailed).
  let aiFailed = false;
  const quartiere = async (via, hints = {}) => {
    if (!via || !aiConfigured(env)) return null;
    try {
      return await quartiereWithAi({ env, name: str(body?.place?.name, 150), address: via, hints, fetchImpl: aiFetch });
    } catch {
      aiFailed = true;
      return null;
    }
  };

  if (link) return geoFromLink({ link, body, env, linkFetch, nominatim, search, quartiere });

  const list = await search(q);
  if (list?.error) return { status: list.status, json: { error: list.error } };
  const address = str(body?.place?.address, 200);
  let found = parseStreet(list, str(body?.place?.name, 150), cityOf(address));
  // Il quartiere: con l'AI, il nome che usa la gente a partire dalla via (le
  // zone di OpenStreetMap sono spesso amministrative, come "Città giudiziaria");
  // senza AI, quello di OpenStreetMap.
  // La via data (scritta a mano o letta dall'AI) vale più di quella trovata.
  const via = VIA.test(address) ? address : found?.street || "";
  const zonaAi = await quartiere(via, found?.hints || {});
  if (zonaAi !== null) {
    found = { ...(found || { street: "" }), zona: zonaAi };
  } else if (!found?.zona && VIA.test(address)) {
    // Senza AI, o se l'AI non ha risposto (per esempio troppe richieste): il
    // quartiere di OpenStreetMap dalla via.
    const byStreet = await search(address);
    const zona = byStreet?.error ? "" : parseZona(byStreet);
    if (zona) found = { ...(found || { street: "" }), zona };
  }
  // L'AI non ha risposto: il quartiere va richiesto un'altra volta.
  if (aiFailed) found = { ...(found || { street: "" }), riprova: true };
  if (found) delete found.hints;
  return { status: 200, json: { query: q, found } };
}

// Via e quartiere dal link di Google Maps (o Apple Mappe) che l'utente incolla:
// si leggono l'indirizzo e le coordinate scritti nel link e nei suoi
// reindirizzamenti, senza leggere la pagina di Google. Con le coordinate la via
// si chiede a OpenStreetMap (ricerca inversa); se il link ha solo il nome, si
// cerca il locale per nome come di solito.
async function geoFromLink({ link, body, env, linkFetch, nominatim, search, quartiere }) {
  if (!isGoogleMaps(link) && !isAppleMaps(link)) return { status: 400, json: { error: "Non è un link di Google Maps." } };
  const chain = [link];
  let place = parsePlaceFromUrl(link);
  if (place?.lat === null || place?.lat === undefined || !addressFromMapsName(place?.name)) {
    try {
      const r = await linkFetch(link, { allowPrivate: env.EXTRACT_ALLOW_PRIVATE === "1", maxBytes: 64 * 1024 });
      chain.push(...r.redirects, r.finalUrl);
      // Pagina del consenso di Google (Europa): il link del posto sta in ?continue=.
      for (const u of [...chain]) {
        try {
          const c = new URL(u).searchParams.get("continue");
          if (c && /^https:\/\//.test(c)) chain.push(c);
        } catch {
          // indirizzo non valido
        }
      }
    } catch {
      // Link non raggiungibile: si usa quello che c'è nel link stesso.
    }
  }
  let name = "";
  let written = "";
  let lat = null;
  let lng = null;
  for (const u of chain) {
    const p = parsePlaceFromUrl(u);
    if (p?.name && !written) {
      written = addressFromMapsName(p.name);
      name = name || str(p.name.split(",")[0], 150);
    }
    if (p?.lat !== null && p?.lat !== undefined && lat === null) [lat, lng] = [p.lat, p.lng];
    // Ricerca Google (link share.google): "?q=Nome, Via…" o solo il nome.
    try {
      const x = new URL(u);
      const qq = /(^|\.)google\.[a-z.]+$/i.test(x.hostname) && /^\/(search|maps)/.test(x.pathname) ? str(x.searchParams.get("q"), 300) : "";
      if (qq && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(qq)) {
        written = written || addressFromMapsName(qq);
        name = name || str(qq.split(",")[0], 150);
      }
    } catch {
      // indirizzo non valido
    }
  }
  let street = written;
  let hints = {};
  let osmZona = "";
  if (lat !== null) {
    const rev = await nominatim("reverse", { lat: String(lat), lon: String(lng), zoom: "18" });
    if (!rev?.error && rev?.address) {
      street = street || streetOfAddress(rev.address);
      hints = Object.fromEntries(["suburb", "quarter", "neighbourhood"].map((f) => [f, str(rev.address[f], 60)]).filter(([, v]) => v));
      osmZona = zonaOf(rev.address);
    }
  }
  if (!street && (name || body?.place?.name)) {
    const who = str(body?.place?.name, 150) || name;
    const list = await search(geocodeQuery({ name: who, address: body?.place?.address }));
    const f = list?.error ? null : parseStreet(list, who, cityOf(body?.place?.address));
    if (f) {
      street = f.street;
      hints = f.hints || {};
      osmZona = f.zona || "";
    }
  }
  if (!street) return { status: 200, json: { found: null, error: "Non ho trovato la via in questo link." } };
  const zona = (await quartiere(street, hints)) ?? osmZona;
  return { status: 200, json: { found: { street, ...(zona ? { zona } : {}), ...(lat !== null ? { lat, lng } : {}) } } };
}
