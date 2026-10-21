// Ricerca per significato: ogni elemento con una scheda dell'AI riceve un
// vettore (Gemini Embedding, piano gratuito) calcolato dal suo testo breve.
// Serve quando l'archivio è troppo grande per essere letto per intero: le
// domande trovano anche elementi che non contengono le parole esatte.
// Il segno "ai.emb_at" dice che il vettore c'è; quando la scheda dell'AI viene
// rifatta il segno sparisce e il vettore si ricalcola.
export const EMBED_BATCH = 16;
const cut = (s, n) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

export function embeddingText(item) {
  const ai = item.ai || {};
  const parts = [
    cut(item.title, 200),
    item.author ? `di ${cut(item.author, 120)}` : "",
    cut(ai.summary, 600),
    ...(Array.isArray(ai.points) ? ai.points.slice(0, 5).map((p) => cut(p, 200)) : []),
    ...(Array.isArray(ai.entities) ? ai.entities.slice(0, 10).map((e) => cut(e?.name, 60)) : []),
    Array.isArray(ai.keywords) ? ai.keywords.slice(0, 15).join(", ") : "",
    cut(item.note, 400),
    ai.summary ? "" : cut(item.description, 400),
  ];
  return parts.filter(Boolean).join("\n").slice(0, 2400);
}

// Da indicizzare: ha una scheda dell'AI (o almeno del testo) e non ha ancora il segno.
export function needsEmbedding(item) {
  if (item.status === "processing") return false;
  if (item.ai?.emb_at) return false;
  return embeddingText(item).length >= 20;
}
