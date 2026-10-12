// Elaborazione di un elemento dopo il salvataggio: lettura del link (server)
// ed eventuali proposte dell'AI. Ogni passaggio aggiorna lo stato visibile.
//
// I dati letti dalla fonte riempiono i campi "verificati" (titolo,
// descrizione, testo estratto) senza sovrascrivere ciò che l'utente ha scritto;
// le proposte dell'AI finiscono solo nel campo `ai`.

import { api } from "./api.js";
import { aiPayload, extractionPatch, hasContent } from "./enrich.js";

export { aiPayload, extractionPatch };

export async function classifyItem(item, { store, categories }) {
  const r = await api.classify(aiPayload(item), categories);
  return store.update(item.id, {
    ai: { summary: r.summary, categories: r.categories, tags: r.tags, model: r.model, generated_at: new Date().toISOString() },
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
      cur = await classifyItem(cur, { store, categories });
      onUpdate(cur);
    } catch {
      /* le proposte AI sono facoltative: l'elemento resta valido senza */
    }
  }
  return cur;
}
