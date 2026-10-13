import { describe, expect, it } from "vitest";
import { needsDigest, needsReread, runUpkeep, STALE_MS } from "./memory.js";

const NOW = Date.parse("2026-10-14T10:00:00Z");
const reel = { id: "r", type: "social", url: "https://www.instagram.com/reel/abc/", status: "analyzed", processed_at: "2026-10-13T13:15:05Z", extracted_text: "Ho preparato un workshop" };

describe("quali elementi rielaborare", () => {
  it("senza scheda o con la scheda della versione precedente", () => {
    expect(needsDigest({ ...reel, ai: null }, NOW)).toBe(true);
    expect(needsDigest({ ...reel, ai: { summary: "x", categories: [], tags: [] } }, NOW)).toBe(true);
    expect(needsDigest({ ...reel, ai: { v: 2, summary: "x" } }, NOW)).toBe(false);
  });
  it("non durante la lettura, senza contenuto o prima che il link sia letto", () => {
    expect(needsDigest({ ...reel, status: "processing" }, NOW)).toBe(false);
    expect(needsDigest({ id: "x", type: "link", url: "https://example.com", title: "Titolo", processed_at: null }, NOW)).toBe(false);
    expect(needsDigest({ id: "x", type: "link", url: "https://example.com", processed_at: "2026-10-13T13:00:00Z" }, NOW)).toBe(false);
    expect(needsDigest({ id: "n", type: "note", note: "Idea regalo" }, NOW)).toBe(true);
  });
  it("i post da rileggere non vengono rielaborati prima della nuova lettura", () => {
    const old = { ...reel, extracted_text: null, description: "solo didascalia", processed_at: "2026-10-13T09:00:00Z" };
    expect(needsReread(old, NOW)).toBe(true);
    expect(needsDigest(old, NOW)).toBe(false);
  });
});

describe("quali elementi rileggere", () => {
  it("lettura interrotta: in elaborazione da più di 10 minuti", () => {
    const stuck = { ...reel, status: "processing", updated_at: new Date(NOW - STALE_MS - 1).toISOString() };
    expect(needsReread(stuck, NOW)).toBe(true);
    expect(needsReread({ ...stuck, updated_at: new Date(NOW - 60_000).toISOString() }, NOW)).toBe(false);
  });
  it("post social letti prima della trascrizione dal link (solo didascalia), una volta sola", () => {
    const old = { ...reel, extracted_text: null, processed_at: "2026-10-13T09:00:00Z" };
    expect(needsReread(old, NOW)).toBe(true);
    // Dopo la nuova lettura processed_at è recente: niente altre letture.
    expect(needsReread({ ...old, processed_at: "2026-10-14T09:00:00Z" }, NOW)).toBe(false);
    // Già trascritti, link normali, file: no.
    expect(needsReread({ ...old, extracted_text: "testo" }, NOW)).toBe(false);
    expect(needsReread({ ...old, url: "https://example.com/articolo" }, NOW)).toBe(false);
    expect(needsReread({ ...old, file_path: "u/x/f.jpg" }, NOW)).toBe(false);
  });
});

describe("giro di manutenzione", () => {
  const run = (items, opts = {}) => {
    const log = [];
    const tried = opts.tried || new Set();
    const p = runUpkeep({
      getItems: () => items,
      isActive: opts.isActive || (() => true),
      tried,
      now: () => NOW,
      sleep: async (ms) => log.push(`sleep ${ms}`),
      digest: opts.digest || (async (it) => log.push(`digest ${it.id}`)),
      reread: async (it) => log.push(`reread ${it.id}`),
      maxRereads: opts.maxRereads,
    });
    return p.then((how) => ({ how, log, tried }));
  };

  it("prima rielabora, poi rilegge; un elemento alla volta con una pausa; ogni elemento una sola volta", async () => {
    const items = [
      { ...reel, id: "a", ai: null },
      { ...reel, id: "b", extracted_text: null, description: "didascalia", processed_at: "2026-10-13T09:00:00Z" },
      { ...reel, id: "c", ai: { v: 2 } },
    ];
    const { how, log } = await run(items);
    expect(how).toBe("done");
    expect(log).toEqual(["digest a", "sleep 6000", "reread b", "sleep 6000"]);
  });

  it("app chiusa o AI spenta: si ferma", async () => {
    const { how, log } = await run([{ ...reel, id: "a" }], { isActive: () => false });
    expect(how).toBe("stopped");
    expect(log).toEqual([]);
  });

  it("limite gratuito dell'AI: pausa lunga, nuovo tentativo; dopo 3 errori si ferma", async () => {
    let n = 0;
    const err = Object.assign(new Error("limite"), { status: 429 });
    const { how, log } = await run([{ ...reel, id: "a" }], { digest: async () => { n += 1; throw err; } });
    expect(how).toBe("failed");
    expect(n).toBe(3);
    expect(log.filter((l) => l === "sleep 60000")).toHaveLength(2);
  });

  it("errore su un elemento: si passa agli altri senza riprovarlo", async () => {
    const seen = [];
    const { how, tried } = await run([{ ...reel, id: "a" }, { ...reel, id: "b" }], {
      digest: async (it) => {
        seen.push(it.id);
        if (it.id === "a") throw new Error("risposta non valida");
      },
    });
    expect(how).toBe("done");
    expect(seen).toEqual(["a", "b"]);
    expect([...tried]).toEqual(["a", "b"]);
  });

  it("AI non configurata: si ferma subito", async () => {
    const { how } = await run([{ ...reel, id: "a" }, { ...reel, id: "b" }], { digest: async () => { throw Object.assign(new Error("off"), { code: "ai_disabled" }); } });
    expect(how).toBe("failed");
  });

  it("al massimo 5 riletture per giro", async () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ ...reel, id: `o${i}`, extracted_text: null, processed_at: "2026-10-13T09:00:00Z" }));
    const { log } = await run(items);
    expect(log.filter((l) => l.startsWith("reread"))).toHaveLength(5);
  });
});
