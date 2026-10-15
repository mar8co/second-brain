import { describe, expect, it } from "vitest";
import { buildIcs } from "./ics.js";

describe("buildIcs", () => {
  const ics = buildIcs(
    [
      { key: "a|2026-10-25", name: "Workshop, AI", date: "2026-10-25", end_date: "2026-10-27", place: "Roma", items: [{ url: "https://x.it/p" }] },
      { key: "b|", name: "Senza data", date: "", items: [] },
    ],
    new Date("2026-10-15T10:00:00Z"),
  );
  it("tutto il giorno, fine esclusiva, nome e colore", () => {
    expect(ics).toContain("X-WR-CALNAME:second-brain");
    expect(ics).toContain("X-APPLE-CALENDAR-COLOR:#ffb5d0");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261025");
    expect(ics).toContain("DTEND;VALUE=DATE:20261028");
    expect(ics).toContain("SUMMARY:🎟️ Workshop\\, AI");
    expect(ics).not.toContain("Senza data");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("evento di un giorno finisce il giorno dopo", () => {
    expect(buildIcs([{ key: "c", name: "C", date: "2026-12-31", items: [] }]).includes("DTEND;VALUE=DATE:20270101")).toBe(true);
  });
});
