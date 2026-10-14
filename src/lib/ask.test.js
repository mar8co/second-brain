import { describe, expect, it, vi } from "vitest";

const ask = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
vi.mock("./api.js", () => ({ api: { ask, select } }));
const { askArchive, detailEntry, memoryEntry, memoryFor, recentTurns } = await import("./ask.js");

const workshop = {
  id: "w",
  type: "social",
  title: "Workshop sull'intelligenza artificiale",
  author: "Mario Rossi (@mario.ai)",
  description: "Iscriviti al link in bio",
  extracted_text: "Ho preparato un workshop completamente gratuito il 28 settembre. ".repeat(200),
  ai: { v: 2, summary: "Workshop gratuito sull'IA.", points: ["Mario Rossi organizza un workshop il 28 settembre."], entities: [{ name: "Mario Rossi", kind: "persona" }], keywords: ["corso", "formazione"] },
  categories: ["Tecnologia"],
  tags: [],
  created_at: "2026-10-13T13:15:00Z",
};
const pasta = { id: "p", type: "link", title: "Pasta al limone", description: "Ricetta", categories: ["Ricette"], tags: ["pasta"], created_at: "2026-10-12T10:00:00Z" };
const recent = { id: "n", type: "note", note: "Idea regalo", categories: [], tags: [], created_at: "2026-10-14T10:00:00Z" };

describe("schede inviate all'AI", () => {
  it("scheda breve: niente testo completo se c'è già la scheda dell'AI", () => {
    const e = memoryEntry(workshop);
    expect(e).toMatchObject({ id: "w", author: "Mario Rossi (@mario.ai)", ai: { summary: "Workshop gratuito sull'IA.", entities: ["Mario Rossi"], keywords: ["corso", "formazione"] } });
    expect(e).not.toHaveProperty("extracted_text");
    expect(memoryEntry({ ...workshop, ai: null }).extracted_text).toHaveLength(300);
    // Scheda corta anche con una scheda dell'AI al massimo: ci stanno centinaia di elementi.
    const full = { ...workshop, title: "t".repeat(300), ai: { summary: "s".repeat(800), points: Array(8).fill("p".repeat(300)), entities: Array(12).fill({ name: "n".repeat(100), kind: "persona" }), keywords: Array(15).fill("k".repeat(60)) } };
    expect(JSON.stringify(memoryEntry(full)).length).toBeLessThan(2000);
  });
  it("contenuto completo: autore, parole chiave e testo (8000 caratteri, o di più se richiesto)", () => {
    const d = detailEntry(workshop);
    expect(d.author).toBe("Mario Rossi (@mario.ai)");
    expect(d.ai.keywords).toEqual(["corso", "formazione"]);
    expect(d.extracted_text).toHaveLength(8000);
    expect(detailEntry(workshop, 12000).extracted_text).toHaveLength(12000);
  });
  it("ordine: prima i pertinenti, poi i più recenti; entro il limite di dimensione", () => {
    expect(memoryFor([pasta, workshop, recent], [workshop]).map((e) => e.id)).toEqual(["w", "n", "p"]);
    const one = JSON.stringify(memoryEntry(workshop)).length;
    expect(memoryFor([pasta, workshop, recent], [workshop], one + 10).map((e) => e.id)).toEqual(["w"]);
  });
});

