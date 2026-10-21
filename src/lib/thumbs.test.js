import { describe, expect, it, vi } from "vitest";
import { rememberThumb, THUMB_CACHE } from "./thumbs.js";

const fakeCaches = (stored = new Map()) => ({
  stored,
  open: vi.fn(async () => ({
    match: async (u) => stored.get(u),
    put: async (u, r) => void stored.set(u, r),
  })),
});

describe("rememberThumb", () => {
  it("salva la miniatura caricata bene, una sola volta", async () => {
    const cs = fakeCaches();
    const f = vi.fn(async () => ({ type: "opaque", ok: false }));
    expect(await rememberThumb("https://cdn.example/a.jpg", { cacheStorage: cs, doFetch: f })).toBe(true);
    expect(cs.open).toHaveBeenCalledWith(THUMB_CACHE);
    expect(cs.stored.has("https://cdn.example/a.jpg")).toBe(true);
    await rememberThumb("https://cdn.example/a.jpg", { cacheStorage: cs, doFetch: f });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("non salva errori visibili, URL strani o senza cache", async () => {
    const cs = fakeCaches();
    expect(await rememberThumb("https://cdn.example/b.jpg", { cacheStorage: cs, doFetch: async () => ({ type: "basic", ok: false }) })).toBe(false);
    expect(cs.stored.size).toBe(0);
    expect(await rememberThumb("data:image/png;base64,AAAA", { cacheStorage: cs, doFetch: vi.fn() })).toBe(false);
    expect(await rememberThumb("https://cdn.example/c.jpg", { cacheStorage: null, doFetch: vi.fn() })).toBe(false);
  });
  it("se la rete fallisce non lancia errori", async () => {
    const cs = fakeCaches();
    expect(await rememberThumb("https://cdn.example/d.jpg", { cacheStorage: cs, doFetch: async () => { throw new Error("rete"); } })).toBe(false);
  });
});

describe("miniature copiate nell'archivio", () => {
  it("riconosce il percorso salvato", async () => {
    const { isStoredThumb, storedPath, storedUrl } = await import("./thumbs.js");
    expect(isStoredThumb("sb-storage:u/miniature/a.jpg")).toBe(true);
    expect(isStoredThumb("https://cdn/x.jpg")).toBe(false);
    expect(storedPath(storedUrl("u/miniature/a.jpg"))).toBe("u/miniature/a.jpg");
    expect(storedPath("https://cdn/x.jpg")).toBeNull();
  });
  it("copia solo link con indirizzo http(s) e meno di due tentativi", async () => {
    const { thumbsToSave } = await import("./thumbs.js");
    const items = [
      { id: "a", image_url: "https://cdn/a.jpg" },
      { id: "b", image_url: "sb-storage:u/miniature/b.jpg" },
      { id: "c", image_url: "https://cdn/c.jpg", file_path: "u/c/x.png" },
      { id: "d", image_url: "https://cdn/d.jpg" },
      { id: "e", image_url: null },
    ];
    expect(thumbsToSave(items, { d: 2 }).map((i) => i.id)).toEqual(["a"]);
  });
});
