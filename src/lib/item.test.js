import { describe, expect, it } from "vitest";
import { cleanList, displayTitle, sanitizeItem } from "./item.js";
import { extractionPatch } from "./process.js";
import { looksLikeQuestion } from "./format.js";

describe("sanitizeItem", () => {
  it("tiene solo le colonne note e applica i limiti", () => {
    const out = sanitizeItem({ title: "x".repeat(400), evil: 1, type: "boh", status: "boh", tags: ["Pasta", "pasta", " ", "Roma"], url: "javascript:alert(1)" });
    expect(out.title).toHaveLength(300);
    expect(out).not.toHaveProperty("evil");
    expect(out.type).toBe("link");
    expect(out.status).toBe("saved");
    expect(out.tags).toEqual(["pasta", "roma"]);
    expect(out.url).toBeNull();
  });
  it("cleanList deduplica senza distinguere maiuscole", () => expect(cleanList(["A", "a", "B"])).toEqual(["A", "B"]));
});

describe("displayTitle", () => {
  it("non inventa: usa titolo, posto, file, nota o dominio", () => {
    expect(displayTitle({ title: "T" })).toBe("T");
    expect(displayTitle({ place: { name: "Bar" } })).toBe("Bar");
    expect(displayTitle({ note: "prima riga\nseconda" })).toBe("prima riga");
    expect(displayTitle({ url: "https://www.instagram.com/reel/abc/" })).toBe("instagram.com/reel/abc/");
    expect(displayTitle({})).toBe("Senza titolo");
  });
});

describe("extractionPatch", () => {
  it("non sovrascrive titolo e descrizione inseriti a mano", () => {
    const p = extractionPatch({ title: "Mio titolo", description: null }, { title: "Dalla pagina", description: "Desc", status: "analyzed", text: "testo", textSource: "testo della pagina" });
    expect(p).not.toHaveProperty("title");
    expect(p.description).toBe("Desc");
    expect(p.status).toBe("analyzed");
    expect(p.text_source).toBe("testo della pagina");
  });
  it("usa il nome del posto come titolo", () => {
    const p = extractionPatch({}, { place: { name: "Bar Roma", lat: 1, lng: 2 }, status: "analyzed" });
    expect(p.title).toBe("Bar Roma");
  });
});

describe("looksLikeQuestion", () => {
  it.each([
    ["dove avevo salvato la pizzeria", true],
    ["pizzeria napoli?", true],
    ["pizzeria napoli", false],
  ])("%s → %s", (q, v) => expect(looksLikeQuestion(q)).toBe(v));
});
