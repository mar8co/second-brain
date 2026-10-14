import { describe, expect, it } from "vitest";
import { directionsUrl, distanceKm, formatDistance, geoPatch, geocodeQueue, mapPoints } from "./places.js";

const now = new Date("2026-10-14T20:00:00Z");
const reel = {
  id: "r",
  title: "I 3 ristoranti di Trastevere",
  ai: { v: 3, summary: "s", places: [{ name: "Da Enzo al 29", address: "Via dei Vascellari 29, Roma" }, { name: "Bar San Calisto", address: "Roma" }] },
};
const maps = { id: "m", title: "Pizzeria", place: { name: "Pizzeria Ai Marmi", lat: 41.88, lng: 12.47 } };

describe("posti per la mappa", () => {
  it("cerca la posizione dei posti citati e dei posti senza coordinate, una volta sola", () => {
    const named = { id: "n", place: { name: "Museo Egizio" } };
    const q = geocodeQueue([reel, maps, named, { id: "x" }]);
    expect(q.map((e) => [e.item.id, e.target, e.place])).toEqual([
      ["r", 0, { name: "Da Enzo al 29", address: "Via dei Vascellari 29, Roma" }],
      ["r", 1, { name: "Bar San Calisto", address: "Roma" }],
      ["n", "posto", { name: "Museo Egizio", address: "" }],
    ]);
    // Trovato o no, non si cerca più.
    const r2 = { ...reel, ...geoPatch(reel, 0, { lat: 41.889, lng: 12.474, label: "Da Enzo, Roma" }, now) };
    const r3 = { ...r2, ...geoPatch(r2, 1, null, now) };
    const n2 = { ...named, ...geoPatch(named, "posto", null, now) };
    expect(geocodeQueue([r3, n2])).toEqual([]);
    expect(r3.ai.places[0]).toEqual({ name: "Da Enzo al 29", address: "Via dei Vascellari 29, Roma", geo: { lat: 41.889, lng: 12.474, label: "Da Enzo, Roma" }, geo_at: now.toISOString() });
    expect(r3.ai.places[1].geo).toBeNull();
    expect(r3.ai.summary).toBe("s");
  });

  it("punti sulla mappa: posto del link (esatto) e posti trovati (approssimativi)", () => {
    const r2 = { ...reel, ...geoPatch(reel, 0, { lat: 41.889, lng: 12.474 }, now) };
    expect(mapPoints(maps)).toMatchObject([{ key: "m:posto", name: "Pizzeria Ai Marmi", lat: 41.88, lng: 12.47, approx: false }]);
    expect(mapPoints(r2)).toMatchObject([{ key: "r:0", name: "Da Enzo al 29", address: "Via dei Vascellari 29, Roma", approx: true }]);
    const named = { id: "n", place: { name: "Museo Egizio" } };
    const n2 = { ...named, ...geoPatch(named, "posto", { lat: 45.06, lng: 7.68, label: "Museo Egizio, Torino" }, now) };
    expect(mapPoints(n2)).toMatchObject([{ name: "Museo Egizio", address: "Museo Egizio, Torino", approx: true }]);
    expect(mapPoints({ id: "z", ai: { places: "rotto" } })).toEqual([]);
  });

  it("distanze", () => {
    expect(distanceKm({ lat: 41.9028, lng: 12.4964 }, { lat: 45.4642, lng: 9.19 })).toBeGreaterThan(470);
    expect(formatDistance(0.004)).toBe("10 m");
    expect(formatDistance(0.347)).toBe("350 m");
    expect(formatDistance(2.345)).toBe("2,3 km");
    expect(formatDistance(123.4)).toBe("123 km");
  });

  it("indicazioni con Mappe di Apple o Google Maps", () => {
    const p = { name: "Da Enzo", lat: 41.889, lng: 12.474 };
    expect(directionsUrl(p, true)).toBe("https://maps.apple.com/?q=Da+Enzo&ll=41.889%2C12.474");
    expect(directionsUrl(p, false)).toBe("https://www.google.com/maps/search/?api=1&query=Da+Enzo+41.889%2C12.474");
  });
});
