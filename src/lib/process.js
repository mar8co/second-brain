// Elaborazione di un elemento dopo il salvataggio: lettura del link (server)
// ed eventuali proposte dell'AI. Ogni passaggio aggiorna lo stato visibile.
//
// I dati letti dalla fonte riempiono i campi "verificati" (titolo,
// descrizione, testo estratto) senza sovrascrivere ciò che l'utente ha scritto;
// le proposte dell'AI finiscono solo nel campo `ai`.

import { api } from "./api.js";

export function extractionPatch(item, r) {
  const patch = {
    final_url: r.finalUrl || null,
    site_name: r.siteName || null,
    image_url: r.image || null,
    extracted_text: r.text || null,
    text_source: r.textSource || null,
    status: r.status,
    status_detail: r.detail || null,
    processed_at: new Date().toISOString(),
  };
  // Mai sovrascrivere titolo e descrizione inseriti a mano.
  if (!item.title && r.title) patch.title = r.title;
  if (!item.description && r.description) patch.description = r.description;
  if (r.place) {
    patch.place = r.place;
    if (!item.title && r.place.name) patch.title = r.place.name;
  }
  return patch;
}

function hasContent(item) {
  return Boolean(item.title || item.description || item.note || item.extracted_text);
}

// Payload ridotto per l'AI: solo i campi utili, testo già troncato.
export function aiPayload(item) {
  return {
    id: item.id,
    type: item.type,
    url: item.url,
    title: item.title,
    description: item.description,
    note: item.note,
    extracted_text: (item.extracted_text || "").slice(0, 6000),
    place: item.place,
    categories: item.categories,
    tags: item.tags,
    created_at: item.created_at,
  };
}

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
