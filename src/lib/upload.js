// Salva subito foto, video e file scelti dal pulsante + della barra: uno per volta,
// come da Aggiungi (testo estratto dai PDF e dai file di testo, immagini lette
// dall'AI dopo il salvataggio). Restituisce quanti sono stati salvati e gli errori.
import { extractFileText, fileMime, isImage, isVideo, validateFile, withMime } from "./files.js";

export async function saveFiles(files, add) {
  const saved = [];
  const errors = [];
  const failed = []; // i file non salvati, per riprovare
  for (const f of files) {
    const err = validateFile(f);
    if (err) {
      errors.push(`${f.name || "File"}: ${err}`);
      failed.push(f);
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
      failed.push(f);
    }
  }
  return { saved, errors, failed };
}

export function uploadMessage({ saved, errors }) {
  if (!saved.length) return errors[0] || "Nessun file salvato";
  const ok = saved.length === 1 ? "Salvato nell'archivio" : `${saved.length} salvati nell'archivio`;
  return errors.length ? `${ok}; ${errors.length === 1 ? "1 non salvato" : `${errors.length} non salvati`}` : ok;
}

// Unisce una nuova scelta a quella già in corso senza doppioni (stesso nome,
// dimensione e data di modifica): l'ordine resta quello in cui li ha scelti.
export function mergeFiles(current, incoming) {
  const key = (f) => `${f.name}|${f.size}|${f.lastModified}`;
  const seen = new Set(current.map(key));
  const out = [...current];
  for (const f of incoming) {
    if (seen.has(key(f))) continue;
    seen.add(key(f));
    out.push(f);
  }
  return out;
}
