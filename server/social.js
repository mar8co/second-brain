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
  // Anche i link "share" di Instagram: Apify li segue fino al post.
  if ((host === "instagram.com" || host === "instagr.am") && /^\/(?:[\w.]+\/)?(p|reel|reels|tv|share)\/[\w-]+/.test(path)) {
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

// Actor ufficiali o più usati per un singolo post (prezzi del piano gratuito,
// ottobre 2026: circa 0,003-0,006 $ a post).
const ACTORS = {
  instagram: "apify~instagram-scraper",
  // Salva video, slide e sottotitoli nello spazio di Apify: i link diretti di
  // TikTok scadono e funzionano solo dall'indirizzo che li ha richiesti.
  tiktok: "clockworks~tiktok-video-scraper",
  facebook: "apify~facebook-posts-scraper",
};

function actorInput(platform, url) {
  if (platform === "instagram") return { directUrls: [url], resultsType: "posts", resultsLimit: 1, addParentData: false };
  if (platform === "tiktok") {
    return { postURLs: [url], shouldDownloadVideos: true, shouldDownloadSlideshowImages: true, shouldDownloadCovers: false, downloadSubtitlesOptions: "DOWNLOAD_SUBTITLES" };
  }
  return { startUrls: [{ url }], resultsLimit: 1, captionText: false };
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
  if (!res.ok) throw new SocialError(apifyError(res.status, data?.error?.type, platform));
  // Lettura non finita entro il tempo dell'API: arriva lo stato della corsa invece dei dati.
  if (!Array.isArray(data)) throw new SocialError(apifyError(408, "run-timeout", platform));
  const items = data.filter((x) => x && typeof x === "object");
  const item = items.find((x) => !x.error && !x.errorDescription && !x.errorCode);
  if (!item) {
    const bad = items[0] || {};
    const why = [bad.errorDescription || (typeof bad.error === "string" ? bad.error : ""), bad.errorCode].filter(Boolean).join(", ");
    throw new SocialError(`Post non leggibile: privato, rimosso o non disponibile.${why ? ` (${String(why).slice(0, 120)})` : ""}`);
  }
  return item;
}

// Errori dell'API di Apify (stato HTTP e `error.type`) → messaggio per la scheda.
export function apifyError(status, type = "", platform = "") {
  const t = String(type || "");
  if (status === 401 || /token/.test(t)) return "Apify ha rifiutato la chiave: controlla APIFY_TOKEN su Vercel.";
  // Limiti di memoria e di letture contemporanee (anche con stato 402): passano da soli.
  if (/memory-limit|concurrent-runs/.test(t)) return "Troppi link letti insieme: riprova tra poco dalla scheda.";
  if (status === 402 || /usage|payment|x402|credit|charge/.test(t)) return "Crediti gratuiti di Apify del mese esauriti: si ricaricano all'inizio del mese.";
  if (status === 408 || /timeout/.test(t)) return `${SITE[platform] || "Il sito"} ha risposto troppo lentamente: riprova dalla scheda.`;
  if (status === 429) return "Troppe richieste ad Apify: riprova tra poco.";
  if (status === 403) return "Apify ha rifiutato la richiesta: la chiave non ha i permessi per avviare la lettura.";
  return `Lettura del post non riuscita (Apify ${status}${t ? `, ${t}` : ""}).`;
}

// ---------- risultato di Apify → forma comune ----------

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const isUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v);

// Chi ha pubblicato il post: "Nome (@utente)", "@utente" o solo il nome.
export function formatAuthor(name, handle) {
  const n = str(name);
  const h = str(handle)?.replace(/^@/, "") || null;
  if (n && h && n.toLowerCase() !== h.toLowerCase()) return `${n} (@${h})`.slice(0, 200);
  if (h) return `@${h}`.slice(0, 200);
  return n ? n.slice(0, 200) : null;
}

// Data di pubblicazione (ISO, secondi o millisecondi) → ISO, oppure null.
export function postDate(v) {
  const raw = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : v;
  let t = NaN;
  if (typeof raw === "number" && raw > 0) t = raw < 1e12 ? raw * 1000 : raw;
  else if (typeof raw === "string" && raw.trim()) t = Date.parse(raw);
  if (!Number.isFinite(t) || t < Date.UTC(2004, 0, 1) || t > Date.now() + 86_400_000) return null;
  return new Date(t).toISOString();
}

