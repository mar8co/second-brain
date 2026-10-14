import { describe, expect, it } from "vitest";
import { formatRange, isoDay, monthGrid, parseDay, pickDay } from "./calendar.js";

describe("calendario dei filtri", () => {
  it("griglia di 42 giorni che parte dal lunedì", () => {
    const g = monthGrid(2026, 9); // ottobre 2026: il 1° è giovedì
    expect(g).toHaveLength(42);
    expect(isoDay(g[0])).toBe("2026-09-28");
    expect(g[0].getDay()).toBe(1);
    expect(isoDay(g[3])).toBe("2026-10-01");
    expect(isoDay(g[41])).toBe("2026-11-08");
  });

  it("mese che comincia di lunedì: nessun giorno del mese prima", () => {
    expect(isoDay(monthGrid(2026, 5)[0])).toBe("2026-06-01");
  });

  it("legge e scrive i giorni nell'ora locale", () => {
    expect(isoDay(parseDay("2026-02-28"))).toBe("2026-02-28");
    expect(parseDay("")).toBeNull();
    expect(parseDay("28/02/2026")).toBeNull();
  });

  it("primo tocco = inizio, secondo = fine, anche al contrario", () => {
    let s = pickDay({ from: "", to: "" }, "2026-10-12", "inizio");
    expect(s).toEqual({ from: "2026-10-12", to: "", phase: "fine" });
    expect(pickDay(s, "2026-10-20", s.phase)).toEqual({ from: "2026-10-12", to: "2026-10-20", phase: "inizio" });
    expect(pickDay(s, "2026-10-03", s.phase)).toEqual({ from: "2026-10-03", to: "2026-10-12", phase: "inizio" });
    expect(pickDay(s, "2026-10-12", s.phase)).toEqual({ from: "2026-10-12", to: "2026-10-12", phase: "inizio" });
    // Con un periodo già scelto, il tocco successivo ne comincia uno nuovo.
    s = pickDay({ from: "2026-10-12", to: "2026-10-20" }, "2026-11-02", "inizio");
    expect(s).toEqual({ from: "2026-11-02", to: "", phase: "fine" });
  });

  it("descrive il periodo in breve", () => {
    expect(formatRange("2026-10-12", "2026-10-20")).toBe("12 – 20 ott 2026");
    expect(formatRange("2026-09-28", "2026-10-03")).toBe("28 set – 3 ott 2026");
    expect(formatRange("2025-12-28", "2026-01-03")).toBe("28 dic 2025 – 3 gen 2026");
    expect(formatRange("2026-10-12", "2026-10-12")).toBe("12 ott 2026");
    expect(formatRange("2026-10-12", "")).toBe("dal 12 ott 2026");
    expect(formatRange("", "2026-10-20")).toBe("fino al 20 ott 2026");
    expect(formatRange("", "")).toBe("");
  });
});
