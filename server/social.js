// Lettura completa dei post social a partire dal solo link.
//
// Instagram, TikTok e Facebook mostrano video e immagini solo dentro le loro
// app: per averli dal server usiamo Apify (servizio esterno, piano gratuito,
// chiave APIFY_TOKEN solo sul server), che restituisce didascalia e indirizzi
// pubblici dei media. Poi Gemini trascrive il video o legge le slide.
// YouTube non ha bisogno di Apify: Gemini legge il video dal link.
//
// Funziona solo con post pubblici. Tutto ciò che produce l'AI (trascrizione,
// testo delle slide, titolo) è marcato come tale in `textSource`.

import { extractUrl } from "../src/lib/detect.js";
import { aiConfigured } from "./ai.js";
import { extractUrlInfo } from "./extract.js";
import { verifyRequest } from "./auth.js";
import { imageParts, readMedia, transcribeYoutube, videoPart, youtubeUrl } from "./media.js";

const MAX_SLIDES = 20;
const SITE = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", youtube: "YouTube" };

// Parametri di tracciamento da togliere (stesso post = stesso link).
const TRACKING = /^(igsh|igshid|utm_\w+|si|_t|_r|mibextid|rdid|share_url|sender_device|is_from_webapp|fbclid)$/i;

function cleanUrl(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

// Link → { platform, url } per i post che sappiamo leggere, altrimenti null.
export function socialTarget(raw) {
  const url = extractUrl(String(raw || ""));
  if (!url) return null;
  const yt = youtubeUrl(url);
  if (yt) return { platform: "youtube", url: yt };
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, "");
  const path = u.pathname;
  if ((host === "instagram.com" || host === "instagr.am") && /^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/[\w-]+/.test(path)) {
    return { platform: "instagram", url: cleanUrl(url) };
  }
  if (host === "tiktok.com" && (/\/(video|photo)\/\d+/.test(path) || /^\/t\/\w+/.test(path))) return { platform: "tiktok", url: cleanUrl(url) };
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return { platform: "tiktok", url: cleanUrl(url) };
  if (host === "fb.watch") return { platform: "facebook", url: cleanUrl(url) };
  if (host === "facebook.com" && /^\/(reel|watch|share\/(r|v|p)|[^/]+\/videos|[^/]+\/posts|story\.php|permalink\.php)/.test(path)) {
    return { platform: "facebook", url: path.startsWith("/watch") ? url : cleanUrl(url) };
  }
  return null;
}

export function socialConfigured(env) {
  return Boolean(env.APIFY_TOKEN);
}

// ---------- Apify ----------

const ACTORS = {
  instagram: "apify~instagram-scraper",
  tiktok: "clockworks~tiktok-scraper",
  facebook: "apify~facebook-reels-scraper",
};

function actorInput(platform, url) {
  if (platform === "instagram") return { directUrls: [url], resultsType: "posts", resultsLimit: 1, addParentData: false };
  if (platform === "tiktok") {
    return { postURLs: [url], resultsPerPage: 1, shouldDownloadVideos: true, shouldDownloadSubtitles: true, shouldDownloadSlideshowImages: true, shouldDownloadCovers: false };
  }
  return { startUrls: [{ url }], resultsLimit: 1 };
}

export class SocialError extends Error {}

async function runActor({ env, platform, url, fetchImpl, timeoutSec }) {
  const base = env.APIFY_API_BASE || "https://api.apify.com";
  const endpoint = `${base}/v2/acts/${ACTORS[platform]}/run-sync-get-dataset-items?timeout=${timeoutSec}&format=json&clean=true`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), (timeoutSec + 15) * 1000);
  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: "POST",
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${env.APIFY_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(actorInput(platform, url)),
    });
  } catch {
    throw new SocialError("Apify non risponde: riprova dalla scheda.");
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401) throw new SocialError("Apify ha rifiutato la chiave: controlla APIFY_TOKEN su Vercel.");
  if (res.status === 402 || res.status === 403) throw new SocialError("Crediti gratuiti di Apify del mese esauriti: si ricaricano all'inizio del mese.");
  if (res.status === 408) throw new SocialError(`${SITE[platform]} ha risposto troppo lentamente: riprova dalla scheda.`);
  if (res.status === 429) throw new SocialError("Troppe richieste ad Apify: riprova tra poco.");
  if (!res.ok) throw new SocialError(`Lettura del post non riuscita (Apify ${res.status}).`);
  const items = Array.isArray(data) ? data.filter((x) => x && typeof x === "object") : [];
  const item = items.find((x) => !x.error && !x.errorDescription);
  if (!item) {
    const why = items[0]?.errorDescription || items[0]?.error || "";
    throw new SocialError(`Post non leggibile: privato, rimosso o non disponibile.${why ? ` (${String(why).slice(0, 120)})` : ""}`);
  }
  return item;
}

