import { describe, expect, it } from "vitest";
import { BOX_PALETTE, categoryColor } from "./colors.js";
import { hasFileCover } from "./fileurl.js";

describe("colori dei box", () => {
  it("le categorie prendono i colori in sequenza, dal giallo", () => {
    const nomi = ["Casa", "Cibo", "Sport"];
    expect(categoryColor("Casa", nomi).bg).toBe("var(--giallo)");
    expect(categoryColor("Cibo", nomi).bg).toBe("var(--arancio)");
    expect(categoryColor("Sport", nomi)).toBe(BOX_PALETTE[2]);
  });
  it("blu e nero hanno il testo bianco, gli altri nero", () => {
    for (const c of BOX_PALETTE) expect(c.fg).toBe(/blu|0a0a0a/.test(c.bg) ? "#ffffff" : "#0a0a0a");
  });
  it("la copertina c'è per foto e video caricati, non per i documenti", () => {
    expect(hasFileCover({ file_path: "a", file_mime: "image/png" })).toBe(true);
    expect(hasFileCover({ file_path: "a", file_mime: "video/mp4" })).toBe(true);
    expect(hasFileCover({ file_path: "a", file_mime: "application/pdf" })).toBe(false);
    expect(hasFileCover({ image_url: "https://x" })).toBe(false);
  });
});
