// Domanda sull'archivio: recupero nel browser degli elementi pertinenti e,
// se l'AI è attiva, risposta di Gemini basata SOLO su quegli elementi.
import { retrieveForQuestion } from "./search.js";
import { aiPayload } from "./enrich.js";
import { api } from "./api.js";

// Risultato: { kind, answer?, sources: [id], candidates: [id], error? }
//   kind: "answer" | "insufficient" | "none" | "noai" | "error"
export async function askArchive(items, question, { ai }) {
  const candidates = retrieveForQuestion(items, question, 12);
  const ids = candidates.map((c) => c.id);
  if (!candidates.length) return { kind: "none", sources: [], candidates: [] };
  if (!ai) return { kind: "noai", sources: [], candidates: ids };
  try {
    const r = await api.ask(question, candidates.map(aiPayload));
    const sources = r.sources.filter((id) => ids.includes(id));
    return { kind: r.sufficient ? "answer" : "insufficient", answer: r.answer, sources, candidates: ids };
  } catch (e) {
    return { kind: "error", error: e.message, sources: [], candidates: ids };
  }
}
