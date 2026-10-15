// Salva subito foto, video e file scelti dal pulsante + della barra: uno per volta,
// come da Aggiungi (testo estratto dai PDF e dai file di testo, immagini lette
// dall'AI dopo il salvataggio). Restituisce quanti sono stati salvati e gli errori.
import { extractFileText, fileMime, isImage, isVideo, validateFile, withMime } from "./files.js";

export async function saveFiles(files, add) {
  const saved = [];
  const errors = [];
  for (const f of files) {
    const err = validateFile(f);
    if (err) {
      errors.push(`${f.name || "File"}: ${err}`);
      continue;
    }
    try {
      const upload = withMime(f);
      const ex = await extractFileText(upload);
      const item = {
        title: null,
        note: null,
        categories: [],
        tags: [],
        type: isImage(fileMime(upload)) ? "image" : isVideo(fileMime(upload)) ? "video" : "file",
        extracted_text: ex.text,
        text_source: ex.source,
        status: ex.status,
        status_detail: ex.detail,
        processed_at: new Date().toISOString(),
      };
      saved.push(await add(item, upload));
    } catch (e) {
      errors.push(`${f.name || "File"}: ${e.message || "salvataggio non riuscito"}`);
    }
  }
  return { saved, errors };
}

export function uploadMessage({ saved, errors }) {
  if (!saved.length) return errors[0] || "Nessun file salvato";
  const ok = saved.length === 1 ? "Salvato nell'archivio" : `${saved.length} salvati nell'archivio`;
  return errors.length ? `${ok}; ${errors.length === 1 ? "1 non salvato" : `${errors.length} non salvati`}` : ok;
}
