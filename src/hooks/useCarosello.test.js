import { describe, expect, it, vi } from "vitest";
import { chiediEntrata, elastico, entrataScheda, passaOltre } from "./useCarosello.js";

describe("swipe tra le schede", () => {
  it("ai bordi la scheda si allunga sempre meno, senza mai arrivare al dito", () => {
    expect(elastico(0, 360)).toBe(0);
    const piccolo = elastico(40, 360);
    const grande = elastico(400, 360);
    expect(piccolo).toBeGreaterThan(0);
    expect(piccolo).toBeLessThan(40);
    expect(grande).toBeLessThan(400 * 0.4);
    expect(grande).toBeGreaterThan(piccolo);
    expect(elastico(-400, 360)).toBeCloseTo(-grande);
  });

  it("lasciando: si passa oltre con un gesto lungo o veloce, non tornando indietro", () => {
    const w = 360;
    // Lungo (oltre il 22% della larghezza), anche lento.
    expect(passaOltre(-90, 0, w)).toBe(true);
    expect(passaOltre(90, 0.05, w)).toBe(true);
    // Corto e lento: torna al suo posto.
    expect(passaOltre(-60, -0.1, w)).toBe(false);
    // Corto ma veloce nella stessa direzione: passa.
    expect(passaOltre(-40, -0.6, w)).toBe(true);
    // Veloce ma pochi pixel: è un tocco, non uno swipe.
    expect(passaOltre(-15, -1.2, w)).toBe(false);
    // Lungo ma il dito stava tornando indietro: resta.
    expect(passaOltre(-150, 0.5, w)).toBe(false);
    expect(passaOltre(0, -2, w)).toBe(false);
  });

  it("la scheda ripristinata entra dal suo lato, solo per poco", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T12:00:00Z"));
    chiediEntrata("a", "-");
    expect(entrataScheda("a")).toBe("-");
    // Letta due volte (React in sviluppo monta due volte): vale ancora.
    expect(entrataScheda("a")).toBe("-");
    expect(entrataScheda("b")).toBe(null);
    vi.advanceTimersByTime(2000);
    expect(entrataScheda("a")).toBe(null);
    vi.useRealTimers();
  });
});
