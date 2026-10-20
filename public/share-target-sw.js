// Ricezione dei file condivisi da altre app (Web Share Target, Android/Chrome).
// Il service worker riceve il POST, mette i file in una cache temporanea e porta
// l'app su "/?condivisi=1", dove l'anteprima li mostra prima di salvarli.
// Su iPhone le app installate non compaiono nel menu Condividi: qui non arriva nulla.
const CACHE = "sb-condivisi";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/condividi") return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll("files").filter((f) => f && typeof f === "object" && f.size > 0);
        const cache = await caches.open(CACHE);
        for (const k of await cache.keys()) await cache.delete(k);
        await Promise.all(
          files.map((f, i) =>
            cache.put(
              `/__condiviso/${i}`,
              new Response(f, {
                headers: {
                  "content-type": f.type || "application/octet-stream",
                  "x-nome": encodeURIComponent(f.name || `file-${i}`),
                  "x-data": String(f.lastModified || 0),
                },
              }),
            ),
          ),
        );
      } catch {
        // Se qualcosa va storto l'app si apre comunque, senza file.
      }
      return Response.redirect("/?condivisi=1", 303);
    })(),
  );
});
