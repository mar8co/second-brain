// Domanda alla memoria, come NotebookLM. Senza AI: elementi pertinenti
// trovati nel browser. Con l'AI: Gemini legge il contenuto completo di tutto
// l'archivio, se ci sta; altrimenti quello degli elementi più vicini alla
// domanda (per significato e per parole, scelti qui senza un'altra chiamata
// all'AI) e le schede brevi di tutti gli altri (la "memoria": sintesi, punti
// chiave, autore, parole chiave). Risponde SOLO con i contenuti salvati e cita
// le fonti con [n]; la risposta arriva parola per parola.
// Le domande di seguito ("e quanto costa?") portano con sé i turni precedenti.
import { retrieveForQuestion } from "./search.js";
import { api } from "./api.js";

// Tutto l'archivio per intero se ci sta (circa 65.000 token, al massimo 400
// elementi come sul server).
const FULL_CHARS = 240_000;
const FULL_ITEMS = 400;
const FULL_TEXT = 12_000;
// Archivio più grande: contenuto completo di alcuni elementi, schede degli altri.
const DETAILS = 10;
const PART_TEXT = 8_000;
const MEMORY_CHARS = 200_000;
// Domande di seguito: gli ultimi turni dell'ultima ora.
const HISTORY_TURNS = 4;
const HISTORY_MS = 60 * 60_000;
// Ricerca per significato: oltre questo tempo la domanda parte con le sole
// parole in comune, senza aspettarla.
const SEMANTIC_MS = 3000;

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

function withTimeout(promise, ms) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("tempo scaduto")), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// Turni precedenti della chat (dal più vecchio), per le domande di seguito:
// solo risposte arrivate, al massimo un'ora prima della domanda nuova.
// log: [{ at, q, result: { kind, answer, sources } }]
export function recentTurns(log, now = Date.now()) {
  const out = [];
  let after = now;
  for (const m of [...log].reverse()) {
    const at = Date.parse(m?.at || "");
    if (!Number.isFinite(at) || after - at > HISTORY_MS) break;
    after = at;
    const r = m.result;
    if (!m.q || !r || (r.kind !== "answer" && r.kind !== "insufficient")) continue;
    out.unshift({ q: m.q, a: r.answer || "", sources: Array.isArray(r.sources) ? r.sources : [] });
    if (out.length >= HISTORY_TURNS) break;
  }
  return out;
}

// Risultato: { kind, answer?, sources: [id], quotes: { id: estratto }, candidates: [id], consulted?, total?, error? }
//   kind: "answer" | "insufficient" | "none" | "noai" | "error"
//   Nella risposta [n] è la fonte sources[n - 1].
// onPartial (facoltativa): la risposta mentre arriva, { answer, sources },
// con le citazioni già numerate come nella risposta finale.
export async function askArchive(items, question, { ai, history = [], semantic = null, onPartial = null }) {
  const ranked = retrieveForQuestion(items, question, items.length);
  const ids = ranked.slice(0, 12).map((c) => c.id);
  if (!ai) return ranked.length ? { kind: "noai", sources: [], candidates: ids } : { kind: "none", sources: [], candidates: [] };
  if (!items.length) return { kind: "none", sources: [], candidates: [] };
  const turns = history.map(({ q, a }) => ({ q, a }));
  const byId = new Map(items.map((i) => [i.id, i]));
  try {
    let details = items.map((it) => detailEntry(it, FULL_TEXT));
    let memory = [];
    if (items.length > FULL_ITEMS || sizeOf(details) > FULL_CHARS) {
      // Archivio grande: per intero gli elementi più vicini alla domanda (anche
      // a quella precedente), più le fonti della risposta precedente; degli
      // altri le schede brevi, prima i più vicini.
      const words = (history.length ? retrieveForQuestion(items, [question, history.at(-1).q].join(" "), items.length) : ranked).map((i) => i.id);
      let near = [];
      if (semantic) {
        try {
          near = ((await withTimeout(Promise.resolve(semantic(question)), SEMANTIC_MS)) || []).filter((id) => byId.has(id));
        } catch {
          /* ricerca per significato non disponibile o lenta: restano le parole della domanda */
        }
      }
      // Le fonti più recenti della conversazione restano sempre tra quelle lette.
      const prev = [...new Set([...history].reverse().flatMap((t) => t.sources))].filter((id) => byId.has(id)).slice(0, 4);
      const chosen = pickDetails(near, words, prev);
      details = chosen.map((id) => detailEntry(byId.get(id), PART_TEXT));
      const inDetails = new Set(chosen);
      const others = items.filter((i) => !inDetails.has(i.id));
      const first = [...new Set([...near, ...words])].filter((id) => !inDetails.has(id)).map((id) => byId.get(id));
      memory = memoryFor(others, first);
    }
    const onDelta = onPartial ? (d) => onPartial({ answer: String(d?.answer || ""), sources: Array.isArray(d?.sources) ? d.sources.filter((id) => typeof id === "string") : [] }) : null;
    const r = await api.ask(question, details, memory, items.length, turns, onDelta);
    const sources = (r.sources || []).filter((s) => typeof s?.id === "string");
    return {
      kind: r.sufficient ? "answer" : "insufficient",
      answer: r.answer,
      ...(r.aiuto ? { aiuto: r.aiuto } : {}),
      azioni: Array.isArray(r.azioni) ? r.azioni.filter((a) => a && typeof a.url === "string" && /^https:\/\/www\.google\.com\//.test(a.url)).slice(0, 3) : [],
      sources: sources.map((s) => s.id),
      quotes: Object.fromEntries(sources.filter((s) => s.quote).map((s) => [s.id, s.quote])),
      candidates: ids,
      consulted: Math.min(Number(r.consulted) || details.length + memory.length, items.length),
      total: items.length,
    };
  } catch (e) {
    return { kind: "error", error: e.message, sources: [], candidates: ids };
  }
}
