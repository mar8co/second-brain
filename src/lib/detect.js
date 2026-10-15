// Riconoscimento di URL e tipo di contenuto. Logica pura, usata sia dal client
// (anteprima immediata nel form "Aggiungi") sia dal server (estrazione).

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/i;
// Domini "nudi" incollati senza schema, es. "instagram.com/reel/abc". Solo
// domini di primo livello comuni, per non scambiare "doc.pdf" per un sito.
const BARE_RE = /(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:com|it|net|org|io|app|dev|co|eu|me|tv|ly|gl|be|info|shop|store|ai|uk|de|fr|es|ch)(?![\w-])(?:\/[^\s<>"'`]*)?/i;

// Estrae il primo URL da un testo condiviso (le app iOS spesso condividono
// "Guarda questo reel https://…" invece del solo link).
export function extractUrl(text) {
  if (!text) return null;
  const s = String(text).trim();
  let m = s.match(URL_RE);
  let candidate = m ? m[0] : null;
  if (!candidate) {
    m = s.match(BARE_RE);
    if (!m) return null;
    candidate = `https://${m[0]}`;
  }
  // Toglie la punteggiatura finale che non fa parte del link.
  candidate = candidate.replace(/[),.;:!?»”]+$/, "");
  try {
    const u = new URL(candidate);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function host(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

const SOCIAL_HOSTS = ["instagram.com", "instagr.am", "tiktok.com", "vm.tiktok.com", "threads.net", "facebook.com", "fb.watch"];
const VIDEO_HOSTS = ["youtube.com", "youtu.be", "vimeo.com", "dailymotion.com"];

export function isInstagram(url) {
  const h = host(url);
  return h === "instagram.com" || h === "instagr.am";
}

export function isGoogleMaps(url) {
  const h = host(url);
  if (!h) return false;
  if (h === "maps.app.goo.gl" || (h === "goo.gl" && /\/maps\//.test(url))) return true;
  if (h === "maps.google.com") return true;
  // Link corti che Google Maps crea con "Condividi" (share.google).
  if (h === "share.google") return true;
  return /(^|\.)google\.[a-z.]+$/.test(h) && /\/maps(\/|$|\?)/.test(new URL(url).pathname + "/");
}

export function isAppleMaps(url) {
  return host(url) === "maps.apple.com";
}

// Tipo suggerito a partire dall'URL. L'utente può sempre cambiarlo.
export function detectType(url) {
  if (!url) return "note";
  const h = host(url);
  if (!h) return "link";
  if (isGoogleMaps(url) || isAppleMaps(url)) return "place";
  if (SOCIAL_HOSTS.some((s) => h === s || h.endsWith(`.${s}`))) return "social";
  if (VIDEO_HOSTS.some((s) => h === s || h.endsWith(`.${s}`))) return "video";
  if (/\.(pdf)(\?|$)/i.test(url)) return "file";
  if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) return "image";
  return "link";
}

// Nome del sito leggibile, per le schede ("instagram.com").
export function displayHost(url) {
  return host(url);
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

// Ricava nome e coordinate di un posto da un URL di Google Maps o Apple Maps,
// senza chiamare servizi esterni. Restituisce null se non trova nulla.
export function parsePlaceFromUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  let name = null;
  let lat = null;
  let lng = null;

  if (isAppleMaps(url)) {
    name = u.searchParams.get("q") || u.searchParams.get("name") || null;
    const ll = u.searchParams.get("ll") || u.searchParams.get("sll") || u.searchParams.get("coordinate");
    if (ll) [lat, lng] = ll.split(",").map(Number);
    if (!name && u.searchParams.get("address")) name = u.searchParams.get("address");
  } else if (isGoogleMaps(url)) {
    const place = u.pathname.match(/\/maps\/place\/([^/]+)/);
    if (place) name = safeDecode(place[1]);
    if (!name) name = u.searchParams.get("q") || u.searchParams.get("query") || null;
    const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (at) [lat, lng] = [Number(at[1]), Number(at[2])];
    // Le coordinate esatte del posto stanno spesso in !3d<lat>!4d<lng>.
    const exact = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (exact) [lat, lng] = [Number(exact[1]), Number(exact[2])];
  } else {
    return null;
  }

  if (name && /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(name)) {
    // "q=45.46,9.19": sono coordinate, non un nome.
    [lat, lng] = name.split(",").map(Number);
    name = null;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) [lat, lng] = [null, null];
  if (!name && lat === null) return null;
  return { name: name ? name.trim() : null, lat, lng };
}

// Copertina di un posto: la tessera della mappa di OpenStreetMap (gratuita, senza
// chiave) che contiene le sue coordinate. Solo se si conoscono.
export function mapTileUrl(place, zoom = 16) {
  const lat = place?.lat;
  const lng = place?.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 85 || Math.abs(lng) > 180) return null;
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}
