import { describe, expect, it, vi } from "vitest";
import { embedTexts, EMBED_DIMS, handleAi } from "./ai.js";

const vec = (x) => Array.from({ length: EMBED_DIMS }, (_, i) => (i === 0 ? x : 0));
const env = { GEMINI_API_KEY: "k", ALLOW_NO_AUTH: "1" };
const okFetch = (n, x = 3) => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ embeddings: Array.from({ length: n }, () => ({ values: vec(x) })) }) }));

describe("embedTexts", () => {
  it("chiede un vettore per testo con il tipo e le 768 dimensioni, e li normalizza", async () => {
    const f = okFetch(2, 3);
    const out = await embedTexts({ env, texts: ["a", "b"], taskType: "RETRIEVAL_QUERY", fetchImpl: f });
    expect(out).toHaveLength(2);
    expect(out[0][0]).toBeCloseTo(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toContain("gemini-embedding-001:batchEmbedContents");
    const body = JSON.parse(init.body);
    expect(body.requests).toHaveLength(2);
    expect(body.requests[0]).toMatchObject({ taskType: "RETRIEVAL_QUERY", outputDimensionality: 768 });
    expect(init.headers["x-goog-api-key"]).toBe("k");
  });
  it("429 diventa limite gratuito", async () => {
    const f = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await expect(embedTexts({ env, texts: ["a"], fetchImpl: f })).rejects.toMatchObject({ status: 429 });
  });
  it("rifiuta risposte incomplete o con vettori di lunghezza sbagliata", async () => {
    await expect(embedTexts({ env, texts: ["a", "b"], fetchImpl: okFetch(1) })).rejects.toThrow();
    const short = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ embeddings: [{ values: [1, 2] }] }) }));
    await expect(embedTexts({ env, texts: ["a"], fetchImpl: short })).rejects.toThrow();
  });
});

describe("handleAi embed", () => {
  it("restituisce i vettori e limita i testi", async () => {
    const f = okFetch(2);
    const r = await handleAi({ authHeader: "", body: { action: "embed", texts: ["uno", " ", "due"], taskType: "RETRIEVAL_DOCUMENT" }, env, fetchImpl: f });
    expect(r.status).toBe(200);
    expect(r.json.vectors).toHaveLength(2);
  });
  it("senza testi 400", async () => {
    const r = await handleAi({ authHeader: "", body: { action: "embed", texts: [] }, env, fetchImpl: okFetch(0) });
    expect(r.status).toBe(400);
  });
});
