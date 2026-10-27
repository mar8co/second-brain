import { describe, expect, it } from "vitest";
import { NO_CATEGORY, countBy, countValues, groupByCategory, matchesFilters, normalize, retrieveForQuestion, searchItems, sortItems } from "./search.js";

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

describe("box per categoria", () => {
  it("raggruppa dalla più piena; un elemento con più categorie sta in ognuna; senza categoria in fondo", () => {
    const multi = [
      { id: "a", categories: ["Cibo", "Ricette"] },
      { id: "b", categories: ["Ricette"] },
      { id: "c", categories: [] },
      { id: "d" },
    ];
    const g = groupByCategory(multi);
    expect(g.map(([c, list]) => [c, list.map((i) => i.id)])).toEqual([
      ["Ricette", ["a", "b"]],
      ["Cibo", ["a"]],
      [NO_CATEGORY, ["c", "d"]],
    ]);
    expect(groupByCategory([{ id: "a", categories: ["X"] }]).some(([c]) => c === NO_CATEGORY)).toBe(false);
    expect(groupByCategory([])).toEqual([]);
  });

  it("il filtro Categoria accetta anche 'Senza categoria'", () => {
    expect(matchesFilters({ categories: [] }, { category: NO_CATEGORY })).toBe(true);
    expect(matchesFilters({}, { category: NO_CATEGORY })).toBe(true);
    expect(matchesFilters({ categories: ["Cibo"] }, { category: NO_CATEGORY })).toBe(false);
    expect(matchesFilters({ categories: ["Cibo"] }, { category: "Cibo" })).toBe(true);
  });
});

describe("ricerca nella scheda di memoria", () => {
  const reel = {
    id: "w", type: "social", title: "Reel", author: "Mario Rossi (@mario.ai)", created_at: "2026-10-13T10:00:00Z",
    ai: { v: 2, summary: "", points: ["Workshop gratuito il 28 settembre."], entities: [{ name: "Talent Garden", kind: "luogo" }], keywords: ["intelligenza artificiale", "corso"] },
  };
  it("trova per autore, parole chiave, persone e punti chiave", () => {
    expect(searchItems([reel], "mario.ai").map((i) => i.id)).toEqual(["w"]);
    expect(searchItems([reel], "corso").map((i) => i.id)).toEqual(["w"]);
    expect(searchItems([reel], "talent garden").map((i) => i.id)).toEqual(["w"]);
    expect(retrieveForQuestion([reel], "chi fa corsi di intelligenza artificiale?").map((i) => i.id)).toEqual(["w"]);
  });
  it("dati non validi nella scheda non bloccano la ricerca", () => {
    const bad = { ...reel, id: "b", ai: { keywords: [null, 3], entities: [null, { name: 5 }], points: "testo" } };
    expect(() => searchItems([bad], "corso")).not.toThrow();
  });
});

describe("filtri per autore, sito e periodo", () => {
  const post = { id: "x", type: "social", author: "Mario Rossi (@mario.ai)", site_name: "Instagram", created_at: "2026-10-10T10:00:00Z" };
  it("autore e sito esatti", () => {
    expect(matchesFilters(post, { author: "Mario Rossi (@mario.ai)" })).toBe(true);
    expect(matchesFilters(post, { author: "Altro" })).toBe(false);
    expect(matchesFilters(post, { site: "Instagram" })).toBe(true);
    expect(matchesFilters(post, { site: "TikTok" })).toBe(false);
  });
  it("conteggi di un campo", () => {
    expect(countValues([post, post, { ...post, author: "Anna" }, { id: "y" }], "author")).toEqual([["Mario Rossi (@mario.ai)", 2], ["Anna", 1]]);
  });
});

describe("filtro Preferiti e ordine", () => {
  it("il filtro preferiti tiene solo gli elementi con la stella", () => {
    expect(matchesFilters({ favorite: true }, { preferiti: "1" })).toBe(true);
    expect(matchesFilters({}, { preferiti: "1" })).toBe(false);
    expect(matchesFilters({}, {})).toBe(true);
  });
  it("sortItems: più recenti (predefinito), meno recenti, nome", () => {
    const l = [{ id: "b", title: "Zeta", created_at: "2026-01-02" }, { id: "a", title: "Alfa", created_at: "2026-01-03" }, { id: "c", title: "Mela", created_at: "2026-01-01" }];
    expect(sortItems(l).map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(sortItems(l, "vecchi").map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(sortItems(l, "nome").map((x) => x.id)).toEqual(["a", "c", "b"]);
  });
});