// { caption, author, kind: "video" | "slides", videoUrl, imageUrls, cover, subtitles: [{language, url}] }
export function normalizeInstagram(it) {
  const caption = str(it.caption);
  const author = formatAuthor(it.ownerFullName, it.ownerUsername);
  // Luogo indicato nel post (solo il nome: Instagram non dà le coordinate).
  const extra = { publishedAt: postDate(it.timestamp), location: str(it.locationName) };
  const cover = isUrl(it.displayUrl) ? it.displayUrl : null;
  const children = Array.isArray(it.childPosts) ? it.childPosts : [];
  if (it.type === "Sidecar" || children.length > 1) {
    const fromChildren = children.map((c) => (isUrl(c?.displayUrl) ? c.displayUrl : Array.isArray(c?.images) ? c.images.find(isUrl) : null));
    const fallback = [it.images, it.carouselImages].find((l) => Array.isArray(l) && l.some(isUrl)) || [];
    const urls = (fromChildren.some(Boolean) ? fromChildren : fallback).filter(isUrl);
    // Le slide video vengono lette come immagine (la copertina): il parlato no.
    const videoSlides = children.filter((c) => isUrl(c?.videoUrl)).length;
    if (urls.length) return { caption, author, ...extra, kind: "slides", imageUrls: urls.slice(0, MAX_SLIDES), total: urls.length, videoSlides, cover };
  }
  // Reel: il video (con il testo a schermo); se manca, la sola traccia audio.
  const video = [it.videoUrl, it.audioUrl].find(isUrl);
  if (video) return { caption, author, ...extra, kind: "video", videoUrl: video, cover, duration: Number(it.videoDuration) || null };
  const images = [it.displayUrl, ...(Array.isArray(it.images) ? it.images : [])].filter(isUrl);
  if (images.length) return { caption, author, ...extra, kind: "slides", imageUrls: [...new Set(images)].slice(0, MAX_SLIDES), cover };
  return { caption, author, ...extra, kind: null, cover };
}

export function normalizeTiktok(it) {
  const caption = str(it.text) || str(it.desc);
  const author = formatAuthor(it.authorMeta?.nickName, it.authorMeta?.name);
  const extra = { publishedAt: postDate(it.createTimeISO || it.createTime), location: null };
  const meta = it.videoMeta || {};
  const cover = [meta.coverUrl, meta.originalCoverUrl, it.covers?.default].find(isUrl) || null;
  // Prima i sottotitoli nella lingua originale, poi quelli tradotti in automatico ("MT").
  const subtitles = (Array.isArray(meta.subtitleLinks) ? meta.subtitleLinks : [])
    .map((s) => ({ language: String(s?.language || ""), url: [s?.downloadLink, s?.tiktokLink].find(isUrl), translated: s?.source === "MT" }))
    .filter((s) => s.url)
    .sort((a, b) => a.translated - b.translated);
  const slides = (Array.isArray(it.slideshowImageLinks) ? it.slideshowImageLinks : [])
    .map((s) => (isUrl(s) ? s : [s?.downloadLink, s?.tiktokLink].find(isUrl)))
    .filter(Boolean);
  if (it.isSlideshow || slides.length) {
    if (slides.length) return { caption, author, ...extra, kind: "slides", imageUrls: slides.slice(0, MAX_SLIDES), total: slides.length, cover };
  }
  const video = [...(Array.isArray(it.mediaUrls) ? it.mediaUrls : []), meta.downloadAddr, it.videoUrl].find(isUrl);
  if (video || subtitles.length) return { caption, author, ...extra, kind: "video", videoUrl: video || null, subtitles, cover, duration: Number(meta.duration) || null };
  return { caption, author, ...extra, kind: null, cover };
}

