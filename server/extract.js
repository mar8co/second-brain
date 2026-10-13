// Core dell'endpoint POST /api/extract: legge un link e restituisce cosa è
// stato possibile ricavare, con uno stato onesto.
//
// Regole:
//  - si leggono solo dati pubblici (metadati, testo della pagina, oEmbed);
//  - niente login, cookie, CAPTCHA o trucchi per aggirare restrizioni;
//  - ogni campo restituito viene dalla fonte (dati "verificati"): l'AI non
//    interviene qui. `textSource` dice da dove arriva il testo.
//
// La trascrizione dei video social e la lettura dei caroselli sono in
// social.js, che usa questo modulo per i metadati della pagina.

import { detectType, extractUrl, isInstagram, parsePlaceFromUrl } from "../src/lib/detect.js";
import { LIMITS } from "../src/lib/constants.js";
import { cleanText, looksLikeLoginWall, parseHtml } from "./html.js";
import { FetchError, safeFetch, safeFetchJson } from "./net.js";
import { verifyRequest } from "./auth.js";

const OEMBED = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`, "YouTube"],
  [/(^|\.)vimeo\.com$/, (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`, "Vimeo"],
  [/(^|\.)tiktok\.com$/, (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`, "TikTok"],
];

function hostOf(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function clip(s, n) {
  if (!s) return null;
  const t = cleanText(s);
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function result(base, patch) {
  const r = { ...base, ...patch };
  r.title = clip(r.title, LIMITS.titleChars);
  r.description = clip(r.description, 2000);
  r.text = clip(r.text, LIMITS.textChars);
  return r;
}

const HTTP_ERRORS = {
  401: "La pagina richiede di accedere: non l'ho letta.",
  403: "Il sito non consente la lettura automatica di questa pagina.",
  404: "Pagina non trovata (404).",
  410: "Pagina rimossa (410).",
  429: "Il sito ha limitato le richieste: riprova più tardi.",
};

export async function extractUrlInfo(rawUrl, { allowPrivate = false } = {}) {
  const url = extractUrl(rawUrl);
  if (!url) return { error: "Link non valido." };
  const type = detectType(url);
  const base = {
    url,
    finalUrl: url,
    type,
    title: null,
    description: null,
    siteName: null,
    image: null,
    text: null,
    textSource: null,
    place: null,
    status: "partial",
    detail: null,
    fetchedAt: new Date().toISOString(),
  };
  const fetchOpts = { allowPrivate };

  try {
    // --- Posti (Google/Apple Maps): nome e coordinate dal link stesso ---
    if (type === "place") {
      let place = parsePlaceFromUrl(url);
      let finalUrl = url;
      if (!place?.name) {
        // Link corti (maps.app.goo.gl): seguiamo i redirect solo per leggere l'URL finale.
        const r = await safeFetch(url, { ...fetchOpts, maxBytes: 64 * 1024 });
        finalUrl = r.finalUrl;
        for (const u of [...r.redirects, r.finalUrl]) {
          const p = parsePlaceFromUrl(u);
          if (p && (p.name || !place)) place = p;
          if (place?.name) break;
        }
      }
      if (!place) {
        return result(base, {
          finalUrl,
          status: "partial",
          detail: "Link di mappe salvato, ma non sono riuscito a leggere nome o coordinate del posto.",
        });
      }
      return result(base, {
        finalUrl,
        place,
        title: place.name,
        siteName: hostOf(url).includes("apple") ? "Apple Mappe" : "Google Maps",
        textSource: "link della mappa",
        status: place.name ? "analyzed" : "partial",
        detail: place.name
          ? "Nome e posizione letti dal link della mappa; orari e recensioni non vengono letti."
          : "Ho letto solo le coordinate dal link: aggiungi tu il nome del posto.",
      });
    }

    // --- Video con oEmbed pubblico (YouTube, Vimeo, TikTok) ---
    const h = hostOf(url);
    const oe = OEMBED.find(([re]) => re.test(h));
    let oembed = null;
    if (oe) oembed = await safeFetchJson(oe[1](url), { ...fetchOpts, maxBytes: 256 * 1024 }).catch(() => null);

    // --- Pagina ---
    let page = null;
    let pageErr = null;
    try {
      page = await safeFetch(url, fetchOpts);
    } catch (e) {
      pageErr = e;
    }

    if (oembed?.title) {
      let meta = null;
      if (page?.status === 200 && page.text && /html/i.test(page.contentType)) meta = parseHtml(page.text, page.finalUrl);
      const description = meta?.description && !looksLikeLoginWall({ finalUrl: page.finalUrl, title: meta.title, text: meta.description }) ? meta.description : null;
      return result(base, {
        finalUrl: page?.finalUrl || url,
        title: oembed.title,
        description: description || (oembed.author_name ? `Di ${oembed.author_name}` : null),
        siteName: oembed.provider_name || oe[2],
        image: oembed.thumbnail_url || meta?.image || null,
        author: oembed.author_name || null,
        textSource: description ? `oEmbed ${oe[2]} + descrizione pubblica` : `oEmbed ${oe[2]}`,
        status: "partial",
        detail: "Titolo e autore letti dalla fonte pubblica. Il video non è stato trascritto: nessuna trascrizione è disponibile senza accesso all'account.",
      });
    }

    if (pageErr) throw pageErr;

    if (page.status >= 400) {
      return result(base, {
        finalUrl: page.finalUrl,
        status: "inaccessible",
        detail: HTTP_ERRORS[page.status] || `Il sito ha risposto con un errore (${page.status}).`,
      });
    }

    const ct = page.contentType.toLowerCase();
    if (!/html|xml/.test(ct)) {
      if (/^text\/plain/.test(ct) && page.text) {
        return result(base, {
          finalUrl: page.finalUrl,
          text: page.text,
          textSource: "file di testo remoto",
          status: page.truncated ? "partial" : "analyzed",
          detail: page.truncated ? "File lungo: letto solo l'inizio." : null,
        });
      }
      const kind = /pdf/.test(ct) ? "un PDF" : /^image\//.test(ct) ? "un'immagine" : /^video\//.test(ct) ? "un video" : "un file";
      return result(base, {
        finalUrl: page.finalUrl,
        status: "partial",
        detail: `Il link punta a ${kind}: l'ho salvato ma non ne ho letto il contenuto. Puoi caricarlo come file per estrarne il testo.`,
      });
    }

    const meta = parseHtml(page.text || "", page.finalUrl);
    const wall = looksLikeLoginWall({ finalUrl: page.finalUrl, title: meta.title || "", text: meta.text || meta.description || "" });

    if (isInstagram(url)) {
      // Instagram mostra il contenuto solo a chi ha fatto l'accesso: usiamo
      // solo ciò che espone pubblicamente (a volte la didascalia nei meta).
      const hasCaption = meta.description && !wall && !/^(instagram|create an account|accedi)/i.test(meta.description);
      if (!hasCaption) {
        return result(base, {
          finalUrl: page.finalUrl,
          siteName: "Instagram",
          status: "inaccessible",
          detail: "Instagram mostra questo contenuto solo dopo l'accesso: ho salvato il link. Aggiungi una nota con ciò che ricordi per ritrovarlo.",
        });
      }
      return result(base, {
        finalUrl: page.finalUrl,
        title: meta.title,
        description: meta.description,
        siteName: "Instagram",
        image: meta.image,
        textSource: "didascalia pubblica (metadati)",
        status: "partial",
        detail: "Letta la didascalia pubblica. Il video non è stato analizzato: Instagram non rende disponibili trascrizioni.",
      });
    }

    if (wall) {
      return result(base, {
        finalUrl: page.finalUrl,
        status: "inaccessible",
        detail: "La pagina richiede di accedere: ho salvato solo il link.",
      });
    }

    if (meta.text) {
      return result(base, {
        finalUrl: meta.canonicalUrl || page.finalUrl,
        title: meta.title,
        description: meta.description,
        siteName: meta.siteName,
        image: meta.image,
        text: meta.text,
        textSource: "testo della pagina",
        status: page.truncated ? "partial" : "analyzed",
        detail: page.truncated ? "Pagina molto lunga: letta solo la prima parte." : null,
      });
    }

    if (meta.title || meta.description) {
      return result(base, {
        finalUrl: meta.canonicalUrl || page.finalUrl,
        title: meta.title,
        description: meta.description,
        siteName: meta.siteName,
        image: meta.image,
        textSource: "metadati della pagina",
        status: "partial",
        detail: "Letti titolo e descrizione; il testo della pagina non è leggibile automaticamente (pagina dinamica o protetta).",
      });
    }

    return result(base, {
      finalUrl: page.finalUrl,
      status: "inaccessible",
      detail: "La pagina non espone testo o metadati leggibili.",
    });
  } catch (e) {
    if (e instanceof FetchError) {
      return result(base, { status: "inaccessible", detail: e.message });
    }
    return result(base, { status: "inaccessible", detail: "Errore imprevisto durante la lettura del link." });
  }
}

export async function handleExtract({ authHeader, body, env }) {
  const auth = await verifyRequest({ authHeader, env });
  if (!auth.ok) return { status: auth.status, json: { error: auth.error } };
  const raw = body?.url;
  if (typeof raw !== "string" || raw.length > 4000) {
    return { status: 400, json: { error: "Link mancante o troppo lungo." } };
  }
  const out = await extractUrlInfo(raw, { allowPrivate: env.EXTRACT_ALLOW_PRIVATE === "1" });
  if (out.error) return { status: 400, json: { error: out.error } };
  return { status: 200, json: out };
}
