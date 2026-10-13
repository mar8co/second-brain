import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { checkMedia, mediaMime, parseMultipart, youtubeUrl } from "./media.js";
import { handleShare } from "./share.js";
import { nodeHandler } from "./node-adapter.js";

const TOKEN = "a".repeat(64);
const env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", GEMINI_API_KEY: "k" };

const fakeDb = () => {
  const calls = { save: [], update: [] };
  return {
    calls,
    save: async (token, item) => {
      if (token !== TOKEN) throw Object.assign(new Error("invalid_token"), { invalidToken: true });
      calls.save.push(item);
      return { id: "id-1", categories: ["Ricette"] };
    },
    update: async (token, id, patch) => calls.update.push({ id, patch }),
  };
};

const reply = (obj, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] } : { error: { message: obj } }), { status });

// Finto Gemini: risponde alla trascrizione o alla classificazione e registra le richieste.
function fakeGemini(transcribe, { failMime } = {}) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    const parts = body.contents[0].parts;
    const media = parts.find((p) => p.inline_data || p.file_data);
    if (media) {
      if (failMime && media.inline_data?.mime_type === failMime) return reply("Unsupported MIME type", 400);
      return reply(transcribe);
    }
    return reply({ summary: "Ricetta della carbonara.", categories: ["Ricette"], tags: ["Carbonara"] });
  };
  return { fetchImpl, requests };
}

describe("file condivisi: controlli", () => {
  it("riconosce i tipi ammessi, anche dall'estensione", () => {
    expect(mediaMime("audio.m4a", "audio/x-m4a")).toBe("audio/mp4");
    expect(mediaMime("slide.JPG", "")).toBe("image/jpeg");
    expect(mediaMime("doc.pdf", "application/pdf")).toBe("application/pdf");
    expect(mediaMime("x.exe", "application/octet-stream")).toBeNull();
  });

  it("un video da solo, oppure più slide", () => {
    const f = (name, type) => ({ name, type, data: Buffer.from("x") });
    expect(checkMedia([f("a.m4a", "audio/mp4")])).toMatchObject({ kind: "video" });
    expect(checkMedia([f("1.jpg", "image/jpeg"), f("2.jpg", "image/jpeg")])).toMatchObject({ kind: "slides" });
    expect(checkMedia([f("a.m4a", "audio/mp4"), f("1.jpg", "image/jpeg")]).error).toMatch(/un video alla volta/);
    expect(checkMedia([f("x.zip", "application/zip")]).error).toMatch(/non supportato/);
    expect(checkMedia([]).error).toMatch(/Nessun file/);
  });

  it("link YouTube e Shorts → indirizzo del video", () => {
    expect(youtubeUrl("https://www.youtube.com/shorts/AbC_123-xyz")).toBe("https://www.youtube.com/watch?v=AbC_123-xyz");
    expect(youtubeUrl("https://youtu.be/AbC_123-xyz?si=1")).toBe("https://www.youtube.com/watch?v=AbC_123-xyz");
    expect(youtubeUrl("https://m.youtube.com/watch?v=AbC_123-xyz")).toBe("https://www.youtube.com/watch?v=AbC_123-xyz");
    expect(youtubeUrl("https://www.instagram.com/reel/abc/")).toBeNull();
  });

  it("legge il corpo Modulo con più file", async () => {
    const form = new FormData();
    form.append("token", TOKEN);
    form.append("file", new Blob(["uno"], { type: "image/jpeg" }), "1.jpg");
    form.append("file", new Blob(["due"], { type: "image/jpeg" }), "2.jpg");
    const req = new Request("http://x", { method: "POST", body: form });
    const parsed = await parseMultipart(Buffer.from(await req.arrayBuffer()), req.headers.get("content-type"));
    expect(parsed.token).toBe(TOKEN);
    expect(parsed.files.map((f) => [f.name, f.data.toString()])).toEqual([["1.jpg", "uno"], ["2.jpg", "due"]]);
  });
});