// ---------- risultato di Apify → forma comune ----------

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const isUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v);

// { caption, author, kind: "video" | "slides", videoUrl, imageUrls, cover, subtitles: [{language, url}] }
export function normalizeInstagram(it) {
  const caption = str(it.caption);
  const author = str(it.ownerUsername) || str(it.ownerFullName);
  const cover = isUrl(it.displayUrl) ? it.displayUrl : null;
  const children = Array.isArray(it.childPosts) ? it.childPosts : [];
  if (it.type === "Sidecar" || children.length > 1) {
    const fromChildren = children.map((c) => (isUrl(c?.displayUrl) ? c.displayUrl : Array.isArray(c?.images) ? c.images.find(isUrl) : null));
    const urls = (fromChildren.some(Boolean) ? fromChildren : (it.images || [])).filter(isUrl);
    if (urls.length) return { caption, author, kind: "slides", imageUrls: urls.slice(0, MAX_SLIDES), cover };
  }
  if (isUrl(it.videoUrl)) return { caption, author, kind: "video", videoUrl: it.videoUrl, cover, duration: Number(it.videoDuration) || null };
  const images = [it.displayUrl, ...(Array.isArray(it.images) ? it.images : [])].filter(isUrl);
  if (images.length) return { caption, author, kind: "slides", imageUrls: [...new Set(images)].slice(0, MAX_SLIDES), cover };
  return { caption, author, kind: null, cover };
}

export function normalizeTiktok(it) {
  const caption = str(it.text) || str(it.desc);
  const author = str(it.authorMeta?.name) || str(it.authorMeta?.nickName);
  const meta = it.videoMeta || {};
  const cover = [meta.coverUrl, meta.originalCoverUrl, it.covers?.default].find(isUrl) || null;
  const subtitles = (Array.isArray(meta.subtitleLinks) ? meta.subtitleLinks : [])
    .map((s) => ({ language: String(s?.language || ""), url: [s?.downloadLink, s?.tiktokLink].find(isUrl) }))
    .filter((s) => s.url);
  const slides = (Array.isArray(it.slideshowImageLinks) ? it.slideshowImageLinks : [])
    .map((s) => (isUrl(s) ? s : [s?.downloadLink, s?.tiktokLink].find(isUrl)))
    .filter(Boolean);
  if (it.isSlideshow || slides.length) {
    if (slides.length) return { caption, author, kind: "slides", imageUrls: slides.slice(0, MAX_SLIDES), cover };
  }
  const video = [...(Array.isArray(it.mediaUrls) ? it.mediaUrls : []), meta.downloadAddr, it.videoUrl].find(isUrl);
  if (video || subtitles.length) return { caption, author, kind: "video", videoUrl: video || null, subtitles, cover, duration: Number(meta.duration) || null };
  return { caption, author, kind: null, cover };
}

export function normalizeFacebook(it) {
  const caption = str(it.text) || str(it.caption) || str(it.description) || str(it.message);
  const author = str(it.pageName) || str(it.user?.name) || str(it.author?.name) || str(it.ownerName);
  const video = [it.videoUrl, it.playable_url_quality_hd, it.playable_url, it.hdUrl, it.sdUrl, it.video?.hd_url, it.video?.sd_url, it.media?.[0]?.videoUrl].find(isUrl);
  const cover = [it.thumbnailUrl, it.thumbnail, it.previewImage, it.media?.[0]?.thumbnail].find(isUrl) || null;
  if (video) return { caption, author, kind: "video", videoUrl: video, cover };
  return { caption, author, kind: null, cover };
}

