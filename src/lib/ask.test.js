import { describe, expect, it, vi } from "vitest";

const ask = vi.hoisted(() => vi.fn());
vi.mock("./api.js", () => ({ api: { ask } }));
const { askArchive, detailEntry, memoryEntry, memoryFor } = await import("./ask.js");

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
    expect(e).toMatchObject({ id: "w", author: "Mario Rossi (@mario.ai)", ai: { summary: "Workshop gratuito sull'IA.", keywords: ["corso", "formazione"] } });
    expect(e.extracted_text).toBeNull();
    expect(memoryEntry({ ...workshop, ai: null }).extracted_text).toHaveLength(600);
  });
  it("contenuto completo dei pertinenti: autore e testo fino a 5000 caratteri", () => {
    const d = detailEntry(workshop);
    expect(d.author).toBe("Mario Rossi (@mario.ai)");
    expect(d.extracted_text).toHaveLength(5000);
  });
  it("ordine: prima i pertinenti, poi i più recenti; entro il limite di dimensione", () => {
    expect(memoryFor([pasta, workshop, recent], [workshop]).map((e) => e.id)).toEqual(["w", "n", "p"]);
    const one = JSON.stringify(memoryEntry(workshop)).length;
    expect(memoryFor([pasta, workshop, recent], [workshop], one + 10).map((e) => e.id)).toEqual(["w"]);
  });
});

describe("domanda sull'archivio", () => {
  it("con l'AI: anche senza parole in comune, l'AI riceve le schede di tutto l'archivio", async () => {
    ask.mockResolvedValueOnce({ answer: "Mario Rossi (@mario.ai).", sufficient: true, sources: ["w", "inventato"] });
    const r = await askArchive([pasta, workshop, recent], "chi tiene corsi di IA?", { ai: true });
    const [question, details, memory] = ask.mock.calls.at(-1);
    expect(question).toBe("chi tiene corsi di IA?");
    expect(memory.map((m) => m.id).sort()).toEqual(["n", "p", "w"]);
    // "corsi" trova la parola chiave "corso" della scheda: il Reel è tra i pertinenti.
    expect(details.map((d) => d.id)).toContain("w");
    expect(r).toMatchObject({ kind: "answer", answer: "Mario Rossi (@mario.ai).", sources: ["w"], consulted: 3, total: 3 });
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
  });
});
