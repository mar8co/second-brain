import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { handleRead } from "./server/read.js";
import { AI_BODY_BYTES, handleAi } from "./server/ai.js";
import { handleShare } from "./server/share.js";
import { handleGeo } from "./server/geo.js";
import { handleThumb } from "./server/thumb.js";
import { nodeHandler } from "./server/node-adapter.js";

// In `npm run dev` gli endpoint /api/* sono serviti da un middleware che usa lo
// stesso core delle function Vercel (server/*): comportamento identico.
function devApi(path, core, env, extra) {
  return {
    name: `dev-api${path.replace(/\//g, "-")}`,
    configureServer(server) {
      server.middlewares.use(path, nodeHandler(core, env, extra));
    },
    configurePreviewServer(server) {
      server.middlewares.use(path, nodeHandler(core, env, extra));
    },
  };
}

export default defineConfig(({ mode }) => {
  const e = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = e.SUPABASE_URL || e.VITE_SUPABASE_URL;
  const supabaseAnon = e.SUPABASE_ANON_KEY || e.VITE_SUPABASE_ANON_KEY;
  const apiEnv = {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnon,
    GEMINI_API_KEY: e.GEMINI_API_KEY,
    GEMINI_MODEL: e.GEMINI_MODEL,
    GEMINI_API_BASE: e.GEMINI_API_BASE,
    APIFY_TOKEN: e.APIFY_TOKEN,
    APIFY_API_BASE: e.APIFY_API_BASE,
    GEOCODE_API_BASE: e.GEOCODE_API_BASE,
    ALLOWED_EMAILS: e.ALLOWED_EMAILS,
    // Solo in locale e senza Supabase: endpoint senza login (server su localhost).
    ALLOW_NO_AUTH: supabaseUrl ? "" : "1",
    // Solo per i test end-to-end (pagine di prova servite su 127.0.0.1).
    EXTRACT_ALLOW_PRIVATE: e.EXTRACT_ALLOW_PRIVATE === "1" ? "1" : "",
  };

  return {
    // Versione dell'app (commit su Vercel), mostrata in Impostazioni per capire quale copia gira.
    define: { __BUILD__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "locale") },
    plugins: [
      react(),
      devApi("/api/extract", handleRead, apiEnv),
      devApi("/api/ai", handleAi, apiEnv, { maxBody: AI_BODY_BYTES }),
      devApi("/api/share", handleShare, apiEnv, { allowFiles: true }),
      devApi("/api/geo", handleGeo, apiEnv),
      devApi("/api/thumb", handleThumb, apiEnv),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        includeAssets: ["favicon.svg", "icon.svg", "apple-touch-icon.png"],
        manifest: {
          id: "/",
          name: "Second Brain",
          short_name: "Second Brain",
          description: "Il tuo archivio personale: salva link, Reel, posti, note e file e ritrovali con una domanda.",
          lang: "it",
          dir: "ltr",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          background_color: "#ffb5d0",
          theme_color: "#ffb5d0",
          categories: ["productivity", "utilities"],
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
          shortcuts: [{ name: "Aggiungi", short_name: "Aggiungi", url: "/aggiungi" }],
          // Android/Chrome: compare nel menu Condividi per foto, video e file (anche più
          // insieme). Su iPhone le app installate non possono essere destinazione.
          share_target: {
            action: "/condividi",
            method: "POST",
            enctype: "multipart/form-data",
            params: { files: [{ name: "files", accept: ["image/*", "video/*", "application/pdf", "text/plain", "text/markdown"] }] },
          },
        },
        workbox: {
          // Solo la "shell" dell'app in cache. Le chiamate /api e Supabase vanno
          // sempre in rete: i dati non vengono serviti da cache vecchie.
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          importScripts: ["share-target-sw.js", "push-sw.js"],
          globIgnores: ["**/pdf.worker*"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          // Le miniature dei contenuti (immagini di altri siti) restano sul telefono dopo
          // il primo caricamento: Archivio non le riscarica a ogni apertura.
          runtimeCaching: [
            {
              // `self` esiste nel service worker, dove questa funzione viene eseguita.
              // eslint-disable-next-line no-undef
              urlPattern: ({ request, url }) => request.destination === "image" && url.origin !== self.location.origin,
              handler: "CacheFirst",
              options: {
                cacheName: "miniature",
                // Qui si legge soltanto: a salvare ci pensa l'app (src/lib/thumbs.js), a
                // caricamento riuscito, così un errore del CDN non resta in cache.
                plugins: [{ cacheWillUpdate: async () => null }],
                matchOptions: { ignoreVary: true },
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 180, purgeOnQuotaError: true },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    server: { host: "127.0.0.1" },
    preview: { host: "127.0.0.1" },
    test: {
      include: ["src/**/*.test.js", "server/**/*.test.js"],
      environment: "node",
    },
  };
});
