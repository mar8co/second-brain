import { describe, expect, it } from "vitest";
import { DIGEST_VERSION } from "../src/lib/enrich.js";
import { DIGEST_TRIES, handleLavori, hashToken, runLavori, versionOf } from "./lavori.js";

const env = { GEMINI_API_KEY: "k", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "s" };

const digest = { titolo: "", summary: "Riassunto di prova abbastanza lungo", points: ["a"], entities: [], keywords: ["k"], categories: ["Cucina"], tags: ["pasta"], places: [], events: [] };

// Gemini finto: classificazione e vettori.
function fakeAi({ status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (status !== 200) return new Response("{}", { status });
    if (url.includes(":batchEmbedContents")) {
      const n = JSON.parse(init.body).requests.length;
      return new Response(JSON.stringify({ embeddings: Array.from({ length: n }, () => ({ values: Array(768).fill(1) })) }));
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(digest) }] } }] }));
  };
  return { fetchImpl, calls };
}

function fakeDb(items, { tries = [], pausedUntil = 0, key = "segreto" } = {}) {
  const rows = new Map(items.map((it) => [it.id, { user_id: "u1", updated_at: "2026-10-30T10:00:00Z", ...it }]));
  const log = { tries: [...tries], embeddings: [], pause: null, report: null, updates: [] };
  return {
    log,
    rows,
    keyOk: async (h) => h === hashToken(key),
    pausedUntil: async () => pausedUntil,
    pause: async (until) => void (log.pause = until),
    saveReport: async (r) => void (log.report = r),
    items: async () => [...rows.values()].map((r) => ({ ...r })),
    get: async (id) => (rows.has(id) ? { ...rows.get(id) } : null),
    update: async (id, patch) => {
      log.updates.push({ id, patch });
      rows.set(id, { ...rows.get(id), ...patch });
    },
    setEmbedding: async (id) => void log.embeddings.push(id),
    download: async () => Buffer.from([1]),
    tries: async () => log.tries,
    addTry: async (row) => {
      log.tries = log.tries.filter((r) => !(r.item_id === row.item_id && r.tipo === row.tipo));
      log.tries.push(row);
    },
  };
}

const note = (id, extra = {}) => ({ id, type: "note", note: `Ricetta della pasta al forno numero ${id}`, status: "saved", ...extra });
const opts = { sleep: async () => {}, gapMs: 0 };

describe("coda dei lavori", () => {
  it("senza token o con un token sbagliato: 401; senza chiave di servizio: 503", async () => {
    const db = fakeDb([]);
    expect((await handleLavori({ authHeader: "", env, db })).status).toBe(401);
    expect((await handleLavori({ authHeader: "Bearer altro", env, db })).status).toBe(401);
    expect((await handleLavori({ authHeader: "Bearer segreto", env: { ...env, SUPABASE_SERVICE_ROLE_KEY: "" }, db })).status).toBe(503);
  });

  it("scheda mancante: l'AI la fa e assegna categorie e tag; resoconto salvato", async () => {
    const db = fakeDb([note("a")]);
    const { fetchImpl } = fakeAi();
    const r = await handleLavori({ authHeader: "Bearer segreto", env, db, fetchImpl, ...opts });
    expect(r.status).toBe(200);
    const a = db.rows.get("a");
    expect(a.ai.v).toBe(DIGEST_VERSION);
    expect(a.ai.applied).toBe(true);
    expect(a.categories).toEqual(["Cucina"]);
    expect(a.tags).toEqual(["pasta"]);
    expect(db.log.report).toMatchObject({ schede: 1, errori: 0 });
  });

  it("scheda vecchia: si rifà senza toccare categorie e tag scelti", async () => {
    const db = fakeDb([note("a", { ai: { v: 1, summary: "vecchia" }, categories: ["Mie"], tags: ["mio"] })]);
    await runLavori({ env, db, fetchImpl: fakeAi().fetchImpl, ...opts });
    const a = db.rows.get("a");
    expect(a.ai.v).toBe(DIGEST_VERSION);
    expect(a.categories).toEqual(["Mie"]);
    expect(a.tags).toEqual(["mio"]);
  });

  it("vettori per gli elementi con una scheda", async () => {
    const ai = { v: DIGEST_VERSION, summary: "Una scheda con un riassunto lungo abbastanza", points: [] };
    const db = fakeDb([note("a", { ai }), note("b", { ai: { ...ai, emb_at: "2026-10-01T00:00:00Z" } })]);
    const r = await runLavori({ env, db, fetchImpl: fakeAi().fetchImpl, ...opts });
    expect(db.log.embeddings).toEqual(["a"]);
    expect(db.rows.get("a").ai.emb_at).toBeTruthy();
    expect(r.json.vettori).toBe(1);
  });

  it("dopo 3 tentativi sullo stesso contenuto l'elemento si lascia stare; se cambia, si riprova", async () => {
    const a = note("a");
    const tries = [{ item_id: "a", tipo: "scheda", tentativi: DIGEST_TRIES, versione: versionOf({ ...a }) }];
    const db = fakeDb([a], { tries });
    const ai = fakeAi();
    await runLavori({ env, db, fetchImpl: ai.fetchImpl, ...opts });
    expect(ai.calls.filter((u) => u.includes(":generateContent"))).toHaveLength(0);
    db.rows.set("a", { ...db.rows.get("a"), note: "Testo cambiato dall'utente, più lungo" });
    await runLavori({ env, db, fetchImpl: ai.fetchImpl, ...opts });
    expect(db.rows.get("a").ai?.v).toBe(DIGEST_VERSION);
  });

  it("limite gratuito dell'AI: pausa di 6 ore e il giro dopo non fa nulla", async () => {
    const db = fakeDb([note("a")]);
    const now = () => 1_000_000;
    const r = await runLavori({ env, db, fetchImpl: fakeAi({ status: 429 }).fetchImpl, now, ...opts });
    expect(r.json.fermo).toMatch(/limite/);
    expect(db.log.pause).toBe(1_000_000 + 6 * 3600_000);
    const db2 = fakeDb([note("a")], { pausedUntil: db.log.pause });
    const ai = fakeAi();
    const r2 = await runLavori({ env, db: db2, fetchImpl: ai.fetchImpl, now, ...opts });
    expect(r2.json.fermo).toMatch(/limite/);
    expect(ai.calls).toHaveLength(0);
  });

  it("lavoro interrotto (in elaborazione da più di 10 minuti): una rilettura, contata", async () => {
    const stale = { id: "s", type: "image", file_path: "u1/s.jpg", file_mime: "image/jpeg", file_size: 100, status: "processing", updated_at: "2026-10-30T09:00:00Z" };
    const db = fakeDb([stale]);
    db.rows.set("s", { ...db.rows.get("s"), updated_at: "2026-10-30T09:00:00Z" });
    const now = () => Date.parse("2026-10-30T10:00:00Z");
    const r = await runLavori({ env, db, fetchImpl: fakeAi().fetchImpl, now, ...opts });
    expect(r.json.riletture).toBe(1);
    expect(db.log.updates[0].patch.status).toBe("processing");
    expect(db.rows.get("s").status).not.toBe("processing");
    expect(db.log.tries.find((t) => t.item_id === "s" && t.tipo === "rilettura").tentativi).toBe(1);
  });

  it("AI non configurata: nessun lavoro", async () => {
    const db = fakeDb([note("a")]);
    const r = await runLavori({ env: { ...env, GEMINI_API_KEY: "" }, db, ...opts });
    expect(r.json.fermo).toMatch(/AI/);
    expect(db.log.updates).toHaveLength(0);
  });
});
