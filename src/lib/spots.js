// Ristoranti ed Eventi dell'Archivio. Non sono categorie: li ricava l'AI nella
// scheda di memoria di ogni contenuto (ai.places con kind "ristorante", ai.events).
// Lo stesso locale o evento citato in più contenuti compare una volta, con tutti
// i link ai contenuti da cui viene.
import { formatVia } from "./indirizzi.js";
import { normalize } from "./search.js";
import { extractUrl } from "./detect.js";

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
  ristorante: { label: "Ristorante", plurale: "Ristoranti", colore: "var(--giallo)" },
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
  const parts = formatVia(text(address)).split(",").map((x) => x.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return hasStreet(last) ? "" : last;
}

// Locali divisi per quartiere (altrimenti città), per tipo, per città o in un
// solo elenco per nome: [{ key, label, list, controllare? }], prima i gruppi più
// numerosi; quelli senza zona o città in fondo. Per quartiere, in fondo a tutto
// "Via da controllare": i locali di cui né l'AI né OpenStreetMap hanno trovato la via.
export const SENZA_ZONA = "Zona non indicata";
export const SENZA_CITTA = "Città non indicata";
export const DA_CONTROLLARE = "Senza indirizzo";
export const ORDINI_LOCALI = [
  ["nome", "Nome"],
  ["tipo", "Tipo"],
  ["zona", "Quartiere"],
  ["citta", "Città"],
];
export const isEstero = (r) => Boolean(text(r?.paese)) && normalize(r.paese) !== "italia";

export function gruppiLocali(restaurants, per = "zona") {
  if (per === "nome") {
    const list = [...restaurants].sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
    return list.length ? [{ key: "nome", label: "", list }] : [];
  }
  const m = new Map();
  for (const r of restaurants) {
    const controllare = per === "zona" && !r.streets?.length && r.cercato;
    // Locali fuori dall'Italia: per quartiere un gruppo per paese, sempre dopo quelli italiani.
    const estero = per !== "tipo" && !controllare && isEstero(r);
    const label =
      per === "tipo"
        ? TIPI_LOCALE[r.tipo]?.plurale || "Ristoranti"
        : per === "citta"
          ? r.citta || SENZA_CITTA
          : controllare
            ? DA_CONTROLLARE
            : estero
              ? r.paese
              : r.zona || r.citta || SENZA_ZONA;
    const k = normalize(label);
    if (!m.has(k)) m.set(k, { key: k, label, list: [], ...(controllare ? { controllare: true } : {}), ...(estero ? { estero: true } : {}) });
    m.get(k).list.push(r);
  }
  const posto = (g) => (g.controllare ? 3 : g.label === SENZA_ZONA || g.label === SENZA_CITTA ? 2 : g.estero ? 1 : 0);
  // In ordine alfabetico; poi i paesi esteri, "Senza quartiere/città" e "Via da controllare" in fondo.
  return [...m.values()].sort((a, b) => posto(a) - posto(b) || a.label.localeCompare(b.label, "it", { sensitivity: "base" }));
}

// Gruppi tenuti come erano (fermi: [{ key, label, list: [chiavi] }]) con i dati
// aggiornati dei locali; un locale nuovo va nel gruppo che avrebbe, se c'è.
export function gruppiFermi(fermi, nuovi) {
  const dove = new Map();
  for (const g of nuovi) for (const r of g.list) dove.set(r.key, { r, label: g.key });
  const visti = new Set();
  const out = fermi.map((g) => ({
    ...g,
    list: g.list.map((k) => (visti.add(k), dove.get(k)?.r)).filter(Boolean),
  }));
  for (const [k, { r, label }] of dove) {
    if (!visti.has(k)) out.find((g) => g.key === label)?.list.push(r);
  }
  return out.filter((g) => g.list.length);
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
      // Dalla versione 3: si rifanno anche i locali con la via ma senza
      // quartiere (l'AI non aveva risposto).
      const v = Number(p.zona_v) || 0;
      // E i locali di cui non si è ancora cercato il paese.
      const needZona = v < 2 || (v < ZONA_V && !text(p.zona) && hasStreet(queryOf(item, index))) || typeof p.paese !== "string";
      if (!needStreet && !needZona) return;
      const key = normalize(p.name);
      // Si cerca con la via scritta a mano, altrimenti con l'indirizzo letto
      // dall'AI (non con una via trovata prima, che potrebbe essere sbagliata).
      const e = m.get(key) || { name: text(p.name), address: queryOf(item, index), targets: [] };
      e.targets.push({ id: item.id, index, name: text(p.name) });
      m.set(key, e);
    });
    // Le altre sedi scritte a mano: il quartiere di ognuna, una volta.
    places.forEach((p, index) => {
      if (!p || p.kind !== "ristorante" || !text(p.name) || !p.manual) return;
      placeAddresses(p)
        .slice(1)
        .forEach((sede) => {
          if (typeof p.zone_sedi?.[sede] === "string") return;
          const key = `${normalize(p.name)}|${normalize(sede)}`;
          const e = m.get(key) || { name: text(p.name), address: sede, sede, targets: [] };
          e.targets.push({ id: item.id, index, name: text(p.name), sede });
          m.set(key, e);
        });
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
// col nome comune dato dall'AI; 3: si rifanno i locali con la via ma senza quartiere).
export const ZONA_V = 3;

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
    // Paese ("" = cercato, non trovato), per mettere in fondo i locali esteri.
    if (text(found?.paese)) out.paese = text(found.paese);
    else if (!found?.riprova && typeof out.paese !== "string") out.paese = "";
    // L'AI non ha risposto: il quartiere si richiede la prossima volta.
    if (found?.riprova) {
      delete out.zona_at;
      delete out.zona_v;
      return { ...out, geo_at: at };
    }
    return { ...out, geo_at: at, zona_at: at, zona_v: ZONA_V };
  });
  return { ai: { ...item.ai, places: next } };
}

