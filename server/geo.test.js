import { describe, expect, it, vi } from "vitest";
import { cityOf, geocodeQuery, handleGeo, parseStreet, parseZona, sameCity, sameName, zonaOf } from "./geo.js";

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
    expect(parseStreet([calisto], "Bar San Calisto")).toEqual({ street: "Piazza di San Calisto 3, Roma", label: "Bar San Calisto, Roma", hints: {} });
    expect(parseStreet([{ ...calisto, address: { city: "Roma" } }], "Bar San Calisto")).toBeNull();
    expect(parseStreet([{ ...calisto, category: "boundary" }], "Bar San Calisto")).toBeNull();
    expect(parseStreet([{ ...calisto, name: "Altro posto", display_name: "Altro posto, Roma" }], "Bar San Calisto")).toBeNull();
    expect(parseStreet([], "x")).toBeNull();
    expect(parseStreet([{ ...calisto, address: { road: "Via Garibaldi", city: "Torino" } }], "Bar San Calisto")).toMatchObject({ street: "Via Garibaldi, Torino" });
  });

  it("solo nella città cercata", () => {
    const spezia = { category: "amenity", name: "Controluce", display_name: "Controluce, La Spezia", address: { road: "Via del Prione", house_number: "1", city: "La Spezia" } };
    expect(parseStreet([spezia], "Controluce", "Roma")).toBeNull();
    expect(parseStreet([spezia], "Controluce", "La Spezia")).toMatchObject({ street: "Via del Prione 1, La Spezia" });
    expect(parseStreet([spezia], "Controluce", "")).not.toBeNull();
    expect(cityOf("Via dei Vascellari 29, 00153 Roma")).toBe("Roma");
    expect(cityOf("Roma")).toBe("Roma");
    expect(cityOf("Via dei Vascellari 29")).toBe("");
    expect(sameCity("Roma", { town: "Roma" })).toBe(true);
    expect(sameCity("Roma", { city: "Milano", county: "Città metropolitana di Milano" })).toBe(false);
  });

  it("si presenta a Nominatim e rispetta una richiesta al secondo", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => [calisto] }));
    const wait = vi.fn(async () => {});
    let t = 1_000_000;
    const now = () => t;
    const a = await handleGeo({ body: { place: { name: "Bar San Calisto", address: "Roma" } }, env, fetchImpl, now, wait });
    expect(a).toEqual({ status: 200, json: { query: "Bar San Calisto, Roma", found: { street: "Piazza di San Calisto 3, Roma", label: "Bar San Calisto, Roma" } } });
    expect(a.json.found.hints).toBeUndefined();
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://osm.test/search?q=Bar+San+Calisto%2C+Roma&format=jsonv2&limit=3&addressdetails=1&accept-language=it");
    expect(opts.headers["User-Agent"]).toMatch(/^second-brain\//);
    t += 300;
    await handleGeo({ body: { place: { name: "Mole" } }, env, fetchImpl, now, wait });
    expect(wait).toHaveBeenCalledWith(800);
  });

  it("quartiere: senza municipi; dal locale o, se non si trova, dalla via", async () => {
    expect(zonaOf({ suburb: "Trastevere", city_district: "Municipio Roma I" })).toBe("Trastevere");
    expect(zonaOf({ quarter: "Brera", suburb: "Municipio 1" })).toBe("Brera");
    expect(zonaOf({ suburb: "Municipio 1" })).toBe("");
    expect(zonaOf(null)).toBe("");
    expect(parseZona([{ address: { road: "x" } }, { address: { suburb: "Prati" } }])).toBe("Prati");
    expect(parseStreet([{ ...calisto, address: { ...calisto.address, suburb: "Trastevere" } }], "Bar San Calisto")).toMatchObject({ zona: "Trastevere" });
    const fetchImpl = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (url.includes("Sconosciuto") ? [] : [{ category: "highway", address: { road: "Via dei Vascellari", suburb: "Trastevere" } }]) }));
    const wait = async () => {};
    const r = await handleGeo({ body: { place: { name: "Sconosciuto", address: "Via dei Vascellari 29, Roma" } }, env, fetchImpl, wait });
    expect(r.json.found).toEqual({ street: "", zona: "Trastevere" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toContain("q=Via+dei+Vascellari+29%2C+Roma");
    // Solo la città: nessuna seconda ricerca.
    fetchImpl.mockClear();
    expect((await handleGeo({ body: { place: { name: "Sconosciuto", address: "Roma" } }, env, fetchImpl, wait })).json.found).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("con l'AI il quartiere è il nome comune dato dalla via, non la zona di OpenStreetMap", async () => {
    const giudiziaria = { category: "amenity", name: "Sakaba", display_name: "Sakaba, Roma", address: { road: "Via Emilio Faà di Bruno", house_number: "31", quarter: "Città giudiziaria", suburb: "Della Vittoria", city: "Roma" } };
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => [giudiziaria] }));
    let prompt = "";
    const aiFetch = vi.fn(async (url, opts) => {
      prompt = JSON.parse(opts.body).contents[0].parts[0].text;
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ quartiere: "Prati" }) }] } }] }) };
    });
    const r = await handleGeo({ body: { place: { name: "Sakaba", address: "Roma" } }, env: { ...env, GEMINI_API_KEY: "k", GEMINI_API_BASE: "https://ai.test" }, fetchImpl, aiFetch, wait: async () => {} });
    expect(r.json.found).toMatchObject({ street: "Via Emilio Faà di Bruno 31, Roma", zona: "Prati" });
    expect(prompt).toContain("Via Emilio Faà di Bruno 31, Roma");
    expect(prompt).toContain("Città giudiziaria");
    // Una risposta amministrativa non vale.
    aiFetch.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ quartiere: "Municipio I" }) }] } }] }) }));
    const r2 = await handleGeo({ body: { place: { name: "Sakaba", address: "Roma" } }, env: { ...env, GEMINI_API_KEY: "k", GEMINI_API_BASE: "https://ai.test" }, fetchImpl, aiFetch, wait: async () => {} });
    expect(r2.json.found.zona).toBe("");
    // Senza via, all'AI non si chiede nulla.
    aiFetch.mockClear();
    const none = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }));
    await handleGeo({ body: { place: { name: "Elio", address: "Roma" } }, env: { ...env, GEMINI_API_KEY: "k", GEMINI_API_BASE: "https://ai.test" }, fetchImpl: none, aiFetch, wait: async () => {} });
    expect(aiFetch).not.toHaveBeenCalled();
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
