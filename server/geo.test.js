import { describe, expect, it, vi } from "vitest";
import { geocodeQuery, handleGeo, parseNominatim } from "./geo.js";

const env = { ALLOW_NO_AUTH: "1", GEOCODE_API_BASE: "https://osm.test/" };

describe("posizione dei posti (OpenStreetMap)", () => {
  it("nome e indirizzo nella ricerca, senza ripetere il nome", () => {
    expect(geocodeQuery({ name: "Da Enzo al 29", address: "Via dei Vascellari 29, Roma" })).toBe("Da Enzo al 29, Via dei Vascellari 29, Roma");
    expect(geocodeQuery({ name: "Da Enzo", address: "Da Enzo, Roma" })).toBe("Da Enzo, Roma");
    expect(geocodeQuery({ name: "  Museo  Egizio " })).toBe("Museo Egizio");
    expect(geocodeQuery({})).toBe("");
  });

  it("legge il primo risultato e scarta coordinate non valide", () => {
    expect(parseNominatim([{ lat: "41.8891234567", lon: "12.4742", display_name: "Da Enzo, Roma" }])).toEqual({ lat: 41.889123, lng: 12.4742, label: "Da Enzo, Roma" });
    expect(parseNominatim([])).toBeNull();
    expect(parseNominatim([{ lat: "x", lon: "1" }])).toBeNull();
    expect(parseNominatim([{ lat: "100", lon: "1" }])).toBeNull();
  });

  it("si presenta a Nominatim e rispetta una richiesta al secondo", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ lat: "45.06", lon: "7.68", display_name: "Museo Egizio, Torino" }] }));
    const wait = vi.fn(async () => {});
    let t = 1_000_000;
    const now = () => t;
    const a = await handleGeo({ body: { place: { name: "Museo Egizio", address: "Torino" } }, env, fetchImpl, now, wait });
    expect(a).toEqual({ status: 200, json: { query: "Museo Egizio, Torino", found: { lat: 45.06, lng: 7.68, label: "Museo Egizio, Torino" } } });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://osm.test/search?q=Museo+Egizio%2C+Torino&format=jsonv2&limit=1&accept-language=it");
    expect(opts.headers["User-Agent"]).toMatch(/^second-brain\//);
    t += 300;
    await handleGeo({ body: { place: { name: "Mole Antonelliana" } }, env, fetchImpl, now, wait });
    expect(wait).toHaveBeenCalledWith(800);
  });

  it("errori chiari; senza posto 400; senza login 401", async () => {
    const wait = async () => {};
    expect((await handleGeo({ body: {}, env, wait })).status).toBe(400);
    const busy = async () => ({ ok: false, status: 429 });
    expect((await handleGeo({ body: { place: { name: "x" } }, env, fetchImpl: busy, wait })).status).toBe(429);
    const down = async () => {
      throw new Error("rete");
    };
    expect(await handleGeo({ body: { place: { name: "x" } }, env, fetchImpl: down, wait })).toEqual({ status: 502, json: { error: "Impossibile contattare OpenStreetMap." } });
    const prod = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k" };
    expect((await handleGeo({ body: { place: { name: "x" } }, env: prod, wait })).status).toBe(401);
  });
});
