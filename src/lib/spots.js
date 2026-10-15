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

// Un indirizzo ha la via quando c'è un numero civico o un nome di strada;
// "Roma" da sola è solo la città.
const STREET = /\b\d{1,4}[a-z]?\b|\b(via|viale|v\.le|piazza|piazzale|p\.za|corso|largo|vicolo|vico|lungotevere|lungomare|lungarno|borgo|strada|salita|calata|campo|galleria|street|st\.|road|avenue|rue|calle)\b/i;
export function hasStreet(address) {
  return STREET.test(text(address));
}

// Locali di cui cercare la via: quelli senza via nell'indirizzo, mai cercati.
// [{ name, address, targets: [{ id, index }] }]; lo stesso locale citato in più
// contenuti si cerca una volta e il risultato va a tutti.
export function streetQueue(items) {
  const m = new Map();
  for (const item of items) {
    const places = Array.isArray(item.ai?.places) ? item.ai.places : [];
    places.forEach((p, index) => {
      if (!p || p.kind !== "ristorante" || !text(p.name) || hasStreet(p.address) || text(p.street) || p.geo_at) return;
      const key = normalize(p.name);
      const e = m.get(key) || { name: text(p.name), address: text(p.address), targets: [] };
      e.targets.push({ id: item.id, index, name: text(p.name) });
      m.set(key, e);
    });
  }
  return [...m.values()];
}

// Modifica da salvare nell'elemento con il risultato (found = { street } o null):
// il locale è segnato come già cercato, così non si chiede di nuovo.
export function streetPatch(item, index, name, found, now = new Date()) {
  const places = item.ai?.places;
  if (!Array.isArray(places) || text(places[index]?.name) !== name) return null;
  const next = places.map((p, i) => (i === index ? { ...p, ...(found?.street ? { street: found.street } : {}), geo_at: now.toISOString() } : p));
  return { ai: { ...item.ai, places: next } };
}

// Indirizzi di un locale: le sedi scritte a mano (sedi), altrimenti la via
// trovata o l'indirizzo letto dall'AI.
export function placeAddresses(p) {
  const sedi = Array.isArray(p?.sedi) ? p.sedi.map(text).filter(Boolean) : [];
  if (sedi.length) return sedi;
  const one = text(p?.street) || text(p?.address);
  return one ? [one] : [];
}

// Sedi scritte a mano per un locale (una stringa o un elenco): [{ id, patch }]
// per ogni contenuto che lo cita. Valgono più di quelle dell'AI o di
// OpenStreetMap e restano anche se l'AI rifà la scheda; l'elenco vuoto toglie
// tutto e il locale torna a essere cercato su OpenStreetMap.
export function manualStreetPatches(items, name, streets, now = new Date()) {
  const key = normalize(name);
  const list = [];
  for (const v of Array.isArray(streets) ? streets : [streets]) {
    const t = text(v).replace(/\s+/g, " ").slice(0, 200);
    if (t && !list.includes(t)) list.push(t);
  }
  list.splice(10);
  const out = [];
  for (const item of items) {
    const places = Array.isArray(item.ai?.places) ? item.ai.places : [];
    if (!places.some((p) => p && p.kind === "ristorante" && normalize(text(p.name)) === key)) continue;
    const next = places.map((p) => {
      if (!p || p.kind !== "ristorante" || normalize(text(p.name)) !== key) return p;
      const rest = { ...p };
      for (const f of ["street", "sedi", "manual", "geo_at"]) delete rest[f];
      return list.length ? { ...rest, street: list[0], sedi: list, manual: true, geo_at: now.toISOString() } : rest;
    });
    out.push({ id: item.id, patch: { ai: { ...item.ai, places: next } } });
  }
  return out;
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

// [{ key, name, address, addresses, streets, manual, items }] in ordine
// alfabetico. `addresses`: le sedi note; `streets`: quelle con una via vera (le
// sedi scritte a mano contano sempre); `address`: la prima, per la ricerca.
export function restaurantsOf(items) {
  const m = new Map();
  for (const item of items) {
    const places = Array.isArray(item.ai?.places) ? item.ai.places : [];
    for (const p of places) {
      if (!p || p.kind !== "ristorante" || !text(p.name)) continue;
      const key = normalize(p.name);
      const addresses = placeAddresses(p);
      const manual = p.manual === true && addresses.length > 0;
      const e = m.get(key);
      if (!e) {
        m.set(key, { key, name: text(p.name), addresses, manual, items: [item] });
        continue;
      }
      if (!e.items.includes(item)) e.items.push(item);
      // Le sedi scritte a mano vincono; poi un indirizzo con la via su uno solo con la città.
      if ((manual && !e.manual) || (!e.manual && !manual && !e.addresses.some(hasStreet) && addresses.some(hasStreet))) {
        e.addresses = addresses;
        e.manual = manual;
      }
    }
  }
  return [...m.values()]
    .map((r) => ({ ...r, address: r.addresses[0] || "", streets: r.manual ? r.addresses : r.addresses.filter(hasStreet) }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
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
