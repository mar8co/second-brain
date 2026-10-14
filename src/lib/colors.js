// Colori pieni delle linee guida. Ogni elemento dell'archivio ha il suo colore,
// sempre lo stesso (ricavato dall'id): lo stesso nella lista e nella sua scheda.
// Niente blu: vorrebbe il testo bianco.
export const PAGE = {
  chat: "var(--rosa)",
  archive: "#ffffff",
  settings: "var(--giallo)",
  add: "var(--carta)",
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

// Ogni categoria ha il suo colore, sempre lo stesso; mai il bianco, così le
// scatole si staccano dalla pagina, né arancio e verde, che sono dei box fissi
// Ristoranti ed Eventi.
const BOX_COLORS = ITEM_COLORS.filter((c) => !["#ffffff", "var(--arancio)", "var(--verde)"].includes(c));
export function categoryColor(name) {
  return pick(name, BOX_COLORS);
}