// Quartiere di una sede in più di un locale (found = { zona } o null), salvato in
// zone_sedi[sede] ("" = cercato, non trovato); null se la sede non c'è più.
export function sedePatch(item, index, name, sede, found) {
  const places = item.ai?.places;
  const p = Array.isArray(places) ? places[index] : null;
  if (!p || text(p.name) !== name || !placeAddresses(p).slice(1).includes(sede)) return null;
  if (found?.riprova && !text(found.zona)) return null;
  const next = places.map((x, i) => (i === index ? { ...x, zone_sedi: { ...(x.zone_sedi || {}), [sede]: text(found?.zona) } } : x));
  return { ai: { ...item.ai, places: next } };
}

// Righe della lista Ristoranti: un locale con più sedi scritte a mano diventa
// una riga per sede, ognuna con la sua via e il suo quartiere (e la sua città).
export function righeLocali(restaurants) {
  return restaurants.flatMap((r) => {
    if (!r.manual || r.streets.length < 2) return [{ ...r, tutte: r.streets }];
    return r.streets.map((sede, i) => ({
      ...r,
      key: `${r.key}#${i}`,
      streets: [sede],
      tutte: r.streets,
      sede,
      address: sede,
      zona: i === 0 ? r.zona : text(r.zoneSedi?.[sede]),
      citta: cittaDi(sede),
    }));
  });
}

// Scelte dei Filtri della pagina Ristoranti (in ordine alfabetico), con quanti locali (righe) ha ognuna:
// { tipi: [[tipo, etichetta, n]], zone: [[quartiere, n]], citta: [[città, n]] }.
export function opzioniLocali(restaurants) {
  const righe = righeLocali(restaurants);
  const conta = (f) => {
    const m = new Map();
    for (const r of righe) if (f(r)) m.set(f(r), (m.get(f(r)) || 0) + 1);
    return [...m].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "it", { sensitivity: "base" }));
  };
  const tipi = conta((r) => r.tipo)
    .map(([k, n]) => [k, (TIPI_LOCALE[k] || TIPI_LOCALE.ristorante).label, n])
    .sort((a, b) => a[1].localeCompare(b[1], "it", { sensitivity: "base" }));
  return { tipi, zone: conta((r) => r.zona), citta: conta((r) => r.citta) };
}

// Righe che passano i Filtri della pagina Ristoranti (tipo, quartiere, città).
export function filtraRighe(righe, { tipo = "", zona = "", citta = "" } = {}) {
  return righe.filter((r) => (!tipo || r.tipo === tipo) && (!zona || r.zona === zona) && (!citta || r.citta === citta));
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
    // Sempre "Via e civico, Città" (senza CAP, provincia, nazione).
    const t = formatVia(text(v)).slice(0, 200);
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
      for (const f of ["street", "sedi", "manual", "geo_at", "zona", "zona_at", "zona_v", "zone_sedi", "paese"]) delete rest[f];
      return list.length ? { ...rest, street: list[0], sedi: list, manual: true, geo_at: now.toISOString() } : rest;
    });
    out.push({ id: item.id, patch: { ai: { ...item.ai, places: next } } });
  }
  return out;
}

// Rifà la ricerca di via e quartiere di un locale (pulsante nella scheda):
// toglie quartiere e paese trovati; la via scritta a mano resta, quella
// trovata da OpenStreetMap si cerca di nuovo.
export function resetGeoPatches(items, name) {
  const key = normalize(name);
  const out = [];
  for (const item of items) {
    const places = Array.isArray(item.ai?.places) ? item.ai.places : [];
    if (!places.some((p) => p && p.kind === "ristorante" && normalize(text(p.name)) === key)) continue;
    const next = places.map((p) => {
      if (!p || p.kind !== "ristorante" || normalize(text(p.name)) !== key) return p;
      const rest = { ...p };
      for (const f of ["zona", "zona_at", "zona_v", "zone_sedi", "paese"]) delete rest[f];
      if (!p.manual) for (const f of ["street", "geo_at"]) delete rest[f];
      return rest;
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
        m.set(key, { key, name: text(p.name), addresses, manual, items: [item], tipo: text(p.tipo), zona: text(p.zona), paese: text(p.paese), zoneSedi: p.zone_sedi || {}, cercato: Boolean(p.geo_at) });
        continue;
      }
      if (!e.items.includes(item)) e.items.push(item);
      if (p.geo_at) e.cercato = true;
      if (!TIPI_LOCALE[e.tipo] && text(p.tipo)) e.tipo = text(p.tipo);
      if (!e.paese && text(p.paese)) e.paese = text(p.paese);
      // Le sedi scritte a mano vincono; poi un indirizzo con la via su uno solo con la città.
      if ((manual && !e.manual) || (!e.manual && !manual && !e.addresses.some(hasStreet) && addresses.some(hasStreet))) {
        e.addresses = addresses;
        e.manual = manual;
        e.zona = text(p.zona) || e.zona;
        e.zoneSedi = p.zone_sedi || {};
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

// Link scritto in un campo, anche attaccato al testo prima (incollando in un
// campo di una riga, il ritorno a capo tra nome e link può sparire).
export function linkIn(v) {
  const m = String(v || "").match(/https?:\/\/\S+/i);
  return m ? extractUrl(m[0]) : null;
}
