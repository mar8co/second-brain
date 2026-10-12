// Lettura di una pagina HTML: metadati pubblici (title, Open Graph, meta
// description) e testo principale dell'articolo (Mozilla Readability).
// Funzione pura: riceve l'HTML già scaricato, non fa rete.

import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export function cleanText(s) {
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function absolutize(href, base) {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

// Riconosce le pagine che chiedono di accedere (login wall): in quel caso i
// "metadati" sono quelli della pagina di login, non del contenuto.
export function looksLikeLoginWall({ finalUrl = "", title = "", text = "" }) {
  if (/\/(accounts\/login|login|signin|sign_in)(\/|\?|$)/i.test(finalUrl)) return true;
  const t = `${title} ${text.slice(0, 400)}`.toLowerCase();
  return /\b(accedi|log in|login|sign in|iscriviti per vedere)\b/.test(t) && text.length < 600;
}

export function parseHtml(html, baseUrl) {
  const { document } = parseHTML(html);
  const meta = (key) => {
    const el =
      document.querySelector(`meta[property="${key}"]`) || document.querySelector(`meta[name="${key}"]`);
    const v = el?.getAttribute("content");
    return v ? cleanText(v) : null;
  };
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href");

  const out = {
    title: meta("og:title") || meta("twitter:title") || cleanText(document.querySelector("title")?.textContent) || null,
    description: meta("og:description") || meta("twitter:description") || meta("description") || null,
    siteName: meta("og:site_name") || null,
    image: absolutize(meta("og:image") || meta("twitter:image"), baseUrl),
    ogType: meta("og:type") || null,
    publishedAt: meta("article:published_time") || null,
    canonicalUrl: absolutize(canonical, baseUrl),
    lang: document.documentElement?.getAttribute("lang") || null,
    text: null,
  };

  // Testo principale: Readability lavora su un DOM a parte (lo modifica).
  try {
    const { document: doc2 } = parseHTML(html);
    const article = new Readability(doc2, { charThreshold: 200 }).parse();
    const text = cleanText(article?.textContent);
    if (text && text.length >= 200) out.text = text;
    if (!out.title && article?.title) out.title = cleanText(article.title);
  } catch {
    /* pagina non leggibile: restano solo i metadati */
  }
  return out;
}
