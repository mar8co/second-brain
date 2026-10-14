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

export function itemColor(item) {
  const id = String(item?.id || "");
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ITEM_COLORS[h % ITEM_COLORS.length];
}
