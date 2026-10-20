// File ricevuti dal menu Condividi (vedi public/share-target-sw.js): si leggono
// una volta sola dalla cache temporanea e poi la cache si svuota.
const CACHE = "sb-condivisi";

export async function takeSharedFiles() {
  if (typeof caches === "undefined") return [];
  try {
    if (!(await caches.has(CACHE))) return [];
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    const out = [];
    for (const req of keys) {
      const res = await cache.match(req);
      if (!res) continue;
      const blob = await res.blob();
      const name = decodeURIComponent(res.headers.get("x-nome") || "file");
      out.push(new File([blob], name, { type: res.headers.get("content-type") || blob.type, lastModified: Number(res.headers.get("x-data")) || Date.now() }));
    }
    await caches.delete(CACHE);
    return out;
  } catch {
    return [];
  }
}
