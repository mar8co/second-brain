import { describe, expect, it, vi } from "vitest";
import { geocodeQuery, handleGeo, parseStreet, sameName } from "./geo.js";

const env = { ALLOW_NO_AUTH: "1", GEOCODE_API_BASE: "https://osm.test/" };
const calisto = { category: "amenity", name: "Bar San Calisto", display_name: "Bar San Calisto, Roma", address: { road: "Piazza di San Calisto", house_number: "3", city: "Roma" } };

describe("via di un locale (OpenStreetMap)", () => {
  it("nome e città nella ricerca, senza ripetere il nome", () => {
    expect(geocodeQuery({ name: "Bar San Calisto", address: "Roma" })).toBe("Bar San Calisto, Roma");
    expect(geocodeQuery({ name: "Da Enzo", address: "Da Enzo, Roma" })).toBe("Da Enzo, Roma");
    expect(geocodeQuery({})).toBe("");
  });

  it("riconosce se il risultato è proprio quel posto", () => {
    expect(sameName("Bar San Calisto", "Bar San Calisto")).toBe(true);
    expect(sameName("Da Enzo al 29", "Trattoria Da Enzo")).toBe(true);
    // "bar" e "da" da soli non bastano.
    expect(sameName("Bar Roma", "Bar Napoli")).toBe(false);
    expect(sameName("Da Enzo", "Pizzeria da Gino")).toBe(false);
  });

  it("via, civico e città solo di un posto vero con la via", () => {
    expect(parseStreet([calisto], "Bar San Calisto")).toEqual({ street: "Piazza di San Calisto 3, Roma", label: "Bar San Calisto, Roma" });
    expect(parseStreet([{ ...calisto, address: { city: "Roma" } }], "Bar San Calisto")).toBeNull();
    expect(parseStreet([{ ...calisto, category: "boundary" }], "Bar San Calisto")).toBeNull();
    expect(parseStreet([{ ...calisto, name: "Altro posto", display_name: "Altro posto, Roma" }], "Bar San Calisto")).toBeNull();
    expect(parseStreet([], "x")).toBeNull();
    expect(parseStreet([{ ...calisto, address: { road: "Via Garibaldi", city: "Torino" } }], "Bar San Calisto")).toEqual({ street: "Via Garibaldi, Torino", label: "Bar San Calisto, Roma" });
  });

  it("si presenta a Nominatim e rispetta una richiesta al secondo", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => [calisto] }));
    const wait = vi.fn(async () => {});
    let t = 1_000_000;
    const now = () => t;
    const a = await handleGeo({ body: { place: { name: "Bar San Calisto", address: "Roma" } }, env, fetchImpl, now, wait });
    expect(a).toEqual({ status: 200, json: { query: "Bar San Calisto, Roma", found: { street: "Piazza di San Calisto 3, Roma", label: "Bar San Calisto, Roma" } } });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://osm.test/search?q=Bar+San+Calisto%2C+Roma&format=jsonv2&limit=3&addressdetails=1&accept-language=it");
    expect(opts.headers["User-Agent"]).toMatch(/^second-brain\//);
    t += 300;
    await handleGeo({ body: { place: { name: "Mole" } }, env, fetchImpl, now, wait });
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
