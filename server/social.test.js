import { beforeEach, describe, expect, it, vi } from "vitest";

// I metadati pubblici della pagina (rete reale) sono sostituiti da un finto.
const pageInfo = vi.hoisted(() => ({ value: null }));
vi.mock("./extract.js", () => ({
  extractUrlInfo: vi.fn(async (url) =>
    pageInfo.value === "throw"
      ? Promise.reject(new Error("rete"))
      : { url, finalUrl: url, title: null, description: null, siteName: null, image: null, text: null, textSource: null, place: null, status: "inaccessible", detail: "Pagina dietro login.", ...pageInfo.value },
  ),
}));

const { handleRead, normalizeInstagram, normalizeTiktok, normalizeFacebook, readLink, socialTarget, subtitlesToText } = await import("./social.js");
const { handleShare } = await import("./share.js");

const env = { GEMINI_API_KEY: "g-key", APIFY_TOKEN: "apify-key" };
const TOKEN = "a".repeat(64);

const geminiReply = (obj) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...headers } });
const bytes = (n, type, fill = 1) => new Response(Buffer.alloc(n, fill), { status: 200, headers: { "content-type": type, "content-length": String(n) } });

// Finto Internet: Apify, CDN dei media e Gemini. Registra ogni richiesta.
function fakeNet({ apify, media = {}, gemini, upload } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ url: u, init, body });
    if (u.startsWith("https://api.apify.com/v2/acts/")) return typeof apify === "function" ? apify(u, body) : json(apify);
    if (u.includes(":generateContent")) {
      if (typeof gemini === "function") return gemini(body);
      return geminiReply(gemini || { title: "Titolo AI", transcript: "", slides: [] });
    }
    if (u.includes("/upload/v1beta/files")) return new Response("{}", { status: 200, headers: { "x-goog-upload-url": "https://upload.test/session-1" } });
    if (u === "https://upload.test/session-1") return json({ file: upload || { name: "files/abc", uri: "https://generativelanguage.googleapis.com/v1beta/files/abc", mimeType: "video/mp4", state: "ACTIVE" } });
    if (u in media) return typeof media[u] === "function" ? media[u](init) : media[u].clone();
    return new Response("not found", { status: 404 });
  };
  return { fetchImpl, calls, gemini: () => calls.filter((c) => c.url.includes(":generateContent")), apify: () => calls.filter((c) => c.url.includes("api.apify.com/v2/acts")) };
}

beforeEach(() => {
  pageInfo.value = null;
});

describe("link dei social riconosciuti", () => {
  it("Instagram, TikTok, Facebook e YouTube; toglie i parametri di tracciamento", () => {
    expect(socialTarget("https://www.instagram.com/reel/C9abc_12/?igsh=MTIz&utm_source=ig_web")).toEqual({ platform: "instagram", url: "https://www.instagram.com/reel/C9abc_12/" });
    expect(socialTarget("guarda https://instagram.com/p/Cxyz/ bello")).toMatchObject({ platform: "instagram" });
    expect(socialTarget("https://www.instagram.com/marco/reel/C9abc/")).toMatchObject({ platform: "instagram" });
    expect(socialTarget("https://www.tiktok.com/@chef/video/7312345678901234567?_r=1&_t=8abc")).toEqual({ platform: "tiktok", url: "https://www.tiktok.com/@chef/video/7312345678901234567" });
    expect(socialTarget("https://vm.tiktok.com/ZMabc123/")).toMatchObject({ platform: "tiktok" });
    expect(socialTarget("https://www.tiktok.com/@chef/photo/7312345678901234567")).toMatchObject({ platform: "tiktok" });
    expect(socialTarget("https://www.facebook.com/reel/123456789?mibextid=abc")).toEqual({ platform: "facebook", url: "https://www.facebook.com/reel/123456789" });
    expect(socialTarget("https://fb.watch/abcDEF/")).toMatchObject({ platform: "facebook" });
    expect(socialTarget("https://www.facebook.com/share/r/1AbCd/")).toMatchObject({ platform: "facebook" });
    expect(socialTarget("https://www.youtube.com/shorts/AbC_123-xyz")).toEqual({ platform: "youtube", url: "https://www.youtube.com/watch?v=AbC_123-xyz" });
  });

  it("profili, pagine e altri siti non sono post da leggere", () => {
    expect(socialTarget("https://www.instagram.com/marco/")).toBeNull();
    expect(socialTarget("https://www.tiktok.com/@chef")).toBeNull();
    expect(socialTarget("https://www.facebook.com/marco")).toBeNull();
    expect(socialTarget("https://example.com/reel/1")).toBeNull();
    expect(socialTarget("niente link")).toBeNull();
  });
});

