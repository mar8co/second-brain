import { describe, expect, it } from "vitest";
import { embeddingText, needsEmbedding } from "./embed.js";

const item = { id: "1", title: "Workshop AI", author: "Mario Rossi", ai: { summary: "Un workshop sull'intelligenza artificiale a Roma.", points: ["Si tiene a novembre"], entities: [{ name: "Roma" }], keywords: ["ai", "workshop"] } };

describe("embed", () => {
  it("compone il testo da titolo, autore, riepilogo, punti, entità e parole chiave", () => {
    const t = embeddingText(item);
    expect(t).toContain("Workshop AI");
    expect(t).toContain("di Mario Rossi");
    expect(t).toContain("intelligenza artificiale");
    expect(t).toContain("Roma");
    expect(t).toContain("ai, workshop");
  });
  it("senza scheda usa la descrizione", () => {
    expect(embeddingText({ title: "Ricetta", description: "Pasta al limone con burro" })).toContain("Pasta al limone");
  });
  it("da indicizzare solo se manca il segno e c'è del testo", () => {
    expect(needsEmbedding(item)).toBe(true);
    expect(needsEmbedding({ ...item, ai: { ...item.ai, emb_at: "2026-10-21" } })).toBe(false);
    expect(needsEmbedding({ ...item, status: "processing" })).toBe(false);
    expect(needsEmbedding({ id: "2" })).toBe(false);
  });
});
