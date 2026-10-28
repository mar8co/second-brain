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

// Tipi di locale (li dà l'AI, server/ai.js TIPI_LOCALE): nome e colore della
// tavolozza; l'icona è in components/Spots.jsx.
export const TIPI_LOCALE = {
  trattoria: { label: "Trattoria", plurale: "Trattorie", colore: "var(--arancio)" },
  pizzeria: { label: "Pizzeria", plurale: "Pizzerie", colore: "var(--giallo)" },
  bar: { label: "Bar e caffè", plurale: "Bar e caffè", colore: "var(--sabbia)" },
  street: { label: "Street food", plurale: "Street food", colore: "var(--verde)" },
  vino: { label: "Vino e cocktail", plurale: "Vino e cocktail", colore: "var(--rosa)" },
  dolci: { label: "Gelato e dolci", plurale: "Gelato e dolci", colore: "var(--blu)", chiaro: true },
  mondo: { label: "Cucina dal mondo", plurale: "Cucina dal mondo", colore: "var(--rosso)" },
  ristorante: { label: "Ristorante", plurale: "Ristoranti", colore: "var(--grigio)" },
};

// Tipo dal nome, finché l'AI non l'ha dato (contenuti salvati prima).
const DAL_NOME = [
  ["pizzeria", /pizz/],
  ["dolci", /gelat|pasticc|dolc|cioccolat|bakery|cornett|maritozz|patisserie/],
  ["vino", /enotec|wine|vino|vini\b|cocktail|\bpub\b|birr|brew|drink|spritz/],
  ["bar", /\bbar\b|caff|coffee|\bcafe\b|torrefaz/],
  ["trattoria", /trattori|osteri|hostaria|taverna|locanda/],
  ["street", /suppl|panin|street|kebab|burger|trapizz|friggitori|rosticc|focacc|fritt|piadin/],
  ["mondo", /sushi|ramen|poke|thai|indian|cines|giappon|messic|taco|bao|dim sum|korean|corean|libanes|etiop|peruv/],
];
export function tipoLocale(p) {
  const t = text(p?.tipo).toLowerCase();
  if (TIPI_LOCALE[t]) return t;
  const n = normalize(text(p?.name));
  return DAL_NOME.find(([, re]) => re.test(n))?.[0] || "ristorante";
}

