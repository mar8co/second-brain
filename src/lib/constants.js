// Vocabolario condiviso da client e server: tipi di contenuto e stati di
// elaborazione. Le chiavi sono in inglese (stabili nel DB), le etichette in
// italiano (mostrate nella UI).

export const TYPES = {
  link: { label: "Link", plural: "Link" },
  social: { label: "Social", plural: "Social" }, // Reel/post Instagram, TikTok…
  video: { label: "Video", plural: "Video" },
  place: { label: "Posto", plural: "Posti" },
  note: { label: "Nota", plural: "Note" },
  shopping: { label: "Acquisto", plural: "Acquisti" },
  image: { label: "Immagine", plural: "Immagini" },
  file: { label: "File", plural: "File" },
};

export const TYPE_KEYS = Object.keys(TYPES);

// Gli stati richiesti dalla specifica. `detail` sull'elemento spiega il perché.
export const STATUSES = {
  saved: { label: "Salvato", hint: "Conservato così com'è, senza analisi automatica." },
  processing: { label: "In elaborazione", hint: "Sto leggendo il contenuto." },
  analyzed: { label: "Analizzato", hint: "Testo e metadati letti dalla fonte." },
  partial: { label: "Analisi parziale", hint: "Letto solo in parte: vedi il dettaglio." },
  inaccessible: { label: "Non accessibile", hint: "La fonte non è leggibile senza login o è irraggiungibile." },
};

export const STATUS_KEYS = Object.keys(STATUSES);

// Categorie proposte al primo avvio: l'utente può crearne altre liberamente.
export const DEFAULT_CATEGORIES = [
  "Da leggere",
  "Ricette",
  "Viaggi",
  "Posti",
  "Tecnologia",
  "Acquisti",
  "Finanza",
  "Lavoro",
  "Formazione",
  "Salute",
  "Sport",
  "Casa",
  "Cibo",
  "Intrattenimento",
  "Ispirazione",
];

// Limiti condivisi (validati sia nel client sia sul server).
export const LIMITS = {
  fileBytes: 15 * 1024 * 1024, // 15 MB per file caricato
  videoBytes: 50 * 1024 * 1024, // 50 MB per video (massimo del piano gratuito di Supabase)
  textChars: 20_000, // testo estratto conservato per elemento
  titleChars: 300,
  noteChars: 20_000,
  tagChars: 40,
  maxTags: 20,
};

// Tipi di file accettati in upload (validazione lato client + bucket privato).
export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
];
