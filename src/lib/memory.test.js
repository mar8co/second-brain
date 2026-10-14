import { describe, expect, it } from "vitest";
import { AI_LIMIT_PAUSE_MS, MAX_AUTO_REREADS, needsDigest, needsReread, rereadLog, rereadReason, runUpkeep, STALE_MS } from "./memory.js";

const NOW = Date.parse("2026-10-14T10:00:00Z");
const reel = { id: "r", type: "social", url: "https://www.instagram.com/reel/abc/", author: "@mario.ai", status: "analyzed", processed_at: "2026-10-13T13:15:05Z", extracted_text: "Ho preparato un workshop" };

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
      reread:
        opts.reread ||
        (async (it, mark) => {
          mark();
          log.push(`reread ${it.id}`);
          return null;
        }),
      maxRereads: opts.maxRereads,
      log: opts.log,
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

  it("un numero massimo di riletture per giro; gli altri post aspettano la rilettura, senza scheda a parte", async () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ ...reel, id: `o${i}`, extracted_text: null, description: "didascalia", processed_at: "2026-10-13T09:00:00Z" }));
    const { log } = await run(items, { maxRereads: 5 });
    expect(log.filter((l) => l.startsWith("reread"))).toHaveLength(5);
    expect(log.filter((l) => l.startsWith("digest"))).toHaveLength(0);
  });

  it("di norma un'apertura basta per rileggere qualche decina di post", async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ ...reel, id: `o${i}`, author: null }));
    const { log } = await run(items);
    expect(log.filter((l) => l.startsWith("reread"))).toHaveLength(12);
  });
});

describe("letture non riuscite e limiti delle riletture", () => {
  const old = { ...reel, extracted_text: null, processed_at: "2026-10-14T09:00:00Z" };
  it("lettura fallita per un motivo momentaneo: da rileggere; crediti di Apify esauriti: no", () => {
    expect(needsReread({ ...old, status_detail: "Ho letto solo la didascalia, non il contenuto: trascrizione non riuscita (Limite gratuito del servizio AI raggiunto: riprova più tardi.)." }, NOW)).toBe(true);
    expect(needsReread({ ...old, status_detail: "Apify non risponde: riprova dalla scheda." }, NOW)).toBe(true);
    expect(needsReread({ ...old, status_detail: "Crediti gratuiti di Apify del mese esauriti: si ricaricano all'inizio del mese." }, NOW)).toBe(false);
    expect(needsReread({ ...old, status_detail: "Ho letto solo la didascalia, non il contenuto: nel video non c'è né parlato né testo da trascrivere." }, NOW)).toBe(false);
    // Solo la rielaborazione dell'AI non è riuscita: non serve rileggere il post.
    expect(needsReread({ ...old, status_detail: "Ho letto solo la didascalia: il post non contiene video. AI non disponibile: Il servizio AI di Google è sovraccarico." }, NOW)).toBe(false);
  });

  it("rilettura ancora non riuscita due volte: ci si ferma", async () => {
    const items = ["a", "b", "c"].map((id) => ({ ...old, id, status_detail: "Apify non risponde." }));
    const seen = [];
    const how = await runUpkeep({
      getItems: () => items, isActive: () => true, tried: new Set(), now: () => NOW, sleep: async () => {}, digest: async () => {},
      reread: async (it, mark) => (mark(), seen.push(it.id), it),
    });
    expect(how).toBe("failed");
    expect(seen).toEqual(["a", "b"]);
  });

  it("al massimo 3 riletture automatiche per elemento, anche tra un'apertura e l'altra", async () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const items = [{ ...old, id: "a", status_detail: "Apify non risponde." }];
    let n = 0;
    for (let i = 0; i < MAX_AUTO_REREADS + 2; i++) {
      await runUpkeep({
        getItems: () => items, isActive: () => true, tried: new Set(), log: rereadLog(storage), now: () => NOW, sleep: async () => {}, digest: async () => {},
        reread: async (it, mark) => (mark(), (n += 1), null),
      });
    }
    expect(n).toBe(MAX_AUTO_REREADS);
  });

  it("rilettura non necessaria (già finita sul server): non conta", async () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const log = rereadLog(storage);
    await runUpkeep({
      getItems: () => [{ ...old, id: "a", status_detail: "Apify non risponde." }], isActive: () => true, tried: new Set(), log, now: () => NOW, sleep: async () => {}, digest: async () => {},
      reread: async () => null,
    });
    expect(log.count("a")).toBe(0);
  });

  it("archivio del browser non disponibile: si conta lo stesso in memoria", () => {
    const broken = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    const log = rereadLog(broken);
    log.add("a");
    expect(log.count("a")).toBe(1);
  });

  it("offline: l'elemento resta da rielaborare anche dopo 3 errori", async () => {
    const tried = new Set();
    const how = await runUpkeep({
      getItems: () => [{ ...reel, id: "a" }], isActive: () => true, tried, now: () => NOW, sleep: async () => {},
      digest: async () => { throw Object.assign(new Error("Sei offline."), { status: 0 }); },
      reread: async () => null,
    });
    expect(how).toBe("failed");
    expect(tried.has("a")).toBe(false);
  });
});

