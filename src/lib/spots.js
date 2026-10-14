// Ristoranti ed Eventi dell'Archivio. Non sono categorie: li ricava l'AI nella
// scheda di memoria di ogni contenuto (ai.places con kind "ristorante", ai.events).
// Lo stesso locale o evento citato in più contenuti compare una volta, con tutti
// i link ai contenuti da cui viene.
import { normalize } from "./search.js";

const text = (v) => (typeof v === "string" ? v.trim() : "");
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(text(v));

// Link a Google Maps con la ricerca del posto (nome e indirizzo letto dall'AI):
// funziona senza chiavi e si apre nell'app Mappe o nel browser.
export function mapsUrl(...parts) {
  const q = parts.map(text).filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// Oggi nel fuso del telefono, come AAAA-MM-GG.
export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function add(map, key, base, item) {
  const e = map.get(key);
  if (!e) return map.set(key, { ...base, key, items: [item] });
  if (!e.items.includes(item)) e.items.push(item);
  for (const f of Object.keys(base)) if (!e[f] && base[f]) e[f] = base[f];
  return map;
}

// [{ key, name, address, items }] in ordine alfabetico.
export function restaurantsOf(items) {
  const m = new Map();
  for (const item of items) {
    const places = Array.isArray(item.ai?.places) ? item.ai.places : [];
    for (const p of places) {
      if (!p || p.kind !== "ristorante" || !text(p.name)) continue;
      add(m, normalize(p.name), { name: text(p.name), address: text(p.address) }, item);
    }
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
}

// { upcoming, undated, past }: prossimi per data, poi quelli senza data, e in
// fondo i passati (dal più recente). Un evento è passato quando il suo ultimo
// giorno è prima di oggi.
export function eventsOf(items, today = todayISO()) {
  const m = new Map();
  for (const item of items) {
    const events = Array.isArray(item.ai?.events) ? item.ai.events : [];
    for (const e of events) {
      if (!e || !text(e.name)) continue;
      const date = isDay(e.date) ? text(e.date) : "";
      const end = date && isDay(e.end_date) && text(e.end_date) > date ? text(e.end_date) : "";
      add(m, `${normalize(e.name)}|${date}`, { name: text(e.name), date, end_date: end, place: text(e.place) }, item);
    }
  }
  const all = [...m.values()];
  const byName = (a, b) => a.name.localeCompare(b.name, "it");
  const last = (e) => e.end_date || e.date;
  return {
    upcoming: all.filter((e) => e.date && last(e) >= today).sort((a, b) => a.date.localeCompare(b.date) || byName(a, b)),
    undated: all.filter((e) => !e.date).sort(byName),
    past: all.filter((e) => e.date && last(e) < today).sort((a, b) => last(b).localeCompare(last(a)) || byName(a, b)),
  };
}

// "sab 25 ott", "sab 25 ott – lun 27 ott"; con l'anno se non è quello di oggi.
export function formatEventDate(date, end, today = todayISO()) {
  const one = (d) => {
    const dt = new Date(`${d}T12:00:00`);
    const base = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" }).format(dt).replace(/\./g, "");
    return d.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${d.slice(0, 4)}`;
  };
  return end ? `${one(date)} – ${one(end)}` : one(date);
}
