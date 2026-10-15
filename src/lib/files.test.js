import { describe, expect, it } from "vitest";
import { extractFileText, fileMime, validateFile } from "./files.js";
import { unreadFile } from "./enrich.js";

const file = (name, type, size = 10) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("video caricati", () => {
  it("accetta mp4, mov e webm; il mime manca? lo ricava dall'estensione", () => {
    expect(validateFile(file("a.mp4", "video/mp4"))).toBeNull();
    expect(validateFile(file("b.mov", "video/quicktime"))).toBeNull();
    expect(validateFile(file("c.webm", "video/webm"))).toBeNull();
    expect(fileMime(file("d.MOV", ""))).toBe("video/quicktime");
  });
  it("limite di 50 MB per i video, 15 MB per gli altri file", () => {
    expect(validateFile(file("a.mp4", "video/mp4", 49 * 1024 * 1024))).toBeNull();
    expect(validateFile(file("a.mp4", "video/mp4", 51 * 1024 * 1024))).toBe("File troppo grande: massimo 50 MB.");
    expect(validateFile(file("a.png", "image/png", 16 * 1024 * 1024))).toBe("File troppo grande: massimo 15 MB.");
  });
  it("tipi non ammessi (es. avi) hanno un messaggio chiaro", () => {
    expect(validateFile(file("a.avi", "video/x-msvideo"))).toMatch(/Usa immagini, video, PDF/);
  });
  it("il video si conserva subito, la trascrizione viene dopo", async () => {
    const r = await extractFileText(file("a.mp4", "video/mp4"));
    expect(r).toMatchObject({ text: null, status: "saved" });
    expect(r.detail).toMatch(/trascrivo il parlato/);
  });
  it("l'AI legge i video salvati e non ancora trascritti", () => {
    expect(unreadFile({ file_path: "u/x/a.mov", file_mime: "video/quicktime" })).toBe("video");
    expect(unreadFile({ file_path: "u/x/a.mp4", file_mime: "video/mp4", extracted_text: "già trascritto" })).toBeNull();
  });
});
