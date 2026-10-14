// Funzioni pure per arricchire un elemento (usate sia dall'app sia dal
// server per i salvataggi in background): nessuna dipendenza dal browser.

import { cleanList } from "./item.js";

export const TRANSCRIPT_SOURCE = "trascrizione incollata da te";

// prevStatus: lo stato dell'elemento prima della nuova lettura (durante la
// lettura è "processing").
export function extractionPatch(item, r, { prevStatus = item.status } = {}) {
  const patch = {
    final_url: r.finalUrl || item.final_url || null,
    site_name: r.siteName || item.site_name || null,
    image_url: r.image || item.image_url || null,
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
  } else if (item.extracted_text && (!r.text || (r.status !== "analyzed" && r.text.length < item.extracted_text.length))) {
    // Nuova lettura senza testo, o incompleta e più corta (trascrizione non
    // riuscita, post non più leggibile): resta il testo letto prima, con il
    // suo stato, e la scheda lo dice.
    delete patch.extracted_text;
    delete patch.text_source;
    patch.status = prevStatus === "analyzed" ? "analyzed" : "partial";
    patch.status_detail = r.text
      ? "Nuova lettura incompleta e più corta della precedente: resta il testo letto prima."
      : `Nuova lettura non completa, resta il testo letto in precedenza${r.detail ? `: ${r.detail}` : "."}`;
  }
  // Mai sovrascrivere titolo e descrizione inseriti a mano.
  if (!item.title && r.title) patch.title = r.title;
  if (!item.description && r.description) patch.description = r.description;
  // Chi ha pubblicato il post e quando (Instagram, TikTok, Facebook, YouTube).
  if (r.author) patch.author = r.author;
  if (r.publishedAt) patch.published_at = r.publishedAt;
  // Il posto scelto dall'utente resta. Il nome del posto diventa il titolo
  // solo per i link delle mappe (con coordinate), non per il luogo di un post.
  if (r.place && !item.place) {
    patch.place = r.place;
    if (!item.title && !r.title && r.place.name && typeof r.place.lat === "number") patch.title = r.place.name;
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
    } else if (out.ai.applied && "categories" in out) {
      // Solo se la patch assegna categorie e tag (non nelle riletture automatiche).
      out.categories = cleanList([...(fresh.categories || []), ...(out.ai.categories || [])], 10);
      out.tags = cleanList([...(fresh.tags || []), ...(out.ai.tags || [])]).map((t) => t.toLowerCase());
    }
  }
  return out;
}

// File salvato che l'AI può leggere (immagine, PDF senza testo selezionabile)
// e non ancora letto. "image" o "pages", altrimenti null.
export function unreadFile(item) {
  if (!item?.file_path || item.extracted_text) return null;
  const mime = String(item.file_mime || "").toLowerCase();
  if (/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) return "image";
  if (mime === "application/pdf") return "pages";
  return null;
}

export function hasContent(item) {
  return Boolean(item.title || item.description || item.note || item.extracted_text);
}

// Payload per la rielaborazione dell'AI: tutto ciò che si sa dell'elemento,
// testo già troncato.
export function aiPayload(item) {
  return {
    id: item.id,
    type: item.type,
    url: item.url,
    site_name: item.site_name || null,
    author: item.author || null,
    published_at: item.published_at || null,
    title: item.title,
    description: item.description,
    note: item.note,
    extracted_text: (item.extracted_text || "").slice(0, 12000),
    text_source: item.text_source || null,
    place: item.place,
    categories: item.categories,
    tags: item.tags,
    created_at: item.created_at,
  };
}

// Versione della rielaborazione dell'AI: gli elementi con una versione
// precedente (solo riassunto, categorie e tag) vengono rielaborati di nuovo.
export const DIGEST_VERSION = 2;

// Risposta della rielaborazione (server/ai.js) → campo `ai` dell'elemento.
export function aiFromDigest(r, { applied = false, now = new Date() } = {}) {
  return {
    v: DIGEST_VERSION,
    summary: r.summary || "",
    points: r.points || [],
    entities: r.entities || [],
    keywords: r.keywords || [],
    categories: r.categories || [],
    tags: r.tags || [],
    model: r.model || null,
    generated_at: now.toISOString(),
    ...(applied ? { applied: true } : {}),
  };
}

// Toglie dal dettaglio dello stato l'avviso di un'AI non riuscita in passato.
export function withoutAiFailure(detail) {
  if (!detail) return detail ?? null;
  const out = detail.replace(/\s*AI non disponibile:.*$/s, "").trim();
  return out || null;
}
