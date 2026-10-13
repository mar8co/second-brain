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

const { apifyError, facebookVideoId, isFacebookVideoLink, normalizeInstagram, normalizeTiktok, normalizeFacebook, readLink, resolveFacebookUrl, socialTarget, subtitlesToText } = await import("./social.js");
const { handleShare } = await import("./share.js");
const { handleRead } = await import("./read.js");
const { callGemini, endsInLoop, loopStart } = await import("./ai.js");
const { partialJsonString, uploadToGemini, videoPart } = await import("./media.js");

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
    if (u.startsWith("https://api.apify.com/v2/acts/")) return typeof apify === "function" ? apify(u, body) : json(apify, 201);
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
    expect(socialTarget("https://www.instagram.com/share/BAC6cDeb_-?igsh=1")).toEqual({ platform: "instagram", url: "https://www.instagram.com/share/BAC6cDeb_-" });
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
    // Alcune modalità di Apify elencano le slide in carouselImages.
    expect(normalizeInstagram({ type: "Sidecar", carouselImages: ["https://cdn.test/c1.jpg", "https://cdn.test/c2.jpg"] }).imageUrls).toEqual(["https://cdn.test/c1.jpg", "https://cdn.test/c2.jpg"]);
    expect(normalizeInstagram({ caption: "solo testo" })).toMatchObject({ kind: null, caption: "solo testo" });
    // Reel senza videoUrl ma con la traccia audio separata.
    expect(normalizeInstagram({ type: "Video", audioUrl: "https://cdn.test/a.mp4" })).toMatchObject({ kind: "video", videoUrl: "https://cdn.test/a.mp4" });
  });

  it("TikTok: sottotitoli, video salvato da Apify, slideshow", () => {
    const v = normalizeTiktok({
      text: "Ricetta veloce", authorMeta: { name: "chef" },
      videoMeta: {
        coverUrl: "https://cdn.test/c.jpg",
        subtitleLinks: [
          { language: "eng-US", downloadLink: "https://cdn.test/en.vtt", source: "MT" },
          { language: "ita-IT", downloadLink: "https://cdn.test/s.vtt", source: "ASR" },
        ],
      },
      mediaUrls: ["https://api.apify.com/v2/key-value-stores/s/records/video-1"],
    });
    expect(v).toMatchObject({ kind: "video", caption: "Ricetta veloce", author: "chef", videoUrl: "https://api.apify.com/v2/key-value-stores/s/records/video-1" });
    // Prima la lingua originale, poi la traduzione automatica.
    expect(v.subtitles.map((x) => x.language)).toEqual(["ita-IT", "eng-US"]);
    expect(normalizeTiktok({ isSlideshow: true, mediaUrls: [], videoMeta: { duration: 0, subtitleLinks: null }, slideshowImageLinks: [{ tiktokLink: "https://cdn.test/t1.jpg", downloadLink: "https://cdn.test/1.jpg" }, "https://cdn.test/2.jpg"] })).toMatchObject({
      kind: "slides", imageUrls: ["https://cdn.test/1.jpg", "https://cdn.test/2.jpg"],
    });
  });

  it("Facebook: Reel, video e post di una pagina (forme di apify/facebook-posts-scraper)", () => {
    const reel = normalizeFacebook({
      facebookUrl: "https://www.facebook.com/reel/1121155692481577/",
      pageName: "cybernewscom",
      message: { text: "You can play Doom on a pdf", ranges: [] },
      short_form_video_context: {
        video: { id: "1121155692481577", first_frame_thumbnail: "https://cdn.test/first.jpg" },
        playback_video: {
          length_in_second: 42,
          captions_url: null,
          thumbnailImage: { uri: "https://cdn.test/thumb.jpg" },
          videoDeliveryLegacyFields: { browser_native_hd_url: null, browser_native_sd_url: "https://video.test/sd.mp4" },
        },
        video_owner: { name: "CyberNews" },
      },
    });
    expect(reel).toMatchObject({ kind: "video", caption: "You can play Doom on a pdf", author: "cybernewscom", videoUrl: "https://video.test/sd.mp4", cover: "https://cdn.test/thumb.jpg", subtitles: [] });

    const watch = normalizeFacebook({
      __typename: "Video",
      previewTitle: "Allenamento gambe",
      captions_url: "https://cdn.test/c.srt",
      preferred_thumbnail: { image: { uri: "https://cdn.test/p.jpg" } },
      videoDeliveryLegacyFields: { browser_native_hd_url: "https://video.test/hd.mp4", browser_native_sd_url: "https://video.test/sd.mp4" },
    });
    expect(watch).toMatchObject({ kind: "video", caption: "Allenamento gambe", videoUrl: "https://video.test/hd.mp4", subtitles: [{ url: "https://cdn.test/c.srt" }] });

    const feed = normalizeFacebook({ text: "Post della pagina", user: { name: "Palestra" }, media: [{ __typename: "Video", thumbnail: "https://cdn.test/t.jpg", videoDeliveryLegacyFields: { browser_native_sd_url: "https://video.test/f.mp4" } }] });
    expect(feed).toMatchObject({ kind: "video", caption: "Post della pagina", author: "Palestra", videoUrl: "https://video.test/f.mp4" });

    const photos = normalizeFacebook({ text: "Menu del giorno", media: [{ __typename: "Photo", photo_image: { uri: "https://cdn.test/m1.jpg" }, thumbnail: "https://cdn.test/t1.jpg" }, { __typename: "Photo", thumbnail: "https://cdn.test/t2.jpg" }] });
    expect(photos).toMatchObject({ kind: "slides", imageUrls: ["https://cdn.test/m1.jpg", "https://cdn.test/t2.jpg"], caption: "Menu del giorno" });

    // Campi di altri servizi (playable_url) o nessun video: niente da trascrivere.
    expect(normalizeFacebook({ text: "Solo testo", playable_url: "https://video.test/x.mp4" }).kind).toBeNull();
  });

  it("Facebook: identificativo del video da link diretti e pagina di accesso", () => {
    expect(facebookVideoId("https://www.facebook.com/reel/123456/?s=1")).toBe("123456");
    expect(facebookVideoId("https://www.facebook.com/watch/?v=987")).toBe("987");
    expect(facebookVideoId("https://www.facebook.com/Palestra/videos/555/")).toBe("555");
    expect(facebookVideoId("https://www.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2Freel%2F777%2F")).toBe("777");
    expect(facebookVideoId("https://example.com/reel/1")).toBeNull();
  });

  it("Facebook: i link di condivisione vengono risolti seguendo i reindirizzamenti", async () => {
    const landed = (url) => async () => Object.defineProperty(new Response("<html></html>"), "url", { value: url });
    expect(await resolveFacebookUrl("https://www.facebook.com/share/r/1AbCd/", landed("https://www.facebook.com/reel/42/?rdid=x"))).toBe("https://www.facebook.com/reel/42");
    expect(await resolveFacebookUrl("https://fb.watch/abc/", landed("https://www.facebook.com/Pagina/videos/43/"))).toBe("https://www.facebook.com/watch/?v=43");
    expect(await resolveFacebookUrl("https://www.facebook.com/share/v/1AbCd/", landed("https://www.facebook.com/share/v/1AbCd/"))).toBe("https://www.facebook.com/share/v/1AbCd/");
    expect(await resolveFacebookUrl("https://fb.watch/abc/", async () => Promise.reject(new Error("rete")))).toBe("https://fb.watch/abc/");
    // I link già diretti non vengono aperti.
    let opened = false;
    expect(await resolveFacebookUrl("https://www.facebook.com/reel/42", async () => ((opened = true), new Response("")))).toBe("https://www.facebook.com/reel/42");
    expect(opened).toBe(false);
  });

  it("errori di Apify → messaggi per la scheda", () => {
    expect(apifyError(402, "x402-payment-required")).toMatch(/Crediti gratuiti di Apify/);
    expect(apifyError(403, "not-enough-usage-to-run-paid-actor")).toMatch(/Crediti gratuiti di Apify/);
    expect(apifyError(403, "insufficient-permissions")).toMatch(/permessi/);
    expect(apifyError(401, "invalid-token")).toMatch(/APIFY_TOKEN/);
    expect(apifyError(400, "actor-memory-limit-exceeded")).toMatch(/Troppi link letti insieme/);
    // Limite di memoria del piano gratuito (stato 402): non sono i crediti del mese.
    expect(apifyError(402, "actor-memory-limit-exceeded")).toMatch(/Troppi link letti insieme/);
    expect(apifyError(402, "max-concurrent-runs-exceeded")).toMatch(/Troppi link letti insieme/);
    expect(apifyError(408, "run-timeout-exceeded", "tiktok")).toMatch(/TikTok ha risposto troppo lentamente/);
    expect(apifyError(500, "")).toBe("Lettura del post non riuscita (Apify 500).");
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

  it("TikTok con sottotitoli: niente AI, testo dai sottotitoli salvati su Apify", async () => {
    const vtt = "https://api.apify.com/v2/key-value-stores/k/records/subtitle-chef-1-ita-IT.vtt";
    let auth = null;
    const net = fakeNet({
      apify: [{
        text: "Pasta veloce", authorMeta: { name: "chef" }, isSlideshow: false,
        videoMeta: { duration: 30, subtitleLinks: [{ language: "ita-IT", downloadLink: vtt, tiktokLink: "https://cdn.test/s.vtt", source: "ASR" }] },
        mediaUrls: ["https://api.apify.com/v2/key-value-stores/k/records/video-chef-1.mp4"],
      }],
      media: { [vtt]: (init) => ((auth = init.headers?.authorization), new Response("WEBVTT\n\n00:00.000 --> 00:01.000\nAcqua e sale\n", { status: 200, headers: { "content-type": "text/vtt" } })) },
    });
    const r = await readLink("https://www.tiktok.com/@chef/video/7312345678901234567", { env, fetchImpl: net.fetchImpl });
    expect(r).toMatchObject({ status: "analyzed", text: "Acqua e sale", textSource: "sottotitoli del video (TikTok)", siteName: "TikTok", title: "Pasta veloce" });
    expect(auth).toBe("Bearer apify-key");
    const [call] = net.apify();
    expect(call.url).toContain("/v2/acts/clockworks~tiktok-video-scraper/run-sync-get-dataset-items");
    expect(call.body).toEqual({
      postURLs: ["https://www.tiktok.com/@chef/video/7312345678901234567"],
      shouldDownloadVideos: true,
      shouldDownloadSlideshowImages: true,
      shouldDownloadCovers: false,
      downloadSubtitlesOptions: "DOWNLOAD_SUBTITLES",
    });
    expect(net.gemini()).toHaveLength(0);
  });

  it("TikTok privato o rimosso: errore leggibile dal codice di Apify", async () => {
    const net = fakeNet({ apify: [{ url: "https://www.tiktok.com/@x/video/1", input: "x", error: "Post not found or private", errorCode: "POST_NOT_FOUND_OR_PRIVATE" }] });
    const r = await readLink("https://www.tiktok.com/@x/video/7312345678901234567", { env, fetchImpl: net.fetchImpl });
    expect(r.status).toBe("inaccessible");
    expect(r.detail).toBe("Post non leggibile: privato, rimosso o non disponibile. (Post not found or private, POST_NOT_FOUND_OR_PRIVATE)");
  });

  it("Facebook: link di condivisione risolto, Reel senza video riletto dalla pagina watch", async () => {
    let n = 0;
    const net = fakeNet({
      apify: (u, body) => {
        n += 1;
        if (n === 1) {
          expect(body).toEqual({ startUrls: [{ url: "https://www.facebook.com/reel/42" }], resultsLimit: 1, captionText: false });
          return json([{ pageName: "Palestra", message: { text: "Allenamento gambe" }, short_form_video_context: { playback_video: { videoDeliveryLegacyFields: { browser_native_hd_url: null, browser_native_sd_url: null } } } }], 201);
        }
        expect(body.startUrls).toEqual([{ url: "https://www.facebook.com/watch/?v=42" }]);
        return json([{ __typename: "Video", videoDeliveryLegacyFields: { browser_native_sd_url: "https://video.test/sd.mp4" } }], 201);
      },
      media: {
        "https://www.facebook.com/share/r/1AbCd/": () => Object.defineProperty(new Response(""), "url", { value: "https://www.facebook.com/reel/42/" }),
        "https://video.test/sd.mp4": bytes(20, "video/mp4"),
      },
      gemini: { title: "Squat e affondi", transcript: "Tre serie di squat.", slides: [] },
    });
    const r = await readLink("https://www.facebook.com/share/r/1AbCd/", { env, fetchImpl: net.fetchImpl });
    expect(net.apify()[0].url).toContain("/v2/acts/apify~facebook-posts-scraper/");
    expect(n).toBe(2);
    expect(r).toMatchObject({ status: "analyzed", siteName: "Facebook", description: "Allenamento gambe", text: "Tre serie di squat.", textSource: "trascrizione dell'AI (video)" });
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

  it("video salvato su Apify non scaricabile: nessun indirizzo passato a Gemini", async () => {
    const net = fakeNet({ apify: [{ text: "Allenamento", mediaUrls: ["https://api.apify.com/v2/key-value-stores/s/records/video-1.mp4"] }] });
    const r = await readLink("https://www.tiktok.com/@gym/video/7312345678901234567", { env, fetchImpl: net.fetchImpl });
    expect(net.gemini()).toHaveLength(0);
    expect(r).toMatchObject({ status: "partial", description: "Allenamento" });
    expect(r.detail).toMatch(/trascrizione non riuscita \(download non riuscito \(404\)\)/);
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
      [() => json({ error: { type: "x402-payment-required", message: "Insufficient credits" } }, 402), /Crediti gratuiti di Apify del mese esauriti/],
      [() => json({ error: { type: "invalid-token" } }, 401), /controlla APIFY_TOKEN/],
      [() => json([], 201), /Post non leggibile: privato, rimosso o non disponibile/],
      [() => json([{ inputUrl: reel, error: "not_found", errorDescription: "Post does not exist" }], 201), /Post does not exist/],
      [() => json([{ url: reel, error: "no_items", errorDescription: "Empty or private data for provided input" }], 201), /Empty or private data/],
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

  it("carosello con slide video: la scheda dice che il parlato non è stato trascritto", async () => {
    const net = fakeNet({
      apify: [{ type: "Sidecar", childPosts: [{ type: "Video", displayUrl: "https://cdn.test/1.jpg", videoUrl: "https://cdn.test/1.mp4" }, { type: "Image", displayUrl: "https://cdn.test/2.jpg" }] }],
      media: { "https://cdn.test/1.jpg": bytes(5, "image/jpeg"), "https://cdn.test/2.jpg": bytes(5, "image/jpeg") },
      gemini: { title: "T", transcript: "", slides: ["[Persona che parla]", "Ricetta"] },
    });
    const r = await readLink("https://www.instagram.com/p/Cmix/", { env, fetchImpl: net.fetchImpl });
    expect(r.status).toBe("partial");
    expect(r.detail).toBe("Letto in parte: 1 slide video lette solo come immagine, parlato non trascritto.");
  });

  it("slideshow TikTok oltre 20 immagini: lette le prime 20, la scheda lo dice", async () => {
    const links = Array.from({ length: 25 }, (_, i) => ({ downloadLink: `https://cdn.test/s${i}.jpg` }));
    const media = Object.fromEntries(links.map((l) => [l.downloadLink, bytes(3, "image/jpeg")]));
    const net = fakeNet({ apify: [{ isSlideshow: true, mediaUrls: [], slideshowImageLinks: links }], media, gemini: { title: "T", transcript: "", slides: ["a"] } });
    const r = await readLink("https://www.tiktok.com/@x/photo/7312345678901234567", { env, fetchImpl: net.fetchImpl });
    expect(net.gemini()[0].body.contents[0].parts.filter((p) => p.inline_data)).toHaveLength(20);
    expect(r).toMatchObject({ status: "partial", detail: "Letto in parte: lette solo le prime 20 slide su 25." });
  });

  it("Apify risponde con lo stato della corsa invece dei dati: lettura troppo lenta", async () => {
    const net = fakeNet({ apify: () => json({ data: { id: "run1", status: "RUNNING" } }, 201) });
    const r = await readLink(reel, { env, fetchImpl: net.fetchImpl });
    expect(r.detail).toMatch(/Instagram ha risposto troppo lentamente/);
  });

  it("video lungo: risposta di Gemini interrotta al limite, si tiene la parte trascritta", async () => {
    const cut = '{"title": "Lezione lunga", "transcript": "Prima parte della lezione \\u00e8 importante, poi';
    const net = fakeNet({
      apify: [{ type: "Video", videoUrl: "https://cdn.test/v.mp4" }],
      media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") },
      gemini: () => new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: cut }] } }] }), { status: 200 }),
    });
    const r = await readLink(reel, { env, fetchImpl: net.fetchImpl });
    // Un solo tentativo: gli altri modelli hanno lo stesso limite.
    expect(net.gemini()).toHaveLength(1);
    expect(r).toMatchObject({ status: "partial", title: "Lezione lunga", text: "Prima parte della lezione è importante, poi", detail: "Letto in parte: video lungo, trascritta solo la prima parte." });
  });

  it("Gemini ripete la stessa frase fino al limite: risposta scartata, si prova un altro modello", async () => {
    const loop = '{"title": "Musica", "transcript": "Ciao a tutti, ' + "e poi ".repeat(600);
    let n = 0;
    const net = fakeNet({
      apify: [{ type: "Video", videoUrl: "https://cdn.test/v.mp4" }],
      media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") },
      gemini: () =>
        n++ === 0
          ? new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: loop }] } }] }), { status: 200 })
          : geminiReply({ title: "Musica", transcript: "Ciao a tutti.", slides: [] }),
    });
    const r = await readLink(reel, { env, fetchImpl: net.fetchImpl });
    expect(net.gemini()).toHaveLength(2);
    expect(r).toMatchObject({ status: "analyzed", text: "Ciao a tutti." });
  });

  it("ciclo del modello e altri modelli non disponibili: resta la parte scritta prima del ciclo", async () => {
    const loop = '{"title": "Lezione", "transcript": "Oggi parliamo di pane. ' + "e poi ".repeat(600);
    let n = 0;
    const net = fakeNet({
      apify: [{ type: "Video", videoUrl: "https://cdn.test/v.mp4" }],
      media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") },
      gemini: () =>
        n++ === 0
          ? new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: loop }] } }] }), { status: 200 })
          : new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }),
    });
    const r = await readLink(reel, { env, fetchImpl: net.fetchImpl });
    expect(r).toMatchObject({ status: "partial", text: "Oggi parliamo di pane.", detail: "Letto in parte: trascrizione interrotta dall'AI, salvata solo la prima parte." });
  });

  it("posizione d'inizio del ciclo", () => {
    const text = "Oggi parliamo di pane. " + "e poi ".repeat(400);
    expect(text.slice(0, loopStart(text)).trim()).toBe("Oggi parliamo di pane.");
    expect(loopStart("x".repeat(2000))).toBe(0);
    expect(loopStart("breve")).toBe(-1);
  });

  it("riconosce un ciclo del modello, non un testo lungo normale", () => {
    expect(endsInLoop("Inizio. " + "e poi ".repeat(400))).toBe(true);
    expect(endsInLoop("x".repeat(50) + "Mescola la farina con le uova. ".repeat(60))).toBe(true);
    const prose = Array.from({ length: 200 }, (_, i) => `Frase numero ${i} della lezione.`).join(" ");
    expect(endsInLoop(prose)).toBe(false);
    expect(endsInLoop("ah ah ah")).toBe(false);
  });

  it("Facebook: post di solo testo, la scheda non dice che mancano video o foto", async () => {
    const net = fakeNet({ apify: [{ text: "Avviso: domani chiuso", pageName: "Comune" }] });
    const r = await readLink("https://www.facebook.com/Comune/posts/pfbid0abc", { env, fetchImpl: net.fetchImpl });
    expect(r.detail).toBe("Ho letto solo la didascalia, non il contenuto: il post non contiene video o immagini leggibili.");
  });

  it("Facebook: pagina con un nome come watch.qualcosa, post di solo testo", async () => {
    const net = fakeNet({ apify: [{ text: "Nuova stagione", pageName: "Watch Dogs" }] });
    const r = await readLink("https://www.facebook.com/watch.dogs.italia/posts/pfbid0abc", { env, fetchImpl: net.fetchImpl });
    expect(r.detail).toMatch(/il post non contiene video o immagini leggibili/);
    expect(isFacebookVideoLink("https://www.facebook.com/reel.estate/posts/pfbid0")).toBe(false);
    expect(isFacebookVideoLink("https://www.facebook.com/watch/?v=123")).toBe(true);
    expect(isFacebookVideoLink("https://www.facebook.com/watch/")).toBe(true);
    expect(isFacebookVideoLink("https://www.facebook.com/Pagina/videos/")).toBe(true);
    expect(isFacebookVideoLink("https://www.facebook.com/share/v/1AbC/")).toBe(true);
    expect(isFacebookVideoLink("https://fb.watch/abc/")).toBe(true);
  });

  it("Facebook: Reel senza file del video, la scheda lo dice", async () => {
    const net = fakeNet({ apify: [{ message: { text: "Allenamento" }, short_form_video_context: { playback_video: {} } }] });
    const r = await readLink("https://www.facebook.com/watch/?v=123", { env, fetchImpl: net.fetchImpl });
    expect(r.detail).toBe("Ho letto solo la didascalia, non il contenuto: Facebook non ha fornito il file del video.");
  });

  it("video senza parlato né testo: la scheda lo dice chiaramente", async () => {
    const net = fakeNet({ apify: [{ type: "Video", caption: "Tramonto", videoUrl: "https://cdn.test/v.mp4" }], media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") }, gemini: { title: "Tramonto al mare", transcript: "", slides: [] } });
    const r = await readLink(reel, { env, fetchImpl: net.fetchImpl });
    expect(r).toMatchObject({ status: "partial", detail: "Ho letto solo la didascalia, non il contenuto: nel video non c'è né parlato né testo da trascrivere." });
  });

  it("YouTube: il dettaglio dei soli metadati viene sostituito dall'esito della trascrizione", async () => {
    pageInfo.value = { title: "Short", siteName: "YouTube", status: "partial", detail: "Letti titolo e autore; la trascrizione non è disponibile senza accesso all'account." };
    const net = fakeNet({ gemini: () => new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 }) });
    const r = await readLink("https://www.youtube.com/shorts/AbC_123-xyz", { env, fetchImpl: net.fetchImpl });
    expect(r.detail).toMatch(/^Titolo e autore letti da YouTube; trascrizione non riuscita: /);
    expect(r.detail).not.toMatch(/account/);
  });

  it("solo la traccia audio: dichiarata a Gemini come video/mp4", async () => {
    const part = await videoPart({ env, url: "https://cdn.test/a.mp4", fetchImpl: async () => bytes(4, "audio/mp4") });
    expect(part.inline_data.mime_type).toBe("video/mp4");
  });
});

