// Miniature dei contenuti: immagini di altri siti (i Reel e i post le servono dal
// proprio CDN). Una volta caricate bene si tengono nella cache "miniature" del
// telefono, che il service worker (vite.config.js) usa prima della rete. Si
// salvano solo da qui, a caricamento riuscito: un errore del CDN non finisce
// mai in cache.
export const THUMB_CACHE = "miniature";

export async function rememberThumb(url, { cacheStorage = globalThis.caches, doFetch = globalThis.fetch } = {}) {
  if (!cacheStorage || !doFetch || !/^https?:\/\//.test(url || "")) return false;
  try {
    const cache = await cacheStorage.open(THUMB_CACHE);
    if (await cache.match(url)) return true;
    const res = await doFetch(url, { mode: "no-cors", credentials: "omit", referrerPolicy: "no-referrer" });
    // Una risposta "opaca" non si può ispezionare: si accetta solo se il caricamento
    // nell'<img> è già riuscito (chi chiama lo garantisce); un errore HTTP visibile no.
    if (res.type !== "opaque" && !res.ok) return false;
    await cache.put(url, res);
    return true;
  } catch {
    return false;
  }
}
