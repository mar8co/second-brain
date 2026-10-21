// Link dentro il testo delle risposte della chat: con https://, con www. oppure
// scritti senza protocollo (developer.apple.com/design).
const TLD = "com|it|org|net|io|app|dev|eu|co|info|edu|gov|me|ai|tv|ly|uk|de|fr|es|ch|us|xyz";
export const LINK_SOURCE = `(?:https?:\\/\\/|www\\.)[^\\s<>()\\[\\]]+|\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLD})\\b(?:\\/[^\\s<>()\\[\\]]*)?`;

// Toglie la punteggiatura finale che non fa parte dell'indirizzo ("…/design.").
// Restituisce l'indirizzo, l'href da aprire e il resto da lasciare come testo.
export function linkParts(raw) {
  const m = /[.,;:!?'"»]+$/.exec(raw);
  const url = m ? raw.slice(0, m.index) : raw;
  const rest = m ? m[0] : "";
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return { url, href, rest };
}

export function isLink(part) {
  return new RegExp(`^(?:${LINK_SOURCE})$`, "i").test(part);
}
