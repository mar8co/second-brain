// Modello di un elemento dell'archivio e normalizzazione dei campi.
// La forma è la stessa della tabella `items` (snake_case), così locale e
// Supabase condividono il codice.

import { LIMITS, TYPE_KEYS, STATUS_KEYS } from "./constants.js";

export const COLUMNS = [
  "id", "type", "url", "final_url", "title", "description", "note", "site_name", "image_url",
  "extracted_text", "text_source", "place", "categories", "tags", "status", "status_detail",
  "ai", "file_path", "file_name", "file_mime", "file_size", "created_at", "updated_at", "processed_at",
];

const clip = (s, n) => (typeof s === "string" ? (s.length > n ? s.slice(0, n) : s) : s ?? null);

export function cleanList(list, max = LIMITS.maxTags) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const v = String(raw || "").trim().replace(/\s+/g, " ").slice(0, LIMITS.tagChars);
    const k = v.toLowerCase();
    if (v && !seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
    if (out.length >= max) break;
  }
  return out;
}

// Tiene solo le colonne note e applica i limiti. Usato prima di ogni scrittura.
export function sanitizeItem(patch) {
  const out = {};
  for (const k of COLUMNS) if (k in patch) out[k] = patch[k];
  if ("type" in out && !TYPE_KEYS.includes(out.type)) out.type = "link";
  if ("status" in out && !STATUS_KEYS.includes(out.status)) out.status = "saved";
  if ("title" in out) out.title = clip(out.title, LIMITS.titleChars);
  if ("description" in out) out.description = clip(out.description, 4000);
  if ("note" in out) out.note = clip(out.note, LIMITS.noteChars);
  if ("extracted_text" in out) out.extracted_text = clip(out.extracted_text, LIMITS.textChars);
  if ("categories" in out) out.categories = cleanList(out.categories, 10);
  if ("tags" in out) out.tags = cleanList(out.tags).map((t) => t.toLowerCase());
  if ("url" in out && out.url && !/^https?:\/\//i.test(out.url)) out.url = null;
  return out;
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // Fallback (contesti non sicuri): UUID v4 da getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Titolo da mostrare quando manca: mai inventato, solo ricavato da ciò che c'è.
export function displayTitle(item) {
  if (item.title) return item.title;
  if (item.place?.name) return item.place.name;
  if (item.file_name) return item.file_name;
  if (item.note) return item.note.split("\n")[0].slice(0, 80);
  if (item.url) {
    try {
      const u = new URL(item.url);
      return u.hostname.replace(/^www\./, "") + (u.pathname.length > 1 ? u.pathname : "");
    } catch {
      return item.url;
    }
  }
  return "Senza titolo";
}