// apify/facebook-posts-scraper restituisce forme diverse: il nodo del Reel
// (/reel/ID), il nodo del video (watch?v=ID, /videos/ID) o il post di una pagina.
export function normalizeFacebook(it) {
  const reel = it.short_form_video_context || {};
  const pv = reel.playback_video || it.playback_video || {};
  const media = (Array.isArray(it.media) ? it.media : []).find((m) => m?.__typename === "Video") || {};
  const delivery = [pv.videoDeliveryLegacyFields, it.videoDeliveryLegacyFields, media.videoDeliveryLegacyFields].filter(Boolean);
  const video = [
    ...delivery.flatMap((d) => [d.browser_native_hd_url, d.browser_native_sd_url]),
    pv.browser_native_hd_url,
    pv.browser_native_sd_url,
  ].find(isUrl);
  const caption = str(it.message?.text) || str(it.text) || str(it.previewDescription) || str(it.previewTitle) || str(it.message);
  const author = formatAuthor(str(it.pageName) || str(reel.video_owner?.name) || str(it.user?.name) || str(it.owner?.name), null);
  const extra = { publishedAt: postDate(it.time || it.timestamp), location: null };
  const cover = [pv.thumbnailImage?.uri, pv.preferred_thumbnail?.image?.uri, it.preferred_thumbnail?.image?.uri, reel.video?.first_frame_thumbnail, media.thumbnail].find(isUrl) || null;
  const captionsUrl = [pv.captions_url, it.captions_url, media.captions_url].find(isUrl);
  const subtitles = captionsUrl ? [{ language: "", url: captionsUrl, translated: false }] : [];
  if (video) return { caption, author, ...extra, kind: "video", videoUrl: video, subtitles, cover };
  // Il post è un video, ma Facebook non ne ha dato il file.
  const hadVideo = Boolean(it.short_form_video_context || it.playback_video || media.__typename || it.__typename === "Video" || delivery.length);
  // Post con foto: lette come slide.
  const photos = (Array.isArray(it.media) ? it.media : [])
    .filter((m) => m?.__typename === "Photo")
    .map((m) => [m.photo_image?.uri, m.image?.uri, m.thumbnail].find(isUrl))
    .filter(Boolean);
  if (photos.length) return { caption, author, ...extra, kind: "slides", imageUrls: [...new Set(photos)].slice(0, MAX_SLIDES), total: photos.length, cover: cover || photos[0] };
  return { caption, author, ...extra, kind: null, cover, hadVideo };
}

// Link di condivisione (share/r, share/v, fb.watch) → link diretto del video,
// seguendo i reindirizzamenti pubblici. Se non riesce resta il link originale.
export async function resolveFacebookUrl(url, fetchImpl = fetch) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, "");
  if (host !== "fb.watch" && !/^\/share\//.test(u.pathname)) return url;
  try {
    const res = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(4000) });
    res.body?.cancel?.().catch?.(() => {});
    const final = res.url || "";
    const id = facebookVideoId(final);
    if (!id) return url;
    return /\/reel\//.test(decodeURIComponent(final)) ? `https://www.facebook.com/reel/${id}` : `https://www.facebook.com/watch/?v=${id}`;
  } catch {
    return url;
  }
}

// Link di un video o Reel di Facebook (anche se non risolto).
export function isFacebookVideoLink(url) {
  if (facebookVideoId(url)) return true;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, "");
  if (host === "fb.watch") return true;
  return /^\/(reel|watch)(\/|$)|^\/share\/[rv]\/|^\/[^/]+\/videos(\/|$)/.test(u.pathname);
}

