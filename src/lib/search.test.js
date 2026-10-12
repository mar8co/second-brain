import { describe, expect, it } from "vitest";
import { countBy, matchesFilters, normalize, retrieveForQuestion, searchItems } from "./search.js";

const items = [
  { id: "1", type: "link", title: "Ricetta pasta al limone", tags: ["pasta"], categories: ["Ricette"], created_at: "2026-10-01T10:00:00Z" },
  { id: "2", type: "place", title: "Trattoria Da Enzo", place: { name: "Trattoria Da Enzo" }, note: "ristorante a Roma, Trastevere", categories: ["Posti"], created_at: "2026-10-05T10:00:00Z" },
  { id: "3", type: "social", url: "https://www.instagram.com/reel/abc/", note: "esercizi per la schiena", tags: ["fitness"], categories: [], created_at: "2026-09-20T10:00:00Z" },
  { id: "4", type: "shopping", title: "Zaino da viaggio", description: "Zaino impermeabile 30 litri", categories: ["Acquisti"], created_at: "2026-10-10T10:00:00Z" },
  { id: "5", type: "note", title: "Città d'arte", extracted_text: "perché visitare Perugia", categories: [], created_at: "2026-10-11T10:00:00Z" },
];

describe("normalize", () => {
  it("toglie accenti e punteggiatura", () => expect(normalize("Città, Perché!")).toBe("citta perche"));
});

describe("searchItems", () => {
  it("senza query restituisce tutto dal più recente", () => {
    expect(searchItems(items, "").map((i) => i.id)).toEqual(["5", "4", "2", "1", "3"]);
  });
  it("trova per titolo con plurale/singolare e prefisso", () => {
    expect(searchItems(items, "ricette").map((i) => i.id)).toEqual(["1"]);
    expect(searchItems(items, "zain").map((i) => i.id)).toEqual(["4"]);
  });
  it("cerca nelle note, nei tag e nell'URL", () => {
    expect(searchItems(items, "schiena").map((i) => i.id)).toEqual(["3"]);
    expect(searchItems(items, "instagram").map((i) => i.id)).toEqual(["3"]);
  });
  it("richiede tutte le parole", () => {
    expect(searchItems(items, "pasta roma")).toEqual([]);
  });
  it("ignora gli accenti", () => {
    expect(searchItems(items, "citta perche").map((i) => i.id)).toEqual(["5"]);
  });
  it("il titolo pesa più del testo", () => {
    const more = [...items, { id: "6", type: "link", title: "Altro", extracted_text: "trattoria", created_at: "2026-10-12T00:00:00Z" }];
    expect(searchItems(more, "trattoria").map((i) => i.id)).toEqual(["2", "6"]);
  });
  it("applica i filtri", () => {
    expect(searchItems(items, "", { type: "place" }).map((i) => i.id)).toEqual(["2"]);
    expect(searchItems(items, "", { category: "Ricette" }).map((i) => i.id)).toEqual(["1"]);
    expect(searchItems(items, "", { from: "2026-10-05", to: "2026-10-10" }).map((i) => i.id)).toEqual(["4", "2"]);
  });
});

describe("retrieveForQuestion", () => {
  it("ignora le parole vuote e raccoglie candidati con almeno una parola", () => {
    expect(retrieveForQuestion(items, "Dove avevo salvato quel ristorante a Roma?").map((i) => i.id)).toEqual(["2"]);
  });
  it("vuoto se la domanda ha solo parole vuote", () => {
    expect(retrieveForQuestion(items, "dove avevo salvato quello?")).toEqual([]);
  });
});

describe("matchesFilters / countBy", () => {
  it("filtra per tag", () => expect(matchesFilters(items[0], { tag: "pasta" })).toBe(true));
  it("conta le categorie", () => expect(countBy(items, "categories")[0]).toEqual(["Acquisti", 1]));
});
