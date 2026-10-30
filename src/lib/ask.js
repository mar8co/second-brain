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

import { detailEntry, memoryEntry, memoryFor, pickDetails, scegliPerDomanda } from "./scelta.js";

export { detailEntry, memoryEntry, memoryFor, pickDetails };

// Domande di seguito: gli ultimi turni dell'ultima ora.
const HISTORY_TURNS = 4;
const HISTORY_MS = 60 * 60_000;
// Ricerca per significato: oltre questo tempo la domanda parte con le sole
// parole in comune, senza aspettarla.
const SEMANTIC_MS = 3000;

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
// `server`: con l'archivio sincronizzato la domanda la prepara il server, che
// legge l'archivio dal database: dal telefono parte solo la domanda.
export async function askArchive(items, question, { ai, history = [], semantic = null, onPartial = null, server = false }) {
  const ranked = retrieveForQuestion(items, question, items.length);
  const ids = ranked.slice(0, 12).map((c) => c.id);
  if (!ai) return ranked.length ? { kind: "noai", sources: [], candidates: ids } : { kind: "none", sources: [], candidates: [] };
  if (!items.length) return { kind: "none", sources: [], candidates: [] };
  const turns = history.map(({ q, a }) => ({ q, a }));
  try {
    let details = [];
    let memory = [];
    if (!server) {
      let near = [];
      if (semantic) {
        try {
          near = (await withTimeout(Promise.resolve(semantic(question)), SEMANTIC_MS)) || [];
        } catch {
          /* ricerca per significato non disponibile o lenta: restano le parole della domanda */
        }
      }
      ({ details, memory } = scegliPerDomanda(items, question, { history, near }));
    }
    const onDelta = onPartial ? (d) => onPartial({ answer: String(d?.answer || ""), sources: Array.isArray(d?.sources) ? d.sources.filter((id) => typeof id === "string") : [] }) : null;
    const r = server
      ? await api.askArchive(question, history.map(({ q, a, sources }) => ({ q, a, sources })), onDelta)
      : await api.ask(question, details, memory, items.length, turns, onDelta);
    const total = server && Number(r.total) > 0 ? Number(r.total) : items.length;
    const sources = (r.sources || []).filter((s) => typeof s?.id === "string");
    return {
      kind: r.sufficient ? "answer" : "insufficient",
      answer: r.answer,
      ...(r.aiuto ? { aiuto: r.aiuto } : {}),
      azioni: Array.isArray(r.azioni) ? r.azioni.filter((a) => a && typeof a.url === "string" && /^https:\/\/www\.google\.com\//.test(a.url)).slice(0, 3) : [],
      sources: sources.map((s) => s.id),
      quotes: Object.fromEntries(sources.filter((s) => s.quote).map((s) => [s.id, s.quote])),
      candidates: ids,
      consulted: Math.min(Number(r.consulted) || details.length + memory.length, total),
      total,
    };
  } catch (e) {
    return { kind: "error", error: e.message, sources: [], candidates: ids };
  }
}