// Città di un indirizzo ("Via dei Vascellari 29, 00153 Roma" → "Roma"), per
// raggruppare i locali di cui non si conosce il quartiere.
export function cittaDi(address) {
  const parts = text(address).split(",").map((x) => x.replace(/\b\d{5}\b/g, "").trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return hasStreet(last) ? "" : last;
}

// Locali divisi per zona (quartiere, altrimenti città) o per tipo:
// [{ key, label, list, controllare? }], prima i gruppi più numerosi; "Zona non
// indicata" in fondo. Per zona, in cima "Via da controllare": i locali di cui
// né l'AI né OpenStreetMap hanno trovato la via (da scrivere a mano).
export const SENZA_ZONA = "Zona non indicata";
export const DA_CONTROLLARE = "Via da controllare";
export function gruppiLocali(restaurants, per = "zona") {
  const m = new Map();
  for (const r of restaurants) {
    const controllare = per === "zona" && !r.streets?.length && r.cercato;
    const label = per === "tipo" ? TIPI_LOCALE[r.tipo]?.plurale || "Ristoranti" : controllare ? DA_CONTROLLARE : r.zona || r.citta || SENZA_ZONA;
    const k = normalize(label);
    if (!m.has(k)) m.set(k, { key: k, label, list: [], ...(controllare ? { controllare: true } : {}) });
    m.get(k).list.push(r);
  }
  const posto = (g) => (g.controllare ? -1 : g.label === SENZA_ZONA ? 1 : 0);
  return [...m.values()].sort((a, b) => posto(a) - posto(b) || b.list.length - a.list.length || a.label.localeCompare(b.label, "it"));
}

// Locali di cui cercare via e quartiere su OpenStreetMap: quelli senza via mai
// cercati e quelli senza quartiere mai cercato.
// [{ name, address, targets: [{ id, index }] }]; lo stesso locale citato in più
// contenuti si cerca una volta e il risultato va a tutti.
export function streetQueue(items) {
  const m = new Map();
  for (const item of items) {
    const places = Array.isArray(item.ai?.places) ? item.ai.places : [];
    places.forEach((p, index) => {
      if (!p || p.kind !== "ristorante" || !text(p.name)) return;
      const needStreet = !hasStreet(p.address) && !text(p.street) && !p.geo_at;
      // Quartieri della versione precedente (zone di OpenStreetMap, a volte
      // amministrative) e vie trovate senza il controllo della città: si rifanno.
      const needZona = !(Number(p.zona_v) >= ZONA_V);
      if (!needStreet && !needZona) return;
      const key = normalize(p.name);
      // Si cerca con la via scritta a mano, altrimenti con l'indirizzo letto
      // dall'AI (non con una via trovata prima, che potrebbe essere sbagliata).
      const e = m.get(key) || { name: text(p.name), address: queryOf(item, index), targets: [] };
      e.targets.push({ id: item.id, index, name: text(p.name) });
      m.set(key, e);
    });
  }
  return [...m.values()];
}

// Indirizzo con cui si cerca il locale index dell'elemento: la via scritta a
// mano, altrimenti quello letto dall'AI.
export function queryOf(item, index) {
  const p = item?.ai?.places?.[index];
  return (p?.manual && placeAddresses(p)[0]) || text(p?.address);
}

// Versione della ricerca di via e quartiere (2: città controllata, quartiere
// col nome comune dato dall'AI).
export const ZONA_V = 2;

// Modifica da salvare nell'elemento con il risultato (found = { street, zona } o
// null): il locale è segnato come già cercato, così non si chiede di nuovo. Le
// vie scritte a mano o lette dall'AI restano; quella di OpenStreetMap si
// sostituisce con il nuovo risultato (o si toglie, se non si trova più).
export function streetPatch(item, index, name, found, now = new Date()) {
  const places = item.ai?.places;
  if (!Array.isArray(places) || text(places[index]?.name) !== name) return null;
  const at = now.toISOString();
  const next = places.map((p, i) => {
    if (i !== index) return p;
    const out = { ...p };
    delete out.zona;
    if (!p.manual && !hasStreet(p.address)) {
      delete out.street;
      if (found?.street) out.street = found.street;
    }
    if (text(found?.zona)) out.zona = text(found.zona);
    return { ...out, geo_at: at, zona_at: at, zona_v: ZONA_V };
  });
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
      for (const f of ["street", "sedi", "manual", "geo_at", "zona", "zona_at", "zona_v"]) delete rest[f];
      return list.length ? { ...rest, street: list[0], sedi: list, manual: true, geo_at: now.toISOString() } : rest;
    });
    out.push({ id: item.id, patch: { ai: { ...item.ai, places: next } } });
  }
  return out;
}

// Toglie un locale dalla lista Ristoranti (hidden) o lo rimette (hidden = false):
// [{ id, patch }] per ogni contenuto che lo cita. I contenuti restano salvati.
export function hideRestaurantPatches(items, name, hidden = true) {
  const key = normalize(name);
  const out = [];
  for (const item of items) {
    const places = Array.isArray(item.ai?.places) ? item.ai.places : [];
    if (!places.some((p) => p && p.kind === "ristorante" && normalize(text(p.name)) === key)) continue;
    const next = places.map((p) => {
      if (!p || p.kind !== "ristorante" || normalize(text(p.name)) !== key) return p;
      const rest = { ...p };
      delete rest.hidden;
      return hidden ? { ...rest, hidden: true } : rest;
    });
    out.push({ id: item.id, patch: { ai: { ...item.ai, places: next } } });
  }
  return out;
}

// Chiave di un evento nell'elenco: nome e data.
export function eventKey(e) {
  return `${normalize(text(e.name))}|${isDay(e.date) ? text(e.date) : ""}`;
}