describe("domanda sull'archivio", () => {
  it("archivio che ci sta: l'AI legge per intero tutti i contenuti, anche senza parole in comune", async () => {
    select.mockClear();
    ask.mockResolvedValueOnce({ answer: "Mario Rossi (@mario.ai) [1].", sufficient: true, sources: [{ id: "w", quote: "Ho preparato un workshop" }, { id: "p", quote: "" }], consulted: 3 });
    const history = [{ q: "workshop?", a: "Sì [1].", sources: ["w"] }];
    const r = await askArchive([pasta, workshop, recent], "chi tiene corsi di IA?", { ai: true, history });
    const [question, details, memory, total, turns] = ask.mock.calls.at(-1);
    expect(question).toBe("chi tiene corsi di IA?");
    expect(details.map((d) => d.id).sort()).toEqual(["n", "p", "w"]);
    expect(details.find((d) => d.id === "w").extracted_text).toHaveLength(12000);
    expect(memory).toEqual([]);
    expect(total).toBe(3);
    expect(turns).toEqual([{ q: "workshop?", a: "Sì [1]." }]);
    expect(select).not.toHaveBeenCalled();
    expect(r).toMatchObject({ kind: "answer", answer: "Mario Rossi (@mario.ai) [1].", sources: ["w", "p"], quotes: { w: "Ho preparato un workshop" }, consulted: 3, total: 3 });
  });

  it("archivio grande: l'AI sceglie dalle schede cosa leggere per intero", async () => {
    const big = Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, type: "social", title: `Video ${i}`, extracted_text: "parole ".repeat(1500), created_at: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z` }));
    const items = [...big, workshop, pasta];
    select.mockResolvedValueOnce({ ids: ["b7", "inventato"] });
    ask.mockResolvedValueOnce({ answer: "x", sufficient: false, sources: [] });
    const history = [{ q: "pasta al limone?", a: "Sì.", sources: ["p"] }];
    const r = await askArchive(items, "chi tiene corsi di IA?", { ai: true, history });
    const [, memCards, turns] = select.mock.calls.at(-1);
    expect(memCards.length).toBe(42);
    expect(turns).toEqual([{ q: "pasta al limone?", a: "Sì." }]);
    const [, details, memory] = ask.mock.calls.at(-1);
    // Prima la scelta dell'AI, poi le fonti della risposta precedente, poi le parole della domanda.
    expect(details.map((d) => d.id).slice(0, 3)).toEqual(["b7", "p", "w"]);
    expect(details.length).toBeLessThanOrEqual(10);
    expect(details[0].extracted_text.length).toBeLessThanOrEqual(8000);
    expect(memory.some((m) => details.some((d) => d.id === m.id))).toBe(false);
    expect(details.length + memory.length).toBe(42);
    expect(r).toMatchObject({ kind: "insufficient", total: 42 });
  });

  it("scelta dell'AI non riuscita: restano le parole della domanda", async () => {
    const big = Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, type: "social", title: `Video ${i}`, extracted_text: "parole ".repeat(1500), created_at: "2026-09-01T10:00:00Z" }));
    select.mockRejectedValueOnce(new Error("limite"));
    ask.mockResolvedValueOnce({ answer: "x", sufficient: true, sources: [{ id: "w", quote: "" }] });
    const r = await askArchive([...big, workshop], "workshop", { ai: true });
    expect(ask.mock.calls.at(-1)[1][0].id).toBe("w");
    expect(r.kind).toBe("answer");
  });

  it("chi ha pubblicato è cercabile anche senza AI", async () => {
    const r = await askArchive([pasta, workshop], "mario rossi", { ai: false });
    expect(r).toMatchObject({ kind: "noai", candidates: ["w"] });
  });
  it("archivio vuoto: nessuna chiamata", async () => {
    ask.mockClear();
    expect(await askArchive([], "qualcosa?", { ai: true })).toMatchObject({ kind: "none" });
    expect(ask).not.toHaveBeenCalled();
  });
  it("errore dell'AI: restano i contenuti più vicini", async () => {
    ask.mockRejectedValueOnce(new Error("Servizio AI sovraccarico"));
    const r = await askArchive([pasta, workshop], "workshop", { ai: true });
    expect(r).toMatchObject({ kind: "error", error: "Servizio AI sovraccarico", candidates: ["w"] });
    // Nessuna scheda consultata: la chat non lo dichiara.
    expect(r).not.toHaveProperty("consulted");
  });
});

describe("domande di seguito", () => {
  const at = (min) => new Date(Date.parse("2026-10-14T12:00:00Z") + min * 60_000).toISOString();
  const now = Date.parse(at(0));
  it("gli ultimi turni con una risposta, finché la conversazione continua", () => {
    const log = [
      { at: at(-200), q: "vecchia", result: { kind: "answer", answer: "a", sources: ["x"] } },
      { at: at(-50), q: "uno", result: { kind: "answer", answer: "r1", sources: ["a"] } },
      { at: at(-40), q: "errore", result: { kind: "error" } },
      { at: at(-30), q: "due", result: { kind: "insufficient", answer: "r2", sources: [] } },
      { at: at(-1), q: "tre", result: { kind: "answer", answer: "r3", sources: ["b"] } },
    ];
    expect(recentTurns(log, now)).toEqual([
      { q: "uno", a: "r1", sources: ["a"] },
      { q: "due", a: "r2", sources: [] },
      { q: "tre", a: "r3", sources: ["b"] },
    ]);
    expect(recentTurns(log, now + 3 * 60 * 60_000)).toEqual([]);
    expect(recentTurns([], now)).toEqual([]);
  });
});