describe("risultati di Apify → forma comune", () => {
  it("Instagram: Reel, carosello e foto singola", () => {
    expect(normalizeInstagram({ type: "Video", caption: "Carbonara", ownerUsername: "chef", videoUrl: "https://cdn.test/v.mp4", displayUrl: "https://cdn.test/c.jpg" })).toMatchObject({
      kind: "video", caption: "Carbonara", author: "chef", videoUrl: "https://cdn.test/v.mp4", cover: "https://cdn.test/c.jpg",
    });
    const sidecar = normalizeInstagram({
      type: "Sidecar", caption: "5 errori", displayUrl: "https://cdn.test/1.jpg",
      childPosts: [{ displayUrl: "https://cdn.test/1.jpg" }, { displayUrl: "https://cdn.test/2.jpg" }],
      images: ["https://cdn.test/x.jpg"],
    });
    expect(sidecar).toMatchObject({ kind: "slides", imageUrls: ["https://cdn.test/1.jpg", "https://cdn.test/2.jpg"] });
    expect(normalizeInstagram({ type: "Sidecar", images: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"] }).imageUrls).toEqual(["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"]);
    expect(normalizeInstagram({ type: "Image", displayUrl: "https://cdn.test/a.jpg" })).toMatchObject({ kind: "slides", imageUrls: ["https://cdn.test/a.jpg"] });
    expect(normalizeInstagram({ caption: "solo testo" })).toMatchObject({ kind: null, caption: "solo testo" });
  });

  it("TikTok: sottotitoli, video salvato da Apify, slideshow", () => {
    const v = normalizeTiktok({
      text: "Ricetta veloce", authorMeta: { name: "chef" },
      videoMeta: { coverUrl: "https://cdn.test/c.jpg", subtitleLinks: [{ language: "ita-IT", downloadLink: "https://cdn.test/s.vtt" }] },
      mediaUrls: ["https://api.apify.com/v2/key-value-stores/s/records/video-1"],
    });
    expect(v).toMatchObject({ kind: "video", caption: "Ricetta veloce", author: "chef", videoUrl: "https://api.apify.com/v2/key-value-stores/s/records/video-1", subtitles: [{ language: "ita-IT", url: "https://cdn.test/s.vtt" }] });
    expect(normalizeTiktok({ isSlideshow: true, slideshowImageLinks: [{ downloadLink: "https://cdn.test/1.jpg" }, "https://cdn.test/2.jpg"] })).toMatchObject({
      kind: "slides", imageUrls: ["https://cdn.test/1.jpg", "https://cdn.test/2.jpg"],
    });
  });

  it("Facebook: video del Reel", () => {
    expect(normalizeFacebook({ text: "Allenamento", pageName: "Palestra", playable_url: "https://cdn.test/f.mp4" })).toMatchObject({ kind: "video", caption: "Allenamento", author: "Palestra", videoUrl: "https://cdn.test/f.mp4" });
    expect(normalizeFacebook({ text: "Solo testo" }).kind).toBeNull();
  });

  it("sottotitoli WebVTT → testo semplice senza tempi e ripetizioni", () => {
    const vtt = "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\n<c>Ciao a tutti</c>\n\n2\n00:00:02.000 --> 00:00:04.000\nCiao a tutti\noggi la carbonara\n";
    expect(subtitlesToText(vtt)).toBe("Ciao a tutti oggi la carbonara");
  });
});

describe("lettura completa dal link", () => {
  const reel = "https://www.instagram.com/reel/C9abc/?igsh=xyz";

  it("Reel: Apify legge il post, il server scarica il video e Gemini lo trascrive", async () => {
    pageInfo.value = { title: "Instagram", siteName: "Instagram" };
    const net = fakeNet({
      apify: [{ type: "Video", caption: "La vera carbonara\n#ricette", ownerUsername: "chef", videoUrl: "https://cdn.test/v.mp4", displayUrl: "https://cdn.test/c.jpg" }],
      media: { "https://cdn.test/v.mp4": bytes(1000, "video/mp4") },
      gemini: { title: "Carbonara senza panna", transcript: "Oggi facciamo la carbonara con guanciale e pecorino.", slides: [] },
    });
    const r = await readLink(reel, { env, fetchImpl: net.fetchImpl });
    expect(r).toMatchObject({
      status: "analyzed",
      detail: null,
      siteName: "Instagram",
      title: "Carbonara senza panna",
      description: "La vera carbonara\n#ricette",
      image: "https://cdn.test/c.jpg",
      finalUrl: "https://www.instagram.com/reel/C9abc/",
      text: "Oggi facciamo la carbonara con guanciale e pecorino.",
      textSource: "trascrizione dell'AI (video)",
    });
    const [call] = net.apify();
    expect(call.url).toContain("/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items");
    expect(call.init.headers.authorization).toBe("Bearer apify-key");
    expect(call.body.directUrls).toEqual(["https://www.instagram.com/reel/C9abc/"]);
    const part = net.gemini()[0].body.contents[0].parts.find((p) => p.inline_data);
    expect(part.inline_data).toEqual({ mime_type: "video/mp4", data: Buffer.alloc(1000, 1).toString("base64") });
  });

  it("carosello: ogni slide letta nell'ordine, quelle non scaricabili segnalate", async () => {
    const net = fakeNet({
      apify: [{ type: "Sidecar", caption: "5 errori in cucina", childPosts: [{ displayUrl: "https://cdn.test/1.jpg" }, { displayUrl: "https://cdn.test/2.jpg" }, { displayUrl: "https://cdn.test/3.jpg" }] }],
      media: { "https://cdn.test/1.jpg": bytes(10, "image/jpeg", 1), "https://cdn.test/3.jpg": bytes(10, "image/webp", 3) },
      gemini: { title: "Errori in cucina", transcript: "", slides: ["Errore 1: sale", "Errore 3: fuoco alto"] },
    });
    const r = await readLink("https://www.instagram.com/p/Cxyz/", { env, fetchImpl: net.fetchImpl });
    expect(r).toMatchObject({
      status: "partial",
      text: "Slide 1: Errore 1: sale\n\nSlide 2: Errore 3: fuoco alto",
      textSource: "testo delle slide letto dall'AI",
      detail: "Letto in parte: 1 slide su 3 non scaricabili.",
    });
    const parts = net.gemini()[0].body.contents[0].parts.filter((p) => p.inline_data);
    expect(parts.map((p) => p.inline_data.mime_type)).toEqual(["image/jpeg", "image/webp"]);
    expect(parts[1].inline_data.data).toBe(Buffer.alloc(10, 3).toString("base64"));
  });

  it("TikTok con sottotitoli: niente AI, testo dai sottotitoli", async () => {
    const net = fakeNet({
      apify: [{ text: "Pasta veloce", authorMeta: { name: "chef" }, videoMeta: { subtitleLinks: [{ language: "ita-IT", downloadLink: "https://cdn.test/s.vtt" }] }, mediaUrls: ["https://cdn.test/t.mp4"] }],
      media: { "https://cdn.test/s.vtt": new Response("WEBVTT\n\n00:00.000 --> 00:01.000\nAcqua e sale\n", { status: 200 }) },
    });
    const r = await readLink("https://www.tiktok.com/@chef/video/7312345678901234567", { env, fetchImpl: net.fetchImpl });
    expect(r).toMatchObject({ status: "analyzed", text: "Acqua e sale", textSource: "sottotitoli del video (TikTok)", siteName: "TikTok", title: "Pasta veloce" });
    expect(net.apify()[0].url).toContain("clockworks~tiktok-scraper");
    expect(net.apify()[0].body.postURLs).toEqual(["https://www.tiktok.com/@chef/video/7312345678901234567"]);
    expect(net.gemini()).toHaveLength(0);
  });

  it("video salvato su Apify: il download porta la chiave solo verso Apify", async () => {
    const seen = {};
    const net = fakeNet({
      apify: [{ text: "Allenamento", mediaUrls: ["https://api.apify.com/v2/key-value-stores/s/records/video-1"] }],
      gemini: { title: "Allenamento gambe", transcript: "Tre serie da dieci.", slides: [] },
    });
    const base = net.fetchImpl;
    const fetchImpl = (url, init) => {
      if (String(url).includes("key-value-stores")) {
        seen.auth = init.headers?.authorization;
        return Promise.resolve(bytes(50, "video/mp4"));
      }
      if (String(url).includes("cdn.test")) seen.cdnAuth = init.headers?.authorization;
      return base(url, init);
    };
    const r = await readLink("https://www.tiktok.com/@gym/video/7312345678901234567", { env, fetchImpl });
    expect(seen.auth).toBe("Bearer apify-key");
    expect(r).toMatchObject({ status: "analyzed", text: "Tre serie da dieci." });
  });

  it("video grande: caricato con la Files API di Gemini", async () => {
    const big = 15 * 1024 * 1024;
    const net = fakeNet({
      apify: [{ type: "Video", videoUrl: "https://cdn.test/big.mp4" }],
      media: { "https://cdn.test/big.mp4": bytes(big, "video/mp4") },
      gemini: { title: "Lungo", transcript: "Testo lungo.", slides: [] },
    });
    const r = await readLink(reel, { env, fetchImpl: net.fetchImpl });
    expect(r.text).toBe("Testo lungo.");
    const start = net.calls.find((c) => c.url.includes("/upload/v1beta/files"));
    expect(start.init.headers).toMatchObject({ "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": String(big) });
    const part = net.gemini()[0].body.contents[0].parts.find((p) => p.file_data);
    expect(part.file_data).toEqual({ mime_type: "video/mp4", file_uri: "https://generativelanguage.googleapis.com/v1beta/files/abc" });
  });

  it("video non scaricabile dal server: Gemini riceve l'indirizzo", async () => {
    const net = fakeNet({ apify: [{ type: "Video", videoUrl: "https://cdn.test/blocked.mp4" }], gemini: { title: "T", transcript: "Ciao.", slides: [] } });
    const r = await readLink(reel, { env, fetchImpl: net.fetchImpl });
    expect(r.text).toBe("Ciao.");
    expect(net.gemini()[0].body.contents[0].parts.find((p) => p.file_data).file_data).toEqual({ mime_type: "video/mp4", file_uri: "https://cdn.test/blocked.mp4" });
  });

  it("trascrizione fallita: resta la didascalia, la scheda dice perché", async () => {
    const net = fakeNet({
      apify: [{ type: "Video", caption: "Ricetta della nonna", videoUrl: "https://cdn.test/v.mp4" }],
      media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") },
      gemini: () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }),
    });
    const r = await readLink(reel, { env, fetchImpl: net.fetchImpl });
    expect(r).toMatchObject({ status: "partial", description: "Ricetta della nonna", title: "Ricetta della nonna", text: null });
    expect(r.detail).toMatch(/^Ho letto solo la didascalia, non il contenuto: trascrizione non riuscita/);
  });

  it("errori di Apify con messaggi chiari", async () => {
    const cases = [
      [() => json({ error: { type: "not-enough-usage" } }, 402), /Crediti gratuiti di Apify del mese esauriti/],
      [() => json({ error: { type: "token-not-valid" } }, 401), /controlla APIFY_TOKEN/],
      [() => json([]), /Post non leggibile: privato, rimosso o non disponibile/],
      [() => json([{ error: "not_found", errorDescription: "Post does not exist" }]), /Post does not exist/],
    ];
    for (const [apify, msg] of cases) {
      const net = fakeNet({ apify });
      const r = await readLink(reel, { env, fetchImpl: net.fetchImpl });
      expect(r.detail).toMatch(msg);
      expect(r.status).toBe("inaccessible");
      expect(net.gemini()).toHaveLength(0);
    }
  });

  it("senza APIFY_TOKEN: nessuna chiamata, la scheda dice cosa serve", async () => {
    pageInfo.value = { description: "Didascalia pubblica", status: "partial", detail: "Letta la didascalia pubblica." };
    const net = fakeNet();
    const r = await readLink(reel, { env: { GEMINI_API_KEY: "g" }, fetchImpl: net.fetchImpl });
    expect(net.calls).toHaveLength(0);
    expect(r).toMatchObject({ status: "partial", description: "Didascalia pubblica" });
    expect(r.detail).toMatch(/serve APIFY_TOKEN su Vercel/);
  });

  it("metadati della pagina non disponibili: basta Apify", async () => {
    pageInfo.value = "throw";
    const net = fakeNet({ apify: [{ type: "Video", videoUrl: "https://cdn.test/v.mp4" }], media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") }, gemini: { title: "T", transcript: "Ok.", slides: [] } });
    const r = await readLink(reel, { env, fetchImpl: net.fetchImpl });
    expect(r).toMatchObject({ status: "analyzed", text: "Ok.", siteName: "Instagram" });
  });

  it("altri siti: lettura normale, senza Apify", async () => {
    pageInfo.value = { title: "Articolo", status: "analyzed", detail: null };
    const net = fakeNet();
    const r = await readLink("https://example.com/articolo", { env, fetchImpl: net.fetchImpl });
    expect(r).toMatchObject({ title: "Articolo", status: "analyzed" });
    expect(net.calls).toHaveLength(0);
  });

  it("endpoint: richiede l'accesso e un link", async () => {
    expect((await handleRead({ authHeader: "", body: { url: reel }, env: {} })).status).toBe(503);
    expect((await handleRead({ body: {}, env: { ALLOW_NO_AUTH: "1" } })).status).toBe(400);
  });
});

describe("Comando Rapido con il link di un Reel", () => {
  it("salva subito, poi trascrive e applica l'AI", async () => {
    const calls = { save: [], update: [] };
    const db = {
      save: async (_t, item) => (calls.save.push(item), { id: "id-1", categories: [] }),
      update: async (_t, id, patch) => calls.update.push(patch),
    };
    const net = fakeNet({
      apify: [{ type: "Video", caption: "Carbonara", videoUrl: "https://cdn.test/v.mp4" }],
      media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") },
      gemini: (body) =>
        geminiReply(
          body.contents[0].parts.some((p) => p.inline_data)
            ? { title: "Carbonara perfetta", transcript: "Guanciale, uova e pecorino.", slides: [] }
            : { summary: "Ricetta.", categories: ["Ricette"], tags: ["Carbonara"] },
        ),
    });
    const r = await handleShare({
      body: { token: TOKEN, text: "https://www.instagram.com/reel/C9abc/?igsh=1" },
      env: { ...env, SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" },
      db,
      fetchImpl: net.fetchImpl,
    });
    expect(r).toMatchObject({ status: 200, text: expect.stringMatching(/leggo e trascrivo il post/) });
    expect(calls.save[0]).toMatchObject({ type: "social", status: "processing" });
    expect(calls.update[0]).toMatchObject({
      title: "Carbonara perfetta",
      extracted_text: "Guanciale, uova e pecorino.",
      text_source: "trascrizione dell'AI (video)",
      status: "analyzed",
      categories: ["Ricette"],
    });
  });
});
