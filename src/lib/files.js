// Validazione dei file caricati ed estrazione del testo nel browser.
// Il testo dei PDF si estrae con pdf.js (caricato solo quando serve).

import { ACCEPTED_MIME, LIMITS } from "./constants.js";
import { aiReadableImage } from "./enrich.js";

const EXT_MIME = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  pdf: "application/pdf",
  heic: "image/heic",
  heif: "image/heif",
};

// Alcuni browser non danno il MIME di .md/.heic: lo ricaviamo dall'estensione.
export function fileMime(file) {
  if (file.type) return file.type;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return EXT_MIME[ext] || "";
}

export function validateFile(file) {
  if (!file) return "Nessun file selezionato.";
  if (file.size === 0) return "Il file è vuoto.";
  if (file.size > LIMITS.fileBytes) return `File troppo grande: massimo ${Math.round(LIMITS.fileBytes / 1024 / 1024)} MB.`;
  const mime = fileMime(file);
  if (!ACCEPTED_MIME.includes(mime)) return "Tipo di file non supportato. Usa immagini, PDF o file di testo.";
  return null;
}

// Restituisce un File con il MIME corretto (serve per l'upload su Storage).
export function withMime(file) {
  const mime = fileMime(file);
  return file.type === mime ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified });
}

export const isImage = (mime) => /^image\//.test(mime || "");

// { text, source, status, detail }
export async function extractFileText(file) {
  const mime = fileMime(file);
  if (isImage(mime)) {
    const detail = aiReadableImage(mime)
      ? "Immagine conservata. Con l'AI attiva viene letta e descritta in automatico; altrimenti aggiungi una nota per ritrovarla."
      : "Immagine conservata. Il testo di questo formato di immagine non viene letto automaticamente: aggiungi una nota per ritrovarla.";
    return { text: null, source: null, status: "saved", detail };
  }
  if (/^text\/|json$/.test(mime)) {
    const text = (await file.text()).slice(0, LIMITS.textChars);
    return { text, source: "file caricato", status: text.trim() ? "analyzed" : "partial", detail: text.trim() ? null : "Il file non contiene testo." };
  }
  if (mime === "application/pdf") {
    try {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      let text = "";
      const maxPages = Math.min(doc.numPages, 50);
      for (let p = 1; p <= maxPages && text.length < LIMITS.textChars; p++) {
        const page = await doc.getPage(p);
        const c = await page.getTextContent();
        text += c.items.map((i) => i.str).join(" ") + "\n\n";
      }
      text = text.replace(/[ \t]+/g, " ").trim().slice(0, LIMITS.textChars);
      if (!text) {
        return { text: null, source: null, status: "partial", detail: "PDF senza testo selezionabile (probabilmente una scansione): con l'AI attiva viene letto in automatico." };
      }
      const partial = doc.numPages > maxPages || text.length >= LIMITS.textChars;
      return {
        text,
        source: "PDF caricato",
        status: partial ? "partial" : "analyzed",
        detail: partial ? "PDF lungo: ho letto solo la prima parte." : null,
      };
    } catch {
      return { text: null, source: null, status: "partial", detail: "Non sono riuscito a leggere il PDF (protetto o danneggiato?)." };
    }
  }
  return { text: null, source: null, status: "saved", detail: null };
}