describe("Gemini: tempi e caricamenti", () => {
  it("nessuna chiamata oltre la scadenza", async () => {
    let calls = 0;
    await expect(callGemini({ env, prompt: "x", fetchImpl: async () => (calls++, geminiReply({})), deadline: Date.now() + 5_000 })).rejects.toThrow(/Tempo esaurito/);
    expect(calls).toBe(0);
  });

  it("errore momentaneo durante l'attesa del file: si continua ad aspettare", async () => {
    let polls = 0;
    const fetchImpl = async (url) => {
      const u = String(url);
      if (u.includes("/upload/v1beta/files")) return new Response("{}", { status: 200, headers: { "x-goog-upload-url": "https://upload.test/s" } });
      if (u === "https://upload.test/s") return json({ file: { name: "files/f1", uri: "https://g.test/files/f1", state: "PROCESSING" } });
      polls += 1;
      if (polls === 1) return json({ error: { code: 503, message: "unavailable" } }, 503);
      return json({ name: "files/f1", uri: "https://g.test/files/f1", mimeType: "video/mp4", state: "ACTIVE" });
    };
    vi.useFakeTimers();
    try {
      const p = uploadToGemini({ env, data: Buffer.alloc(10), mime: "video/mp4", fetchImpl, deadline: Date.now() + 60_000 });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await p).toEqual({ file_data: { mime_type: "video/mp4", file_uri: "https://g.test/files/f1" } });
      expect(polls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("testo di una risposta interrotta", () => {
    expect(partialJsonString('{"transcript": "a\\nb \\u00e8 c \\u00', "transcript")).toBe("a\nb è c ");
    expect(partialJsonString('{"title": "x"}', "transcript")).toBe("");
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

  it("didascalia lunghissima: tagliata ai limiti del database prima di scrivere", async () => {
    const updates = [];
    const db = { save: async () => ({ id: "id-1", categories: [] }), update: async (_t, _id, patch) => updates.push(patch) };
    // Senza GEMINI_API_KEY niente Apify: restano i metadati (finti) della pagina, lunghissimi.
    pageInfo.value = { description: "x".repeat(9000), title: "t".repeat(400) };
    await handleShare({ body: { token: TOKEN, text: "https://www.instagram.com/reel/C9abc/" }, env: { APIFY_TOKEN: "k", GEMINI_API_KEY: "", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" }, db, fetchImpl: fakeNet().fetchImpl });
    expect(updates[0].description).toHaveLength(4000);
    expect(updates[0].title).toHaveLength(300);
  });
});

describe("Comando Rapido: modifiche fatte nell'app durante la lettura", () => {
  const reelUrl = "https://www.instagram.com/reel/C9abc/";
  const net = () =>
    fakeNet({
      apify: [{ type: "Video", caption: "Carbonara", videoUrl: "https://cdn.test/v.mp4" }],
      media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") },
      gemini: (body) =>
        geminiReply(body.contents[0].parts.some((p) => p.inline_data) ? { title: "Carbonara perfetta", transcript: "Guanciale.", slides: [] } : { summary: "Ricetta.", categories: ["Ricette"], tags: ["Pasta"] }),
    });
  const shareEnv = { ...env, SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };

  it("titolo e categorie dell'utente restano", async () => {
    const updates = [];
    const db = {
      save: async () => ({ id: "id-1", categories: [] }),
      get: async () => ({ id: "id-1", url: reelUrl, title: "Mio titolo", description: null, categories: ["Cena"], tags: [], ai: null }),
      update: async (_t, _id, patch) => updates.push(patch),
    };
    await handleShare({ body: { token: TOKEN, text: reelUrl }, env: shareEnv, db, fetchImpl: net().fetchImpl });
    expect(updates[0]).not.toHaveProperty("title");
    expect(updates[0]).toMatchObject({ status: "analyzed", extracted_text: "Guanciale.", categories: ["Cena", "Ricette"] });
  });

  it("elemento eliminato nel frattempo: nessuna scrittura", async () => {
    const updates = [];
    const db = { save: async () => ({ id: "id-1", categories: [] }), get: async () => null, update: async (_t, _id, patch) => updates.push(patch) };
    await handleShare({ body: { token: TOKEN, text: reelUrl }, env: shareEnv, db, fetchImpl: net().fetchImpl });
    expect(updates).toHaveLength(0);
  });

  it("lettura dell'elemento non disponibile: si scrive come prima", async () => {
    const updates = [];
    const db = {
      save: async () => ({ id: "id-1", categories: [] }),
      get: async () => {
        throw new Error("function share_get does not exist");
      },
      update: async (_t, _id, patch) => updates.push(patch),
    };
    await handleShare({ body: { token: TOKEN, text: reelUrl }, env: shareEnv, db, fetchImpl: net().fetchImpl });
    expect(updates[0]).toMatchObject({ title: "Carbonara perfetta", extracted_text: "Guanciale." });
  });
});

describe("lettura dall'app in background (modalità sincronizzata)", () => {
  const ID = "0b8a3c5e-1f2d-4c3b-9a8e-7d6c5b4a3f21";
  const fakeDb = (row) => {
    const writes = [];
    return { writes, get: async (id) => (id === ID ? row : null), update: async (id, patch) => writes.push({ id, patch }) };
  };
  const envAuth = { ...env, ALLOW_NO_AUTH: "1" };
  // Token di sessione (solo la scadenza conta qui: la verifica è disattivata).
  const jwt = (expMs) => `Bearer h.${Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000) })).toString("base64url")}.s`;
  const authHeader = jwt(Date.now() + 3600_000);

  it("post social: risponde subito, poi scrive il risultato con l'AI se richiesta", async () => {
    const db = fakeDb({ id: ID, url: "https://www.instagram.com/reel/C9abc/", title: null, categories: [], tags: [] });
    const jobs = [];
    const net = fakeNet({
      apify: [{ type: "Video", caption: "Carbonara", videoUrl: "https://cdn.test/v.mp4" }],
      media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") },
      gemini: (body) =>
        geminiReply(body.contents[0].parts.some((p) => p.inline_data) ? { title: "Carbonara perfetta", transcript: "Guanciale e pecorino.", slides: [] } : { summary: "Ricetta.", categories: ["Ricette"], tags: ["Pasta"] }),
    });
    const r = await handleRead({ authHeader, body: { url: "https://www.instagram.com/reel/C9abc/", id: ID, ai: true, categories: ["Ricette"] }, env: envAuth, fetchImpl: net.fetchImpl, waitUntil: (p) => jobs.push(p), db });
    expect(r).toEqual({ status: 202, json: { background: true } });
    await Promise.all(jobs);
    expect(db.writes[0]).toMatchObject({ id: ID, patch: { status: "analyzed", extracted_text: "Guanciale e pecorino.", title: "Carbonara perfetta", categories: ["Ricette"], tags: ["pasta"] } });
    expect(db.writes[0].patch.ai).toMatchObject({ applied: true });
  });

  it("modifiche fatte durante la lettura: titolo, trascrizione e categorie dell'utente restano", async () => {
    const before = { id: ID, url: "https://www.instagram.com/reel/C9abc/", title: null, categories: [], tags: [] };
    const edited = { ...before, title: "Mio titolo", categories: ["Cena"], tags: ["mie"], extracted_text: "Incollata.", text_source: "trascrizione incollata da te" };
    let reads = 0;
    const writes = [];
    const db = { get: async () => (reads++ === 0 ? before : edited), update: async (id, patch) => writes.push(patch) };
    const net = fakeNet({
      apify: [{ type: "Video", caption: "Carbonara", videoUrl: "https://cdn.test/v.mp4" }],
      media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") },
      gemini: (body) =>
        geminiReply(body.contents[0].parts.some((p) => p.inline_data) ? { title: "Carbonara perfetta", transcript: "Guanciale.", slides: [] } : { summary: "Ricetta.", categories: ["Ricette"], tags: ["Pasta"] }),
    });
    await handleRead({ authHeader, body: { url: before.url, id: ID, ai: true }, env: envAuth, fetchImpl: net.fetchImpl, db });
    expect(writes[0]).not.toHaveProperty("title");
    expect(writes[0]).not.toHaveProperty("extracted_text");
    expect(writes[0]).toMatchObject({ status: "analyzed", categories: ["Cena", "Ricette"], tags: ["mie", "pasta"] });
  });

  it("proposte AI rigenerate dall'utente durante la lettura: restano le sue", async () => {
    const before = { id: ID, url: "https://www.instagram.com/reel/C9abc/", categories: [], tags: [] };
    const regenerated = { ...before, ai: { summary: "Sua.", categories: ["Primi"], tags: [], generated_at: "2026-10-13T10:00:00Z" } };
    let reads = 0;
    const writes = [];
    const db = { get: async () => (reads++ === 0 ? before : regenerated), update: async (id, patch) => writes.push(patch) };
    const net = fakeNet({
      apify: [{ type: "Video", caption: "Carbonara", videoUrl: "https://cdn.test/v.mp4" }],
      media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") },
      gemini: (body) =>
        geminiReply(body.contents[0].parts.some((p) => p.inline_data) ? { title: "T", transcript: "Guanciale.", slides: [] } : { summary: "Ricetta.", categories: ["Ricette"], tags: [] }),
    });
    await handleRead({ authHeader, body: { url: before.url, id: ID, ai: true }, env: envAuth, fetchImpl: net.fetchImpl, db });
    expect(writes[0]).toMatchObject({ status: "analyzed", extracted_text: "Guanciale." });
    expect(writes[0]).not.toHaveProperty("ai");
    expect(writes[0]).not.toHaveProperty("categories");
  });

  it("elemento eliminato durante la lettura: nessuna scrittura", async () => {
    let reads = 0;
    const writes = [];
    const db = { get: async () => (reads++ === 0 ? { id: ID, url: "https://www.instagram.com/reel/C9abc/" } : null), update: async (id, patch) => writes.push(patch) };
    const net = fakeNet({ apify: [{ type: "Video", videoUrl: "https://cdn.test/v.mp4" }], media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") }, gemini: { title: "T", transcript: "Testo.", slides: [] } });
    await handleRead({ authHeader, body: { url: "https://www.instagram.com/reel/C9abc/", id: ID }, env: envAuth, fetchImpl: net.fetchImpl, db });
    expect(writes).toHaveLength(0);
  });

  it("token di sessione in scadenza: niente background, il risultato torna all'app", async () => {
    const db = fakeDb({ id: ID, url: "https://www.instagram.com/reel/C9abc/", categories: [], tags: [] });
    const net = fakeNet({ apify: [{ type: "Video", caption: "Carbonara", videoUrl: "https://cdn.test/v.mp4" }], media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") }, gemini: { title: "T", transcript: "Testo.", slides: [] } });
    const r = await handleRead({ authHeader: jwt(Date.now() + 120_000), body: { url: "https://www.instagram.com/reel/C9abc/", id: ID }, env: envAuth, fetchImpl: net.fetchImpl, db });
    expect(r).toMatchObject({ status: 200, json: { status: "analyzed", text: "Testo." } });
    expect(db.writes).toHaveLength(0);
  });

  it("AI automatica disattivata: nessuna classificazione", async () => {
    const db = fakeDb({ id: ID, url: "https://www.instagram.com/reel/C9abc/", categories: [], tags: [] });
    const net = fakeNet({ apify: [{ type: "Video", caption: "Carbonara", videoUrl: "https://cdn.test/v.mp4" }], media: { "https://cdn.test/v.mp4": bytes(10, "video/mp4") }, gemini: { title: "T", transcript: "Testo.", slides: [] } });
    await handleRead({ authHeader, body: { url: "https://www.instagram.com/reel/C9abc/", id: ID, ai: false }, env: envAuth, fetchImpl: net.fetchImpl, db });
    expect(net.gemini()).toHaveLength(1);
    expect(db.writes[0].patch.ai).toBeUndefined();
  });

  it("elemento non trovato (o di un altro utente): 404, nessuna lettura", async () => {
    const net = fakeNet();
    const r = await handleRead({ authHeader, body: { url: "https://www.instagram.com/reel/C9abc/", id: "0b8a3c5e-1f2d-4c3b-9a8e-000000000000" }, env: envAuth, fetchImpl: net.fetchImpl, db: fakeDb(null) });
    expect(r.status).toBe(404);
    expect(net.calls).toHaveLength(0);
  });

  it("link normale con id: risposta immediata come prima", async () => {
    pageInfo.value = { title: "Articolo", status: "analyzed", detail: null };
    const db = fakeDb({ id: ID, url: "https://example.com/a" });
    const r = await handleRead({ authHeader, body: { url: "https://example.com/a", id: ID }, env: envAuth, db });
    expect(r).toMatchObject({ status: 200, json: { title: "Articolo" } });
    expect(db.writes).toHaveLength(0);
  });
});