describe("trascrizione dal Comando Rapido", () => {
  it("video: salva subito, poi trascrive, mette il titolo e applica l'AI", async () => {
    const db = fakeDb();
    const jobs = [];
    const g = fakeGemini({ title: "Carbonara perfetta", transcript: "Oggi facciamo la carbonara con il guanciale.", slides: [] });
    const r = await handleShare({
      body: { token: TOKEN, files: [{ name: "audio.m4a", type: "audio/x-m4a", data: Buffer.from("AUDIO") }] },
      env, db, fetchImpl: g.fetchImpl, waitUntil: (p) => jobs.push(p),
    });
    expect(r).toMatchObject({ status: 200, text: expect.stringMatching(/trascrivo in background/) });
    expect(db.calls.save[0]).toMatchObject({ type: "video", status: "processing", title: "Video condiviso" });
    await Promise.all(jobs);
    const media = g.requests[0].contents[0].parts[0].inline_data;
    expect(media).toEqual({ mime_type: "audio/mp4", data: Buffer.from("AUDIO").toString("base64") });
    const { patch } = db.calls.update[0];
    expect(patch).toMatchObject({
      title: "Carbonara perfetta",
      extracted_text: "Oggi facciamo la carbonara con il guanciale.",
      text_source: "trascrizione dell'AI (video condiviso)",
      status: "analyzed",
      categories: ["Ricette"],
      tags: ["carbonara"],
    });
    expect(patch.status_detail).toMatch(/non viene conservato/);
  });

  it("audio lungo, trascrizione tagliata al limite dell'AI: letto in parte, e la scheda lo dice", async () => {
    const db = fakeDb();
    const cut = '{"title": "Podcast", "transcript": "Prima parte del podcast, poi';
    const fetchImpl = async (url, init) => {
      const parts = JSON.parse(init.body).contents[0].parts;
      if (parts.some((p) => p.inline_data)) return new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: cut }] } }] }), { status: 200 });
      return reply({ summary: "Podcast.", categories: [], tags: [] });
    };
    await handleShare({ body: { token: TOKEN, files: [{ name: "a.m4a", type: "audio/mp4", data: Buffer.from("A") }] }, env, db, fetchImpl });
    const { patch } = db.calls.update[0];
    expect(patch).toMatchObject({ status: "partial", extracted_text: "Prima parte del podcast, poi" });
    expect(patch.status_detail).toMatch(/^Letto in parte: file lungo, trascritta solo la prima parte\. Il file non viene conservato/);
  });

  it("audio rifiutato come audio/mp4: riprova come video/mp4", async () => {
    const db = fakeDb();
    const g = fakeGemini({ title: "T", transcript: "Ciao a tutti.", slides: [] }, { failMime: "audio/mp4" });
    await handleShare({ body: { token: TOKEN, files: [{ name: "a.m4a", type: "audio/mp4", data: Buffer.from("A") }] }, env, db, fetchImpl: g.fetchImpl });
    expect(g.requests.map((b) => b.contents[0].parts[0].inline_data?.mime_type).filter(Boolean)).toEqual(["audio/mp4", "video/mp4"]);
    expect(db.calls.update[0].patch).toMatchObject({ extracted_text: "Ciao a tutti.", status: "analyzed" });
  });

  it("carosello: testo slide per slide, nell'ordine", async () => {
    const db = fakeDb();
    const g = fakeGemini({ title: "5 errori in cucina", transcript: "", slides: ["Errore 1: sale", "Errore 2: fuoco alto"] });
    const r = await handleShare({
      body: { token: TOKEN, text: "https://www.instagram.com/p/xyz/", files: [{ name: "1.jpg", type: "image/jpeg", data: Buffer.from("1") }, { name: "2.jpg", type: "image/jpeg", data: Buffer.from("2") }] },
      env, db, fetchImpl: g.fetchImpl,
    });
    expect(r.text).toMatch(/Carosello ricevuto.*2 file/);
    expect(db.calls.save[0]).toMatchObject({ type: "social", url: "https://www.instagram.com/p/xyz/" });
    expect(g.requests[0].contents[0].parts.filter((p) => p.inline_data)).toHaveLength(2);
    expect(db.calls.update[0].patch).toMatchObject({
      title: "5 errori in cucina",
      extracted_text: "Slide 1: Errore 1: sale\n\nSlide 2: Errore 2: fuoco alto",
      text_source: "testo delle slide letto dall'AI",
    });
  });

  it("errori chiari: file non ammesso, AI assente, trascrizione fallita", async () => {
    const db = fakeDb();
    const bad = await handleShare({ body: { token: TOKEN, files: [{ name: "x.zip", type: "application/zip", data: Buffer.from("z") }] }, env, db });
    expect(bad).toMatchObject({ status: 400, text: expect.stringMatching(/non supportato/) });
    const noAi = await handleShare({ body: { token: TOKEN, files: [{ name: "a.m4a", type: "audio/mp4", data: Buffer.from("a") }] }, env: { ...env, GEMINI_API_KEY: "" }, db });
    expect(noAi).toMatchObject({ status: 503, text: expect.stringMatching(/GEMINI_API_KEY/) });
    expect(db.calls.save).toHaveLength(0);

    await handleShare({ body: { token: TOKEN, files: [{ name: "a.m4a", type: "audio/mp4", data: Buffer.from("a") }] }, env, db, fetchImpl: async () => reply("quota", 429) });
    expect(db.calls.save).toHaveLength(1); // l'elemento resta
    expect(db.calls.update[0].patch).toMatchObject({ status: "saved", status_detail: expect.stringMatching(/Trascrizione non riuscita/) });
  });
});

describe("endpoint con corpo Modulo", () => {
  let server;
  let url;
  const seen = [];
  beforeAll(async () => {
    server = http.createServer(nodeHandler(async ({ body }) => {
      seen.push(body);
      return { status: 200, text: "ok" };
    }, env, { allowFiles: true }));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${server.address().port}/`;
  });
  afterAll(() => server.close());

  it("riceve i file e rifiuta quelli troppo grandi con un messaggio leggibile", async () => {
    const form = new FormData();
    form.append("token", TOKEN);
    form.append("file", new Blob(["audio"], { type: "audio/mp4" }), "a.m4a");
    const ok = await fetch(url, { method: "POST", body: form });
    expect(await ok.text()).toBe("ok");
    expect(seen[0].files[0]).toMatchObject({ name: "a.m4a", type: "audio/mp4" });

    const big = new FormData();
    big.append("file", new Blob([Buffer.alloc(5_000_000)], { type: "video/mp4" }), "v.mp4");
    const r = await fetch(url, { method: "POST", body: big }).catch(() => null);
    // Il server può chiudere la connessione prima di aver letto tutto: in quel caso nessuna risposta.
    if (r) {
      expect(r.status).toBe(413);
      expect(await r.text()).toMatch(/solo l'audio/);
    }
    expect(seen).toHaveLength(1);
  });
});