describe("chi ha pubblicato i post già trascritti", () => {
  const saved = { ...reel, id: "w", author: null, ai: null };
  const memStorage = () => {
    const mem = new Map();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  };
  it("post social senza autore: una rilettura lo aggiunge; non per i post non accessibili o i link normali", () => {
    expect(rereadReason(saved, NOW)).toBe("author");
    expect(rereadReason({ ...saved, status: "inaccessible" }, NOW)).toBeNull();
    expect(rereadReason({ ...saved, url: "https://example.com/articolo" }, NOW)).toBeNull();
  });
  it("rilettura per l'autore non riuscita per un motivo momentaneo: valgono i tentativi normali", () => {
    const failed = { ...saved, status: "partial", status_detail: "Nuova lettura non completa, resta il testo letto in precedenza: Apify non risponde." };
    expect(rereadReason(failed, NOW)).toBe("temporary");
    expect(rereadReason({ ...failed, status_detail: "Ho letto solo la didascalia. AI non disponibile: Limite gratuito raggiunto" }, NOW)).toBe("author");
  });
  it("una sola rilettura per l'autore; se non basta, la scheda dell'AI si fa comunque", async () => {
    const log = rereadLog(memStorage());
    const calls = [];
    const opts = { getItems: () => [saved], isActive: () => true, log, now: () => NOW, sleep: async () => {} };
    // Prima apertura: rilettura (che comprende la scheda), niente scheda a parte.
    await runUpkeep({ ...opts, tried: new Set(), digest: async (it) => calls.push(`digest ${it.id}`), reread: async (it, mark) => (mark(), calls.push(`reread ${it.id}`), null) });
    expect(calls).toEqual(["reread w"]);
    // Apertura successiva, autore ancora assente: niente altre letture, solo la scheda.
    await runUpkeep({ ...opts, tried: new Set(), digest: async (it) => calls.push(`digest ${it.id}`), reread: async () => calls.push("reread di troppo") });
    expect(calls).toEqual(["reread w", "digest w"]);
  });
});

describe("limite gratuito dell'AI durante le riletture", () => {
  const memStorage = () => {
    const mem = new Map();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  };
  const unread = (id) => ({ ...reel, id, extracted_text: null, processed_at: "2026-10-13T09:00:00Z", ai: { v: 2, summary: "x" } });
  const limited = (it) => ({ ...it, processed_at: "2026-10-14T09:59:00Z", status_detail: "Ho letto solo la didascalia, non il contenuto: trascrizione non riuscita (Limite gratuito del servizio AI raggiunto: riprova più tardi.)." });

  it("trascrizione fallita per il limite: niente altre letture di Apify per ore, il tentativo non conta", async () => {
    const storage = memStorage();
    let reads = 0;
    const items = [unread("a"), unread("b")];
    const run = (now) =>
      runUpkeep({
        getItems: () => items, isActive: () => true, tried: new Set(), log: rereadLog(storage), now: () => now, sleep: async () => {}, digest: async () => {},
        reread: async (it, mark) => (mark(), (reads += 1), limited(it)),
      });
    expect(await run(NOW)).toBe("done");
    expect(reads).toBe(1);
    expect(rereadLog(storage).count("a")).toBe(0);
    // Riapertura poco dopo: ancora in pausa.
    await run(NOW + 60 * 60_000);
    expect(reads).toBe(1);
    // Dopo la pausa si riprova.
    await run(NOW + AI_LIMIT_PAUSE_MS + 60_000);
    expect(reads).toBe(2);
  });

  it("limite raggiunto rielaborando: le riletture aspettano", async () => {
    const storage = memStorage();
    let reads = 0;
    await runUpkeep({
      getItems: () => [{ ...reel, id: "d", ai: null }, unread("o")], isActive: () => true, tried: new Set(), log: rereadLog(storage), now: () => NOW, sleep: async () => {},
      digest: async () => { throw Object.assign(new Error("limite"), { status: 429 }); },
      reread: async (it, mark) => (mark(), (reads += 1), null),
    });
    expect(reads).toBe(0);
    expect(rereadLog(storage).pausedUntil()).toBeGreaterThan(NOW);
  });

  it("rilettura ormai impossibile (limite per elemento raggiunto): si fa la scheda dell'AI", async () => {
    const storage = memStorage();
    const log = rereadLog(storage);
    const item = { ...unread("x"), ai: null, description: "didascalia", status_detail: "Apify non risponde." };
    for (let i = 0; i < MAX_AUTO_REREADS; i++) log.add("x");
    const calls = [];
    await runUpkeep({ getItems: () => [item], isActive: () => true, tried: new Set(), log, now: () => NOW, sleep: async () => {}, digest: async (it) => calls.push(`digest ${it.id}`), reread: async () => calls.push("reread") });
    expect(calls).toEqual(["digest x"]);
  });
});
