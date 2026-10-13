// Funzioni pure per arricchire un elemento (usate sia dall'app sia dal
// server per i salvataggi in background): nessuna dipendenza dal browser.

import { cleanList } from "./item.js";

export const TRANSCRIPT_SOURCE = "trascrizione incollata da te";

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
  // La trascrizione incollata a mano non viene sostituita da una nuova lettura.
  if (item.text_source === TRANSCRIPT_SOURCE) {
    delete patch.extracted_text;
    delete patch.text_source;
  }
  // Mai sovrascrivere titolo e descrizione inseriti a mano.
  if (!item.title && r.title) patch.title = r.title;
  if (!item.description && r.description) patch.description = r.description;
  if (r.place) {
    patch.place = r.place;
    if (!item.title && r.place.name) patch.title = r.place.name;
  }
  return patch;
}

// Un lavoro in background calcola la patch sull'elemento letto all'inizio
// (`before`); intanto l'utente può averlo modificato. Prima di scrivere si
// riparte dall'elemento attuale (`fresh`): titolo, descrizione e trascrizione
// cambiati nel frattempo restano, categorie e tag dell'AI si aggiungono ai
// suoi, e se ha già rigenerato le proposte dell'AI si tengono le sue.
// Restituisce null se l'elemento non esiste più.
export function rebasePatch(fresh, before, patch) {
  if (!fresh) return null;
  const out = { ...patch };
  if ((fresh.title || null) !== (before.title || null)) delete out.title;
  if ((fresh.description || null) !== (before.description || null)) delete out.description;
  if (fresh.text_source === TRANSCRIPT_SOURCE) {
    delete out.extracted_text;
    delete out.text_source;
  }
  if (out.ai) {
    if ((fresh.ai?.generated_at || null) !== (before.ai?.generated_at || null)) {
      delete out.ai;
      delete out.categories;
      delete out.tags;
    } else if (out.ai.applied) {
      out.categories = cleanList([...(fresh.categories || []), ...(out.ai.categories || [])], 10);
      out.tags = cleanList([...(fresh.tags || []), ...(out.ai.tags || [])]).map((t) => t.toLowerCase());
    }
  }
  return out;
}

export function hasContent(item) {
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
