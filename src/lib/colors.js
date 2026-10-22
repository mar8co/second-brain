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
  { bg: "var(--arancio)", fg: "#0a0a0a" },
  { bg: "var(--rosso)", fg: "#0a0a0a" },
  { bg: "var(--rosa)", fg: "#0a0a0a" },
  { bg: "var(--blu)", fg: "#ffffff" },
  { bg: "var(--verde)", fg: "#0a0a0a" },
  { bg: "var(--sabbia)", fg: "#0a0a0a" },
  { bg: "var(--grigio)", fg: "#0a0a0a" },
  { bg: "#0a0a0a", fg: "#ffffff" },
];
export const BOX_FIXED = {
  ristoranti: BOX_PALETTE[2],
  eventi: BOX_PALETTE[5],
  foto: BOX_PALETTE[4],
  file: BOX_PALETTE[8],
};

// Le categorie prendono i colori in sequenza (giallo per prima), nell'ordine
// alfabetico di tutte le categorie dell'archivio: così ogni categoria ha un
// colore stabile e si vedono tutti i colori.
export function categoryColor(name, allNames = []) {
  const i = allNames.indexOf(name);
  return i >= 0 ? BOX_PALETTE[i % BOX_PALETTE.length] : pick(name, BOX_PALETTE);
}

// Stile di una scatola: sfondo, testo e testo tenue coerenti.
export function boxStyle({ bg, fg }) {
  const chiaro = fg === "#ffffff";
  return { background: bg, color: fg, "--tenue": chiaro ? "rgb(255 255 255 / 0.75)" : "rgb(10 10 10 / 0.7)", boxShadow: chiaro ? "none" : undefined };
}

// Colore della scheda = colore del box in cui sta l'elemento in Archivio: foto e
// video blu, file e note nero, altrimenti la sua prima categoria (alfabetica).
export function detailBox(item, allItems = []) {
  if (item.file_path) return /^(image|video)\//.test(item.file_mime || "") ? BOX_FIXED.foto : BOX_FIXED.file;
  const nomi = [...new Set(allItems.flatMap((it) => it.categories || []))].sort((a, b) => a.localeCompare(b, "it"));
  const prima = [...(item.categories || [])].sort((a, b) => a.localeCompare(b, "it"))[0];
  return prima ? categoryColor(prima, nomi) : { bg: "#ffffff", fg: "#0a0a0a" };
}
