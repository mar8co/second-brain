// Posizione di un posto a partire dal nome (per la Mappa), con OpenStreetMap
// (Nominatim): gratuito, senza chiave. Regole d'uso di Nominatim: un'app che si
// presenta (User-Agent), al massimo una richiesta al secondo, risultati salvati
// e non richiesti di nuovo. L'app chiede un posto alla volta e salva la
// risposta nell'elemento.

import { verifyRequest } from "./auth.js";

const DEFAULT_BASE = "https://nominatim.openstreetmap.org";
const TIMEOUT_MS = 8000;
// Una richiesta al secondo per tutta l'app (per istanza del server).
let last = 0;

const str = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

export function geocodeQuery(place) {
  const name = str(place?.name, 150);
  const address = str(place?.address, 200);
  if (!name && !address) return "";
  // Se l'indirizzo comincia già con il nome, non lo si ripete.
  if (address && name && address.toLowerCase().startsWith(name.toLowerCase())) return address;
  return [name, address].filter(Boolean).join(", ");
}

export function parseNominatim(list) {
  const r = Array.isArray(list) ? list[0] : null;
  if (!r) return null;
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, label: str(r.display_name, 300) || null };
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
  const url = `${base}/search?${new URLSearchParams({ q, format: "jsonv2", limit: "1", "accept-language": "it" })}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "second-brain/1.0 (archivio personale; https://second-brain-qqwi.vercel.app)", Accept: "application/json" },
    });
    if (res.status === 429) return { status: 429, json: { error: "Troppe richieste a OpenStreetMap: riprovo più tardi." } };
    if (!res.ok) return { status: 502, json: { error: "OpenStreetMap non risponde." } };
    return { status: 200, json: { query: q, found: parseNominatim(await res.json()) } };
  } catch {
    return { status: 502, json: { error: "Impossibile contattare OpenStreetMap." } };
  } finally {
    clearTimeout(timer);
  }
}
