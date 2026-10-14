// Domanda sull'archivio. Senza AI: elementi pertinenti trovati nel browser.
// Con l'AI: Gemini riceve la scheda breve di ogni elemento salvato (la
// "memoria": sintesi, punti chiave, autore, parole chiave) e il contenuto
// completo dei più pertinenti, e risponde SOLO con quelli. Così trova anche
// ciò che non contiene le parole della domanda ("corso di IA" → un Reel che
// parla di "workshop sull'intelligenza artificiale").
import { retrieveForQuestion } from "./search.js";
import { api } from "./api.js";

const DETAILS = 8;
// Dimensione massima delle schede inviate (circa 60.000 token, alcune
// centinaia di elementi): per archivi più grandi si inviano prima quelle con
// parole in comune con la domanda, poi le più recenti, e la chat lo dice.
const MEMORY_CHARS = 220_000;

const cut = (s, n) => (typeof s === "string" ? s.slice(0, n) : null);
const byDateDesc = (a, b) => new Date(b.created_at) - new Date(a.created_at);

const strings = (v, n, each) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, n).map((x) => x.slice(0, each)) : []);
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)));

// Scheda breve di un elemento: corta, così ci stanno centinaia di elementi.
// Il contenuto completo arriva solo per i più pertinenti (detailEntry).
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
    }),
    place: item.place?.name ? { name: cut(item.place.name, 120) } : null,
    note: cut(item.note, 200),
    // Se l'AI non l'ha ancora rielaborato: l'inizio di didascalia e testo.
    description: digested ? null : cut(item.description, 200),
    extracted_text: digested ? null : cut(item.extracted_text, 300),
  });
}

// Contenuto completo di un elemento pertinente.
export function detailEntry(item) {
  const ai = item.ai || {};
  return {
    id: item.id,
    type: item.type,
    url: item.url,
    title: item.title,
    author: item.author || null,
    site_name: item.site_name || null,
    published_at: item.published_at || null,
    created_at: item.created_at,
    description: cut(item.description, 1500),
    note: cut(item.note, 1500),
    place: item.place?.name ? { name: item.place.name } : null,
    categories: item.categories,
    tags: item.tags,
    ai: { summary: ai.summary, points: ai.points },
    text_source: item.text_source || null,
    extracted_text: cut(item.extracted_text, 5000),
  };
}

// Schede da inviare: prima gli elementi che contengono le parole della
// domanda, poi tutti gli altri dal più recente, entro il limite.
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

// Risultato: { kind, answer?, sources: [id], candidates: [id], consulted?, total?, error? }
//   kind: "answer" | "insufficient" | "none" | "noai" | "error"
export async function askArchive(items, question, { ai }) {
  const ranked = retrieveForQuestion(items, question, items.length);
  const ids = ranked.slice(0, 12).map((c) => c.id);
  if (!ai) return ranked.length ? { kind: "noai", sources: [], candidates: ids } : { kind: "none", sources: [], candidates: [] };
  if (!items.length) return { kind: "none", sources: [], candidates: [] };
  const memory = memoryFor(items, ranked);
  const consulted = { consulted: memory.length, total: items.length };
  try {
    const r = await api.ask(question, ranked.slice(0, DETAILS).map(detailEntry), memory, items.length);
    const known = new Set(items.map((i) => i.id));
    const sources = r.sources.filter((id) => known.has(id));
    return { kind: r.sufficient ? "answer" : "insufficient", answer: r.answer, sources, candidates: ids, ...consulted };
  } catch (e) {
    return { kind: "error", error: e.message, sources: [], candidates: ids };
  }
}
