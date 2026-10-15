// Colori pieni delle linee guida. Ogni elemento dell'archivio ha il suo colore,
// sempre lo stesso (ricavato dall'id): lo stesso nella lista e nella sua scheda.
export const PAGE = {
  chat: "var(--rosa)",
  archive: "#ffffff",
  settings: "var(--giallo)",
  add: "#efede8", // grigio chiaro fisso, anche col tema scuro del telefono
};

export const ITEM_COLORS = ["var(--giallo)", "var(--grigio)", "var(--verde)", "#ffffff", "var(--arancio)", "var(--sabbia)", "var(--rosa)"];

function pick(key, palette) {
  const s = String(key || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function itemColor(item) {
  return pick(item?.id, ITEM_COLORS);
}

// Colori dei box dell'Archivio: rosso, giallo, rosa, verde, grigio, beige, nero e
// blu. Sul nero e sul blu il testo è bianco, sugli altri nero.
export const BOX_PALETTE = [
  { bg: "var(--giallo)", fg: "#0a0a0a" },
  { bg: "var(--rosa)", fg: "#0a0a0a" },
  { bg: "var(--grigio)", fg: "#0a0a0a" },
  { bg: "var(--sabbia)", fg: "#0a0a0a" },
  { bg: "var(--rosso)", fg: "#0a0a0a" },
  { bg: "var(--verde)", fg: "#0a0a0a" },
  { bg: "var(--blu)", fg: "#ffffff" },
  { bg: "#0a0a0a", fg: "#ffffff" },
];
export const BOX_FIXED = {
  ristoranti: BOX_PALETTE[4],
  eventi: BOX_PALETTE[5],
  foto: BOX_PALETTE[6],
  file: BOX_PALETTE[7],
};

// Ogni categoria ha il suo colore, sempre lo stesso.
export function categoryColor(name) {
  return pick(name, BOX_PALETTE);
}

// Stile di una scatola: sfondo, testo e testo tenue coerenti.
export function boxStyle({ bg, fg }) {
  const chiaro = fg === "#ffffff";
  return { background: bg, color: fg, "--tenue": chiaro ? "rgb(255 255 255 / 0.75)" : "rgb(10 10 10 / 0.7)", boxShadow: chiaro ? "none" : undefined };
}
