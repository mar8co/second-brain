import { describe, expect, it, vi } from "vitest";
import { handleThumb } from "./thumb.js";

const ID = "6f1c2a9e-1b3d-4c5e-8f70-123456789abc";
const env = { ALLOW_NO_AUTH: "1" };
const img = (over = {}) => ({ status: 200, contentType: "image/jpeg", buf: Buffer.from("jpegdata"), truncated: false, ...over });

describe("handleThumb", () => {
  it("scarica l'immagine e la salva nella cartella miniature dell'utente", async () => {
    const uploadImpl = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => img());
    const r = await handleThumb({ authHeader: "", body: { id: ID, url: "https://cdn.example.com/a.jpg" }, env, fetchImpl, uploadImpl });
    expect(r.status).toBe(200);
    expect(r.json.path).toBe(`local/miniature/${ID}.jpg`);
    expect(uploadImpl).toHaveBeenCalledWith(`local/miniature/${ID}.jpg`, expect.any(Buffer), "image/jpeg");
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ binary: true, maxBytes: 5 * 1024 * 1024 });
  });
  it("rifiuta id e indirizzi non validi", async () => {
    const base = { authHeader: "", env, fetchImpl: vi.fn(), uploadImpl: vi.fn() };
    expect((await handleThumb({ ...base, body: { id: "x", url: "https://a.it/a.jpg" } })).status).toBe(400);
    expect((await handleThumb({ ...base, body: { id: ID, url: "file:///etc/passwd" } })).status).toBe(400);
    expect(base.fetchImpl).not.toHaveBeenCalled();
  });
  it("non salva ciò che non è un'immagine, è troppo grande o non risponde", async () => {
    const uploadImpl = vi.fn();
    const run = (fetchImpl) => handleThumb({ authHeader: "", body: { id: ID, url: "https://a.it/a" }, env, fetchImpl, uploadImpl });
    expect((await run(async () => img({ contentType: "text/html" }))).status).toBe(422);
    expect((await run(async () => img({ status: 403 }))).status).toBe(422);
    expect((await run(async () => img({ truncated: true }))).status).toBe(422);
    expect((await run(async () => { throw new Error("timeout"); })).status).toBe(422);
    expect(uploadImpl).not.toHaveBeenCalled();
  });
  it("riporta l'errore se il salvataggio nell'archivio fallisce", async () => {
    const r = await handleThumb({ authHeader: "", body: { id: ID, url: "https://a.it/a.jpg" }, env, fetchImpl: async () => img(), uploadImpl: async () => { throw new Error("quota"); } });
    expect(r.status).toBe(502);
  });
  it("senza sessione risponde 401", async () => {
    const r = await handleThumb({ authHeader: "", body: { id: ID, url: "https://a.it/a.jpg" }, env: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" }, fetchImpl: vi.fn() });
    expect(r.status).toBe(401);
  });
});
