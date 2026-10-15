// Via di un posto a partire dal nome (per i Ristoranti), con OpenStreetMap
// (Nominatim): gratuito, senza chiave. Regole d'uso di Nominatim: un'app che si
// presenta (User-Agent), al massimo una richiesta al secondo, risultati salvati
// e non richiesti di nuovo. L'app chiede un posto alla volta e salva la
// risposta nell'elemento. Google Maps non si usa: la sua API è a pagamento.

import { verifyRequest } from "./auth.js";

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

// Via, numero civico e città del primo risultato che è davvero il posto cercato
// (con addressdetails=1); null se non c'è.
export function parseStreet(list, name) {
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || !POI_CATEGORIES.has(r.category)) continue;
    const a = r.address || {};
    const road = str(a.road || a.pedestrian || a.footway || a.square, 120);
    if (!road || !sameName(name, r.name || r.display_name)) continue;
    const number = str(a.house_number, 12);
    const city = str(a.city || a.town || a.village || a.municipality, 80);
    return { street: [number ? `${road} ${number}` : road, city].filter(Boolean).join(", "), label: str(r.display_name, 300) || null };
  }
  return null;
}

export async function handleGeo({ authHeader, body, env, fetchImpl = fetch, now = Date.now, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const auth = await verifyRequest({ authHeader, env });
  if (!auth.ok) return { status: auth.status, json: { error: auth.error } };
  const q = geocodeQuery(body?.place);
  if (!q) return { status: 400, json: { error: "Posto mancante." } };

  const gap = last + 1100 - now();
  if (gap > 0) await wait(gap);
  last = now();

  const base = (env.GEOCODE_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
  const url = `${base}/search?${new URLSearchParams({ q, format: "jsonv2", limit: "3", addressdetails: "1", "accept-language": "it" })}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "second-brain/1.0 (archivio personale; https://second-brain-qqwi.vercel.app)", Accept: "application/json" },
    });
    if (res.status === 429) return { status: 429, json: { error: "Troppe richieste a OpenStreetMap: riprovo più tardi." } };
    if (!res.ok) return { status: 502, json: { error: "OpenStreetMap non risponde." } };
    return { status: 200, json: { query: q, found: parseStreet(await res.json(), str(body?.place?.name, 150)) } };
  } catch {
    return { status: 502, json: { error: "Impossibile contattare OpenStreetMap." } };
  } finally {
    clearTimeout(timer);
  }
}