const NORMALIZE = { instagram: normalizeInstagram, tiktok: normalizeTiktok, facebook: normalizeFacebook };

// Sottotitoli WebVTT/SRT → testo semplice.
export function subtitlesToText(raw) {
  const lines = String(raw || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "WEBVTT" && !/^\d+$/.test(l) && !/-->/.test(l) && !/^(NOTE|STYLE|Kind:|Language:)/.test(l))
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
  const out = [];
  for (const l of lines) if (out[out.length - 1] !== l) out.push(l);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

async function fetchSubtitles(subtitles, fetchImpl) {
  for (const s of subtitles) {
    try {
      const res = await fetchImpl(s.url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const text = subtitlesToText(await res.text());
      if (text) return text;
    } catch {
      /* si prova il successivo o si passa a Gemini */
    }
  }
  return null;
}

const remaining = (deadline) => deadline - Date.now();

// I file salvati da Apify (video di TikTok) possono richiedere la chiave:
// la si aggiunge solo per gli indirizzi di Apify.
function mediaFetch(env, fetchImpl) {
  return (url, init = {}) => {
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      /* indirizzo non valido: lo segnala il download */
    }
    if (host !== "api.apify.com") return fetchImpl(url, init);
    return fetchImpl(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${env.APIFY_TOKEN}` } });
  };
}

// Post social (non YouTube) → campi nella forma di extractUrlInfo. Gli errori
// della trascrizione non fanno perdere didascalia e autore già letti.
async function readPost({ env, platform, url, fetchImpl, deadline }) {
  const timeoutSec = Math.max(30, Math.min(150, Math.floor(remaining(deadline) / 1000) - 100));
  const post = NORMALIZE[platform](await runActor({ env, platform, url, fetchImpl, timeoutSec }));
  const out = { siteName: SITE[platform], description: post.caption, image: post.cover, author: post.author, text: null, textSource: null, missing: [] };
  const media = mediaFetch(env, fetchImpl);
  const geminiTimeout = () => Math.max(10_000, Math.min(120_000, remaining(deadline) - 5_000));

  if (post.kind === "video") {
    if (post.subtitles?.length) {
      const text = await fetchSubtitles(post.subtitles, media);
      if (text) return { ...out, text, textSource: `sottotitoli del video (${SITE[platform]})` };
    }
    if (!post.videoUrl) return { ...out, missing: ["il video non è scaricabile"] };
    if (remaining(deadline) < 40_000) return { ...out, missing: ["tempo esaurito prima della trascrizione"] };
    try {
      const part = await videoPart({ env, url: post.videoUrl, fetchImpl: media, deadline: deadline - 30_000 });
      const r = await readMedia({ env, kind: "video", parts: [part], fetchImpl, timeoutMs: geminiTimeout() });
      if (!r.text) return { ...out, aiTitle: r.title, missing: ["nel video non c'è parlato da trascrivere"] };
      return { ...out, aiTitle: r.title, text: r.text, textSource: "trascrizione dell'AI (video)" };
    } catch (e) {
      return { ...out, missing: [`trascrizione non riuscita (${e.message})`] };
    }
  }

  if (post.kind === "slides") {
    const { parts, missing: lost } = await imageParts({ urls: post.imageUrls, fetchImpl: media });
    if (!parts.length) return { ...out, missing: ["non sono riuscito a scaricare le slide"] };
    try {
      const r = await readMedia({ env, kind: "slides", parts, fetchImpl, timeoutMs: geminiTimeout() });
      const missing = lost ? [`${lost} slide su ${post.imageUrls.length} non scaricabili`] : [];
      if (!r.text) missing.push("nelle slide non c'è testo");
      return { ...out, aiTitle: r.title, text: r.text || null, textSource: r.text ? "testo delle slide letto dall'AI" : null, missing };
    } catch (e) {
      return { ...out, missing: [`lettura delle slide non riuscita (${e.message})`] };
    }
  }

  return { ...out, missing: ["il post non contiene video o immagini leggibili"] };
}

function captionTitle(caption) {
  const first = String(caption || "").split("\n").map((s) => s.trim()).find(Boolean);
  return first ? first.slice(0, 120) : null;
}

// Link → stesso risultato di extractUrlInfo, arricchito con trascrizione o
// testo delle slide quando il link è un post social o un video YouTube.
export async function readLink(rawUrl, { env, fetchImpl = fetch, deadline = Date.now() + 280_000 } = {}) {
  const target = socialTarget(rawUrl);
  const allowPrivate = env.EXTRACT_ALLOW_PRIVATE === "1";
  if (!target) return extractUrlInfo(rawUrl, { allowPrivate });

  if (target.platform === "youtube") {
    const base = await extractUrlInfo(rawUrl, { allowPrivate });
    if (base.error || !aiConfigured(env)) return base;
    try {
      const r = await transcribeYoutube({ env, url: target.url, fetchImpl });
      if (!r.text) return { ...base, detail: [base.detail, "Nel video non c'è parlato da trascrivere."].filter(Boolean).join(" ") };
      return { ...base, title: base.title || r.title || null, text: r.text, textSource: r.textSource, status: "analyzed", detail: null };
    } catch (e) {
      return { ...base, detail: [base.detail, `Trascrizione non riuscita: ${e.message}`].filter(Boolean).join(" ") };
    }
  }

  // Instagram, TikTok, Facebook: i metadati pubblici della pagina (spesso
  // bloccati) e la lettura completa con Apify procedono in parallelo.
  const basePromise = extractUrlInfo(rawUrl, { allowPrivate }).catch(() => null);
  if (!socialConfigured(env) || !aiConfigured(env)) {
    const base = await basePromise;
    const need = !socialConfigured(env) ? "APIFY_TOKEN" : "GEMINI_API_KEY";
    const hint = `Per trascrivere video e leggere i caroselli serve ${need} su Vercel.`;
    return base ? { ...base, detail: [base.detail, hint].filter(Boolean).join(" ") } : { error: "Link non valido." };
  }

  let post;
  let failure = null;
  try {
    post = await readPost({ env, platform: target.platform, url: target.url, fetchImpl, deadline });
  } catch (e) {
    failure = e instanceof SocialError ? e.message : `Lettura del post non riuscita: ${e.message}`;
  }
  const base = (await basePromise) || { url: target.url, finalUrl: target.url, title: null, description: null, siteName: SITE[target.platform], image: null, text: null, textSource: null, place: null, status: "inaccessible", detail: null };
  if (base.error) return base;
  if (!post) return { ...base, detail: failure };

  const description = post.description || base.description;
  // Il titolo dell'AI descrive il contenuto meglio di "Utente su Instagram".
  const pageTitle = base.title && !/^(instagram|tiktok|facebook)$/i.test(base.title) ? base.title : null;
  const title = post.aiTitle || pageTitle || captionTitle(post.description) || base.title;
  const status = post.text ? (post.missing.length ? "partial" : "analyzed") : description ? "partial" : "inaccessible";
  const why = post.missing.join(", ") || "motivo sconosciuto";
  const detail = post.text
    ? post.missing.length ? `Letto in parte: ${why}.` : null
    : `Ho letto ${description ? "solo la didascalia" : "il post"}, non il contenuto: ${why}.`;
  return {
    ...base,
    finalUrl: target.url,
    siteName: post.siteName,
    title,
    description,
    image: post.image || base.image,
    text: post.text,
    textSource: post.textSource,
    status,
    detail,
  };
}

// Core dell'endpoint POST /api/extract (lettura del link dall'app).
export async function handleRead({ authHeader, body, env, fetchImpl }) {
  const auth = await verifyRequest({ authHeader, env });
  if (!auth.ok) return { status: auth.status, json: { error: auth.error } };
  const raw = body?.url;
  if (typeof raw !== "string" || raw.length > 4000) return { status: 400, json: { error: "Link mancante o troppo lungo." } };
  const out = await readLink(raw, { env, fetchImpl });
  if (out.error) return { status: 400, json: { error: out.error } };
  return { status: 200, json: out };
}
