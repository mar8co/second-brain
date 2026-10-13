// Elaborazione di un elemento dopo il salvataggio: lettura del link (server)
// ed eventuali proposte dell'AI. Ogni passaggio aggiorna lo stato visibile.
//
// I dati letti dalla fonte riempiono i campi "verificati" (titolo,
// descrizione, testo estratto) senza sovrascrivere ciò che l'utente ha scritto;
// categorie e tag dell'AI vengono assegnati (con traccia in `ai.applied`).

import { api } from "./api.js";
import { aiPayload, extractionPatch, hasContent } from "./enrich.js";

export { aiPayload, extractionPatch };

// apply=true (dopo un nuovo salvataggio): categorie e tag dell'AI vengono
// assegnati subito, marcati come tali; altrimenti restano proposte.
export async function classifyItem(item, { store, categories, apply = false }) {
  const r = await api.classify(aiPayload(item), categories);
  const ai = { summary: r.summary, categories: r.categories, tags: r.tags, model: r.model, generated_at: new Date().toISOString() };
  if (!apply) return store.update(item.id, { ai });
  return store.update(item.id, {
    ai: { ...ai, applied: true },
    categories: [...(item.categories || []), ...r.categories.filter((c) => !(item.categories || []).includes(c))],
    tags: [...(item.tags || []), ...r.tags.filter((t) => !(item.tags || []).includes(t))],
  });
}

export async function processItem(item, { store, onUpdate, ai, categories = [] }) {
  let cur = item;
  if (item.url && !item.file_path) {
    cur = await store.update(item.id, { status: "processing", status_detail: null });
    onUpdate(cur);
    let patch;
    try {
      const r = await api.extract(item.url);
      patch = extractionPatch(cur, r);
    } catch (e) {
      patch = {
        status: "saved",
        status_detail: `Analisi non eseguita: ${e.message} Puoi riprovare dalla scheda.`,
        processed_at: new Date().toISOString(),
      };
    }
    cur = await store.update(item.id, patch);
    onUpdate(cur);
  }
  if (ai && hasContent(cur)) {
    try {
      cur = await classifyItem(cur, { store, categories, apply: true });
      onUpdate(cur);
    } catch {
      /* le proposte AI sono facoltative: l'elemento resta valido senza */
    }
  }
  return cur;
}
