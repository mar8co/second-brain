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
