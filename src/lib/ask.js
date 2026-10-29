// Domanda alla memoria, come NotebookLM. Senza AI: elementi pertinenti
// trovati nel browser. Con l'AI: Gemini legge il contenuto completo di tutto
// l'archivio, se ci sta; altrimenti prima sceglie dalle schede brevi (la
// "memoria": sintesi, punti chiave, autore, parole chiave) quali leggere per
// intero. Risponde SOLO con i contenuti salvati e cita le fonti con [n].
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
export async function askArchive(items, question, { ai, history = [], semantic = null }) {
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
      // Archivio grande: l'AI sceglie dalle schede cosa leggere per intero,
      // insieme alle fonti della risposta precedente e agli elementi con le
      // parole della domanda (anche di quella precedente).
      let context = history.length ? retrieveForQuestion(items, [question, history.at(-1).q].join(" "), items.length) : ranked;
      // Ricerca per significato (se disponibile): gli elementi più vicini
      // alla domanda vengono prima di quelli con le sole parole in comune.
      let near = [];
      try {
        near = ((await semantic?.(question)) || []).map((id) => byId.get(id)).filter(Boolean);
      } catch {
        /* ricerca per significato non disponibile: restano le parole della domanda */
      }
      if (near.length) {
        const seen = new Set(near.map((i) => i.id));
        context = [...near, ...context.filter((i) => !seen.has(i.id))];
      }
      memory = memoryFor(items, context);
      let picked = [];
      try {
        const r = await api.select(question, memory, turns);
        picked = (Array.isArray(r?.ids) ? r.ids : []).filter((id) => byId.has(id));
      } catch {
        /* scelta non riuscita: restano le parole della domanda */
      }
      // Le fonti più recenti della conversazione restano sempre tra quelle lette.
      const prev = [...new Set([...history].reverse().flatMap((t) => t.sources))].filter((id) => byId.has(id)).slice(0, 4);
      const chosen = [...new Set([...picked.slice(0, DETAILS - prev.length), ...prev, ...picked, ...context.map((i) => i.id)])].filter((id) => byId.has(id)).slice(0, DETAILS);
      details = chosen.map((id) => detailEntry(byId.get(id), PART_TEXT));
      const inDetails = new Set(chosen);
      memory = memory.filter((m) => !inDetails.has(m.id));
    }
    const r = await api.ask(question, details, memory, items.length, turns);
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