export function facebookVideoId(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
  // Pagina di accesso: il video richiesto è nel parametro "next".
  if (/^\/login/.test(u.pathname) && u.searchParams.get("next")) return facebookVideoId(u.searchParams.get("next"));
  const m = u.pathname.match(/\/reel\/(\d+)/) || u.pathname.match(/\/videos\/(?:[^/]+\/)?(\d+)/);
  if (m) return m[1];
  const v = u.searchParams.get("v");
  return v && /^\d+$/.test(v) ? v : null;
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

// Trascrizione incompleta: video lungo, oppure AI bloccata a ripetere una frase.
export const cutNote = (r) => (r.looped ? "trascrizione interrotta dall'AI, salvata solo la prima parte" : "video lungo, trascritta solo la prima parte");

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
  const timeoutSec = () => Math.max(30, Math.min(150, Math.floor(remaining(deadline) / 1000) - 100));
  const target = platform === "facebook" ? await resolveFacebookUrl(url, fetchImpl) : url;
  let post = NORMALIZE[platform](await runActor({ env, platform, url: target, fetchImpl, timeoutSec: timeoutSec() }));
  // Facebook: a volte il Reel arriva senza video; la pagina "watch" dello
  // stesso video di solito lo contiene (la didascalia resta quella del Reel).
  const fbId = platform === "facebook" && post.kind !== "video" && !/\/watch/.test(target) ? facebookVideoId(target) : null;
  if (fbId && remaining(deadline) > 120_000) {
    try {
      const again = normalizeFacebook(await runActor({ env, platform, url: `https://www.facebook.com/watch/?v=${fbId}`, fetchImpl, timeoutSec: timeoutSec() }));
      if (again.kind === "video") {
        post = { ...again, caption: post.caption || again.caption, author: post.author || again.author, publishedAt: post.publishedAt || again.publishedAt, cover: post.cover || again.cover };
      }
    } catch {
      /* resta il primo risultato */
    }
  }
  const out = { siteName: SITE[platform], description: post.caption, image: post.cover, author: post.author, publishedAt: post.publishedAt, location: post.location, text: null, textSource: null, missing: [] };
  const media = mediaFetch(env, fetchImpl);
  const ai = { timeoutMs: 120_000, deadline: deadline - 5_000 };

  if (post.kind === "video") {
    if (post.subtitles?.length) {
      const text = await fetchSubtitles(post.subtitles, media);
      if (text) return { ...out, text, textSource: `sottotitoli del video (${SITE[platform]})` };
    }
    if (!post.videoUrl) return { ...out, missing: ["il video non è scaricabile"] };
    if (remaining(deadline) < 40_000) return { ...out, missing: ["tempo esaurito prima della trascrizione"] };
    try {
      const part = await videoPart({ env, url: post.videoUrl, fetchImpl: media, deadline: deadline - 30_000 });
      const r = await readMedia({ env, kind: "video", parts: [part], fetchImpl, ...ai });
      if (!r.text) return { ...out, aiTitle: r.title, missing: ["nel video non c'è né parlato né testo da trascrivere"] };
      const missing = r.truncated ? [cutNote(r)] : [];
      return { ...out, aiTitle: r.title, text: r.text, textSource: "trascrizione dell'AI (video)", missing };
    } catch (e) {
      return { ...out, missing: [`trascrizione non riuscita (${e.message})`] };
    }
  }

  if (post.kind === "slides") {
    const { parts, missing: lost } = await imageParts({ urls: post.imageUrls, fetchImpl: media });
    if (!parts.length) return { ...out, missing: ["non sono riuscito a scaricare le slide"] };
    try {
      const r = await readMedia({ env, kind: "slides", parts, fetchImpl, ...ai });
      const missing = lost ? [`${lost} slide su ${post.imageUrls.length} non scaricabili`] : [];
      if (post.total > post.imageUrls.length) missing.push(`lette solo le prime ${post.imageUrls.length} slide su ${post.total}`);
      if (post.videoSlides) missing.push(`${post.videoSlides} slide video lette solo come immagine, parlato non trascritto`);
      if (!r.text) missing.push("nelle slide non c'è testo");
      return { ...out, aiTitle: r.title, text: r.text || null, textSource: r.text ? "testo delle slide letto dall'AI" : null, missing };
    } catch (e) {
      return { ...out, missing: [`lettura delle slide non riuscita (${e.message})`] };
    }
  }

  const videoTarget = platform === "facebook" && (post.hadVideo || isFacebookVideoLink(target));
  const none = videoTarget ? "Facebook non ha fornito il file del video" : "il post non contiene video o immagini leggibili";
  return { ...out, missing: [none] };
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
    // Il dettaglio dei soli metadati ("trascrizione non disponibile…") viene sostituito.
    try {
      const r = await transcribeYoutube({ env, url: target.url, fetchImpl, deadline: deadline - 5_000 });
      if (!r.text) return { ...base, detail: "Titolo e autore letti da YouTube; nel video non c'è né parlato né testo da trascrivere." };
      if (r.truncated) return { ...base, title: base.title || r.title || null, text: r.text, textSource: r.textSource, status: "partial", detail: `Letto in parte: ${cutNote(r)}.` };
      return { ...base, title: base.title || r.title || null, text: r.text, textSource: r.textSource, status: "analyzed", detail: null };
    } catch (e) {
      return { ...base, detail: `Titolo e autore letti da YouTube; trascrizione non riuscita: ${e.message}` };
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
    author: post.author || base.author || null,
    publishedAt: post.publishedAt || null,
    // Luogo taggato nel post: solo il nome, senza coordinate.
    place: post.location ? { name: post.location.slice(0, 200), lat: null, lng: null } : base.place || null,
    image: post.image || base.image,
    text: post.text,
    textSource: post.textSource,
    status,
    detail,
  };
}
