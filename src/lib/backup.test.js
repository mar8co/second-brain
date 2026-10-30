import { describe, expect, it } from "vitest";
import { crc32, creaBackup, nomeNelBackup, preferenze, zipBytes } from "./backup.js";

// Legge uno zip "stored" (come quello che scriviamo): nome → byte.
function leggiZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const out = new Map();
  let at = 0;
  while (v.getUint32(at, true) === 0x04034b50) {
    const crc = v.getUint32(at + 14, true);
    const size = v.getUint32(at + 18, true);
    const nameLen = v.getUint16(at + 26, true);
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const data = bytes.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    expect(crc32(data)).toBe(crc);
    out.set(name, data);
    at += 30 + nameLen + size;
  }
  const end = bytes.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  expect(v.getUint16(end + 10, true)).toBe(out.size);
  return out;
}

describe("backup", () => {
  it("crc32 come lo standard", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("zip leggibile con nomi accentati", () => {
    const zip = zipBytes([
      { name: "a.txt", data: new TextEncoder().encode("ciao") },
      { name: "files/caffè.jpg", data: new Uint8Array([1, 2, 3]) },
    ]);
    const files = leggiZip(zip);
    expect(new TextDecoder().decode(files.get("a.txt"))).toBe("ciao");
    expect([...files.get("files/caffè.jpg")]).toEqual([1, 2, 3]);
  });

  it("contenuti, chat, preferenze e file; un file che non si scarica è segnato, non blocca", async () => {
    const items = [
      { id: "a", title: "Nota" },
      { id: "b", file_path: "u/b.jpg", file_name: "foto.jpg" },
      { id: "c", file_path: "u/c.pdf", file_name: "doc.pdf" },
    ];
    const passi = [];
    const r = await creaBackup({
      items,
      chat: [{ q: "domanda" }],
      prefs: { "sb-ordine-box": ["x"] },
      scarica: async (it) => {
        if (it.id === "c") throw new Error("offline");
        return new Uint8Array([9]);
      },
      avanzamento: (f, t) => passi.push(`${f}/${t}`),
    });
    expect(r).toMatchObject({ salvati: 1, mancanti: 1 });
    expect(passi).toEqual(["0/2", "1/2", "2/2"]);
    const files = leggiZip(r.zip);
    const dati = JSON.parse(new TextDecoder().decode(files.get("backup.json")));
    expect(dati.items).toHaveLength(3);
    expect(dati.chat).toEqual([{ q: "domanda" }]);
    expect(dati.preferenze).toEqual({ "sb-ordine-box": ["x"] });
    expect(dati.file).toEqual([nomeNelBackup(items[1])]);
    expect(dati.file_mancanti).toEqual([{ id: "c", file_name: "doc.pdf", errore: "offline" }]);
    expect([...files.get(nomeNelBackup(items[1]))]).toEqual([9]);
  });

  it("preferenze: solo le scelte, non le copie temporanee", () => {
    const m = new Map([
      ["sb-ordine-box", '["a"]'],
      ["second-brain-settings", '{"autoAi":true}'],
      ["sb-url-file", "[]"],
      ["second-brain-rereads", "{}"],
      ["sb-chat-v1", "[]"],
      ["altro", "x"],
    ]);
    const storage = { length: m.size, key: (i) => [...m.keys()][i], getItem: (k) => m.get(k) };
    expect(preferenze(storage)).toEqual({ "sb-ordine-box": ["a"], "second-brain-settings": { autoAi: true } });
  });
});
