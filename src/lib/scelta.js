// Scelta di cosa far leggere all'AI per una domanda: il contenuto completo di
// tutto l'archivio se ci sta, altrimenti quello degli elementi più vicini alla
// domanda e le schede brevi degli altri. Senza dipendenze dal browser: la usa
// anche il server, che prepara le domande sull'archivio sincronizzato.
import { retrieveForQuestion } from "./search.js";

// Tutto l'archivio per intero se ci sta (circa 65.000 token, al massimo 400
// elementi come sul server).
const FULL_CHARS = 240_000;
const FULL_ITEMS = 400;
const FULL_TEXT = 12_000;
// Archivio più grande: contenuto completo di alcuni elementi, schede degli altri.
const DETAILS = 10;
const PART_TEXT = 8_000;
export const MEMORY_CHARS = 200_000;
const cut = (s, n) => (typeof s === "string" ? s.slice(0, n) : null);
const byDateDesc = (a, b) => new Date(b.created_at) - new Date(a.created_at);
const sizeOf = (list) => list.reduce((n, e) => n + JSON.stringify(e).length + 1, 0);

const strings = (v, n, each) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, n).map((x) => x.slice(0, each)) : []);
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)));

// Posti del contenuto con il loro indirizzo migliore (per percorsi e link a Maps).
function placesOf(ai, max) {
  return (Array.isArray(ai.places) ? ai.places : [])
    .filter((p) => p && p.hidden !== true && typeof p.name === "string" && p.name.trim())
    .slice(0, max)
    .map((p) => compact({ name: cut(p.name, 120), address: cut((Array.isArray(p.sedi) && p.sedi[0]) || p.street || p.address || "", 200) }));
}

// Scheda breve di un elemento: corta, così ci stanno centinaia di elementi.
export function memoryEntry(item) {
  const ai = item.ai || {};
  const digested = Boolean(ai.summary || ai.points?.length);
  return compact({
    id: item.id,
    type: item.type,
    title: cut(item.title, 160),
    author: cut(item.author, 200),
    site_name: cut(item.site_name, 60),
    published_at: cut(item.published_at, 10),
    created_at: cut(item.created_at, 10),
    ai: compact({
      summary: cut(ai.summary, 350),
      points: strings(ai.points, 3, 160),
      entities: strings((Array.isArray(ai.entities) ? ai.entities : []).map((e) => e?.name), 8, 50),
      keywords: strings(ai.keywords, 12, 30),
      places: placesOf(ai, 3),
    }),
    place: item.place?.name ? { name: cut(item.place.name, 120) } : null,
    note: cut(item.note, 200),
    // Se l'AI non l'ha ancora rielaborato: l'inizio di didascalia e testo.
    description: digested ? null : cut(item.description, 200),
    extracted_text: digested ? null : cut(item.extracted_text, 300),
  });
}

// Contenuto completo di un elemento.
export function detailEntry(item, textChars = PART_TEXT) {
  const ai = item.ai || {};
  return compact({
    id: item.id,
    type: item.type,
    url: item.url,
    title: item.title,
    author: item.author,
    site_name: item.site_name,
    published_at: item.published_at,
    created_at: item.created_at,
    description: cut(item.description, Math.max(1500, textChars)),
    note: cut(item.note, textChars),
    place: item.place?.name ? { name: item.place.name } : null,
    categories: item.categories,
    tags: item.tags,
    ai: compact({
      summary: ai.summary,
      points: Array.isArray(ai.points) ? ai.points : null,
      entities: Array.isArray(ai.entities) ? ai.entities : null,
      keywords: Array.isArray(ai.keywords) ? ai.keywords : null,
      places: placesOf(ai, 8),
    }),
    text_source: item.text_source,
    extracted_text: cut(item.extracted_text, textChars),
  });
}

// Schede da inviare: prima gli elementi più vicini alla domanda, poi tutti
// gli altri dal più recente, entro il limite.
export function memoryFor(items, ranked, budget = MEMORY_CHARS) {
  const first = new Set(ranked.map((i) => i.id));
  const ordered = [...ranked, ...items.filter((i) => !first.has(i.id)).sort(byDateDesc)];
  const out = [];
  let size = 0;
  for (const it of ordered) {
    const e = memoryEntry(it);
    const n = JSON.stringify(e).length;
    if (size + n > budget) break;
    size += n;
    out.push(e);
  }
  return out;
}

// Elementi da leggere per intero (id): i più vicini alla domanda per
// significato (`near`) e quelli con le sue parole (`words`), alternati; chi è
// in tutte e due le liste sale, a parità prima il significato. Le fonti più
// recenti della conversazione (`prev`) ci sono sempre.
export function pickDetails(near, words, prev = [], max = DETAILS) {
  const score = new Map();
  const add = (list, weight) => list.forEach((id, i) => score.set(id, (score.get(id) || 0) + weight / (i + 2)));
  add(near, 1.01);
  add(words, 1);
  const mixed = [...score.keys()].sort((a, b) => score.get(b) - score.get(a));
  const keep = new Set(prev);
  return [...new Set([...mixed.filter((id) => !keep.has(id)).slice(0, Math.max(0, max - prev.length)), ...prev, ...mixed])].slice(0, max);
}


// Cosa mandare all'AI. `near`: id trovati per significato (dal più vicino);
// `history`: turni precedenti con le loro fonti; `memoryBudget`: spazio delle
// schede brevi (Infinity = tutte, in ordine: le taglia chi prepara il prompt).
// → { details, memory, full }
export function scegliPerDomanda(items, question, { history = [], near = [], memoryBudget = MEMORY_CHARS } = {}) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const full = items.map((it) => detailEntry(it, FULL_TEXT));
  if (items.length <= FULL_ITEMS && sizeOf(full) <= FULL_CHARS) return { details: full, memory: [], full: true };
  const ranked = retrieveForQuestion(items, question, items.length);
  const words = (history.length ? retrieveForQuestion(items, [question, history.at(-1).q].join(" "), items.length) : ranked).map((i) => i.id);
  const vicini = near.filter((id) => byId.has(id));
  // Le fonti più recenti della conversazione restano sempre tra quelle lette.
  const prev = [...new Set([...history].reverse().flatMap((t) => t.sources || []))].filter((id) => byId.has(id)).slice(0, 4);
  const chosen = pickDetails(vicini, words, prev);
  const details = chosen.map((id) => detailEntry(byId.get(id), PART_TEXT));
  const inDetails = new Set(chosen);
  const others = items.filter((i) => !inDetails.has(i.id));
  const first = [...new Set([...vicini, ...words])].filter((id) => !inDetails.has(id)).map((id) => byId.get(id));
  return { details, memory: memoryFor(others, first, memoryBudget), full: false };
}