// Toglie un evento dalla lista Eventi (hidden) o lo rimette: [{ id, patch }].
export function hideEventPatches(items, key, hidden = true) {
  const out = [];
  for (const item of items) {
    const events = Array.isArray(item.ai?.events) ? item.ai.events : [];
    if (!events.some((e) => e && text(e.name) && eventKey(e) === key)) continue;
    const next = events.map((e) => {
      if (!e || !text(e.name) || eventKey(e) !== key) return e;
      const rest = { ...e };
      delete rest.hidden;
      return hidden ? { ...rest, hidden: true } : rest;
    });
    out.push({ id: item.id, patch: { ai: { ...item.ai, events: next } } });
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

// [{ key, name, address, addresses, streets, manual, items, tipo, zona, citta }].
// `addresses`: le sedi note; `streets`: quelle con una via vera (le sedi scritte
// a mano contano sempre); `address`: la prima, per la ricerca; `zona`: il
// quartiere trovato su OpenStreetMap; `citta`: dall'indirizzo.
// ordine: "recenti" (default, archiviati più di recente prima), "vecchi", "nome".
export function restaurantsOf(items, ordine = "recenti") {
  const m = new Map();
  for (const item of items) {
    const places = Array.isArray(item.ai?.places) ? item.ai.places : [];
    for (const p of places) {
      if (!p || p.kind !== "ristorante" || !text(p.name) || p.hidden === true) continue;
      const key = normalize(p.name);
      const addresses = placeAddresses(p);
      const manual = p.manual === true && addresses.length > 0;
      const e = m.get(key);
      if (!e) {
        m.set(key, { key, name: text(p.name), addresses, manual, items: [item], tipo: text(p.tipo), zona: text(p.zona), cercato: Boolean(p.geo_at) });
        continue;
      }
      if (!e.items.includes(item)) e.items.push(item);
      if (p.geo_at) e.cercato = true;
      if (!TIPI_LOCALE[e.tipo] && text(p.tipo)) e.tipo = text(p.tipo);
      // Le sedi scritte a mano vincono; poi un indirizzo con la via su uno solo con la città.
      if ((manual && !e.manual) || (!e.manual && !manual && !e.addresses.some(hasStreet) && addresses.some(hasStreet))) {
        e.addresses = addresses;
        e.manual = manual;
        e.zona = text(p.zona) || e.zona;
      } else if (!e.zona) e.zona = text(p.zona);
    }
  }
  // Data di archiviazione del locale: quella dell'elemento archiviato più di recente.
  const saved = (r) => Math.max(...r.items.map((it) => Date.parse(it.created_at) || 0));
  const byName = (a, b) => a.name.localeCompare(b.name, "it");
  const sorter = ordine === "nome" ? byName : ordine === "vecchi" ? (a, b) => saved(a) - saved(b) || byName(a, b) : (a, b) => saved(b) - saved(a) || byName(a, b);
  return [...m.values()]
    .map((r) => ({ ...r, address: r.addresses[0] || "", streets: r.manual ? r.addresses : r.addresses.filter(hasStreet), tipo: tipoLocale(r), citta: cittaDi(r.addresses[0]) }))
    .sort(sorter);
}

// { upcoming, undated, past }: prossimi per data, poi quelli senza data, e in
// fondo i passati (dal più recente). Un evento è passato quando il suo ultimo
// giorno è prima di oggi.
export function eventsOf(items, today = todayISO()) {
  const m = new Map();
  for (const item of items) {
    const events = Array.isArray(item.ai?.events) ? item.ai.events : [];
    for (const e of events) {
      if (!e || !text(e.name) || e.hidden === true) continue;
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

// File caricati: foto e video da una parte, documenti dall'altra.
const isMedia = (it) => /^(image|video)\//.test(it.file_mime || "");
export const photosOf = (items) => (items || []).filter((it) => it.file_path && isMedia(it));
export const docsOf = (items) => (items || []).filter((it) => it.file_path && !isMedia(it));

// Le note scritte a mano (senza file): stanno nel box "File e note".
export const notesOf = (items) => (items || []).filter((it) => it.type === "note" && !it.file_path);
