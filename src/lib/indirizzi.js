// Indirizzi tutti nello stesso formato: "Via e civico, Città".
// Si tolgono CAP, sigla della provincia e nazione; le abbreviazioni della via
// (V.le, P.za, L.go, C.so…) si scrivono per intero.

const PAESI =
  /^(italia|italy|portogallo|portugal|spagna|españa|espana|spain|francia|france|germania|germany|deutschland|svizzera|schweiz|suisse|austria|österreich|grecia|greece|croazia|hrvatska|belgio|belgique|paesi bassi|nederland|regno unito|united kingdom|uk|inghilterra|england|irlanda|ireland|stati uniti|united states|usa|messico|mexico|méxico|giappone|japan|marocco|maroc|turchia|türkiye|turkey)$/i;

const ABBREVIAZIONI = [
  [/^v\.\s*le\b\.?\s*/i, "Viale "],
  [/^p\.?\s*zz?a\b\.?\s*/i, "Piazza "],
  [/^p\.?\s*le\b\.?\s*/i, "Piazzale "],
  [/^l\.?\s*go\b\.?\s*/i, "Largo "],
  [/^c\.?\s*so\b\.?\s*/i, "Corso "],
  [/^vic\.\s*/i, "Vicolo "],
  [/^l\.?\s*re\b\.?\s*/i, "Lungotevere "],
  [/^v\.\s*/i, "Via "],
];

// CAP italiano (00153), portoghese (9225-050) e simili.
const CAP = /\b\d{4}-\d{3}\b|\b\d{5}\b/g;
const CIVICO = /^\d{1,4}\s?[a-z]?(\/\s?[a-z0-9]+)?$/i;
const VIA = /\d|^(via|viale|piazza|piazzale|corso|largo|vicolo|lungotevere|borgo|strada|salita|circonvallazione|lungomare|contrada|caminho|rua|calle|avenida|rue|street|road|avenue)\b/i;

export function formatVia(value) {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  let parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
  // La nazione non serve (il paese si sa a parte).
  parts = parts.filter((x, i) => i === 0 || !PAESI.test(x));
  // Il civico separato da una virgola va con la via.
  if (parts.length > 1 && CIVICO.test(parts[1])) parts = [`${parts[0]} ${parts[1]}`, ...parts.slice(2)];
  // La città: la parte col CAP, se c'è; con molte parti (via, zona, città,
  // regione) la penultima; altrimenti l'ultima.
  const conCap = parts.findIndex((x, i) => i > 0 && new RegExp(CAP.source).test(x));
  const pulisci = (x) =>
    x
      .replace(CAP, "")
      .replace(/\s+\(?[A-Z]{2}\)?$/, "")
      .replace(/\s+/g, " ")
      .trim();
  let via = parts[0].replace(CAP, "").trim();
  for (const [re, full] of ABBREVIAZIONI) {
    if (re.test(via)) {
      via = via.replace(re, full);
      break;
    }
  }
  via = via.replace(/\s*\bn\s*[°º.]\s*(?=\d)/gi, " ").replace(/\s+/g, " ").trim();
  const resto = parts.slice(1).map(pulisci).filter(Boolean);
  if (!resto.length) return via;
  const iCitta = conCap > 0 && pulisci(parts[conCap]) ? resto.indexOf(pulisci(parts[conCap])) : resto.length >= 3 ? resto.length - 2 : resto.length - 1;
  const citta = resto[iCitta >= 0 ? iCitta : resto.length - 1];
  // Senza via (solo un posto e la sua zona, come "Porto da Cruz, Madeira"): si lascia com'è.
  if (!VIA.test(via) && resto.length === 1) return `${via}, ${resto[0]}`;
  return citta && citta.toLowerCase() !== via.toLowerCase() ? `${via}, ${citta}` : via;
}
