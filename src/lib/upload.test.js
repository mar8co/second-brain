import { describe, expect, it, vi } from "vitest";
import { saveFiles, uploadMessage } from "./upload.js";

const file = (name, type, body = "ciao") => new File([body], name, { type });

describe("saveFiles", () => {
  it("salva immagini e testo, uno per volta, con il tipo giusto", async () => {
    const add = vi.fn(async (item) => ({ id: `id-${add.mock.calls.length}`, ...item }));
    const r = await saveFiles([file("foto.png", "image/png"), file("nota.txt", "text/plain", "testo")], add);
    expect(r.errors).toEqual([]);
    expect(r.saved).toHaveLength(2);
    expect(add.mock.calls[0][0]).toMatchObject({ type: "image", status: "saved", categories: [], tags: [] });
    expect(add.mock.calls[0][1].name).toBe("foto.png");
    expect(add.mock.calls[1][0]).toMatchObject({ type: "file", extracted_text: "testo", status: "analyzed" });
  });
  it("salta i file non ammessi e continua con gli altri", async () => {
    const add = vi.fn(async (item) => item);
    const r = await saveFiles([file("a.exe", "application/x-msdownload"), file("b.png", "image/png")], add);
    expect(r.saved).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^a\.exe: Tipo di file non supportato/);
  });
  it("un errore di salvataggio non ferma gli altri", async () => {
    const add = vi.fn().mockRejectedValueOnce(new Error("rete")).mockResolvedValueOnce({ id: "x" });
    const r = await saveFiles([file("a.png", "image/png"), file("b.png", "image/png")], add);
    expect(r.saved).toHaveLength(1);
    expect(r.errors).toEqual(["a.png: rete"]);
  });
});

describe("uploadMessage", () => {
  it("dice quanti ne ha salvati", () => {
    expect(uploadMessage({ saved: [1], errors: [] })).toBe("Salvato nell'archivio");
    expect(uploadMessage({ saved: [1, 2], errors: ["x"] })).toBe("2 salvati nell'archivio; 1 non salvato");
    expect(uploadMessage({ saved: [], errors: ["a.exe: Tipo di file non supportato."] })).toBe("a.exe: Tipo di file non supportato.");
  });
});
