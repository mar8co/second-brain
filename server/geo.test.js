import { describe, expect, it, vi } from "vitest";
import { addressFromMapsName, cityOf, geocodeQuery, handleGeo, paeseOf, streetOfAddress, parseStreet, parseZona, sameCity, sameName, zonaOf } from "./geo.js";

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
    expect(url).toBe("https://osm.test/search?q=Bar+San+Calisto%2C+Roma&limit=3&format=jsonv2&addressdetails=1&accept-language=it");
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
    // Con una via data (scritta a mano o letta dall'AI) il quartiere viene da quella, non dalla via trovata.
    aiFetch.mockImplementation(async (url, opts) => {
      prompt = JSON.parse(opts.body).contents[0].parts[0].text;
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ quartiere: "Monti" }) }] } }] }) };
    });
    const r3 = await handleGeo({ body: { place: { name: "Sakaba", address: "Via Panisperna 10, Roma" } }, env: { ...env, GEMINI_API_KEY: "k", GEMINI_API_BASE: "https://ai.test" }, fetchImpl, aiFetch, wait: async () => {} });
    expect(r3.json.found.zona).toBe("Monti");
    expect(prompt).toContain("Via Panisperna 10, Roma");
    expect(prompt).not.toContain("Faà di Bruno 31");
    // Senza via, all'AI si chiede solo il paese: il quartiere che dà non vale.
    aiFetch.mockClear();
    aiFetch.mockImplementation(async (url, opts) => {
      prompt = JSON.parse(opts.body).contents[0].parts[0].text;
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ quartiere: "Monti", paese: "italia" }) }] } }] }) };
    });
    const none = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }));
    const r4 = await handleGeo({ body: { place: { name: "Elio", address: "Roma" } }, env: { ...env, GEMINI_API_KEY: "k", GEMINI_API_BASE: "https://ai.test" }, fetchImpl: none, aiFetch, wait: async () => {} });
    expect(r4.json.found).toEqual({ street: "", paese: "Italia" });
    // Senza via né città, all'AI non si chiede nulla.
    aiFetch.mockClear();
    await handleGeo({ body: { place: { name: "Elio", address: "" } }, env: { ...env, GEMINI_API_KEY: "k", GEMINI_API_BASE: "https://ai.test" }, fetchImpl: none, aiFetch, wait: async () => {} });
    expect(aiFetch).not.toHaveBeenCalled();
  });

  it("paese di un locale estero: dall'AI, o dal codice di OpenStreetMap", async () => {
    expect(paeseOf({ country_code: "pt" })).toBe("Portogallo");
    expect(paeseOf({ country_code: "it" })).toBe("Italia");
    expect(paeseOf({})).toBe("");
    const baia = { category: "amenity", name: "Restaurante Baia Do Bago", display_name: "Baia Do Bago", address: { road: "Estrada Regional 101", village: "Porto da Cruz", county: "Machico", country_code: "pt" } };
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => [baia] }));
    const r = await handleGeo({ body: { place: { name: "Restaurante Baia Do Bago", address: "Porto da Cruz" } }, env, fetchImpl, wait: async () => {} });
    expect(r.json.found).toMatchObject({ street: "Estrada Regional 101, Porto da Cruz", paese: "Portogallo" });
    const none = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }));
    const aiFetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ quartiere: "", paese: "Portogallo" }) }] } }] }) }));
    const r2 = await handleGeo({ body: { place: { name: "Restaurante Baia Do Bago", address: "Porto da Cruz, Madeira" } }, env: { ...env, GEMINI_API_KEY: "k", GEMINI_API_BASE: "https://ai.test" }, fetchImpl: none, aiFetch, wait: async () => {} });
    expect(r2.json.found).toEqual({ street: "", paese: "Portogallo" });
  });

  it("se l'AI non risponde: quartiere di OpenStreetMap dalla via, e si riprova dopo", async () => {
    const fetchImpl = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (url.includes("Casamora") ? [] : [{ category: "highway", address: { road: "Via di Monte Testaccio", suburb: "Testaccio" } }]) }));
    const aiFetch = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "quota" } }), text: async () => "quota" }));
    const ai = { ...env, GEMINI_API_KEY: "k", GEMINI_API_BASE: "https://ai.test" };
    const r = await handleGeo({ body: { place: { name: "Casamora", address: "Via di Monte Testaccio 65b, Roma" } }, env: ai, fetchImpl, aiFetch, wait: async () => {} });
    expect(r.json.found).toEqual({ street: "", zona: "Testaccio", riprova: true });
    // L'AI risponde: niente riprova.
    aiFetch.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ quartiere: "Testaccio", paese: "Italia" }) }] } }] }) }));
    const r2 = await handleGeo({ body: { place: { name: "Casamora", address: "Via di Monte Testaccio 65b, Roma" } }, env: ai, fetchImpl, aiFetch, wait: async () => {} });
    expect(r2.json.found).toEqual({ street: "", zona: "Testaccio", paese: "Italia" });
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

describe("via dal link di Google Maps", () => {
  const wait = async () => {};
  const json = (data) => ({ ok: true, status: 200, json: async () => data });
  const trastevere = { road: "Piazza di Santa Maria Liberatrice", house_number: "44", suburb: "Testaccio", city: "Roma" };

  it("legge l'indirizzo scritto nel nome del posto", () => {
    expect(addressFromMapsName("Pizzeria Da Remo, Piazza di Santa Maria Liberatrice, 44, 00153 Roma RM, Italia")).toBe("Piazza di Santa Maria Liberatrice 44, Roma");
    expect(addressFromMapsName("Elio, Via Ostiense 12, 00154 Roma RM")).toBe("Via Ostiense 12, Roma");
    expect(addressFromMapsName("Elio")).toBe("");
    expect(addressFromMapsName("Via Ostiense")).toBe("");
    expect(streetOfAddress(trastevere)).toBe("Piazza di Santa Maria Liberatrice 44, Roma");
    expect(streetOfAddress({ city: "Roma" })).toBe("");
  });

  it("con l'indirizzo nel link non serve aprire il link", async () => {
    const linkFetch = vi.fn();
    const fetchImpl = vi.fn(async () => json({ address: trastevere }));
    const link = "https://www.google.com/maps/place/Pizzeria+Da+Remo,+Piazza+di+Santa+Maria+Liberatrice,+44,+00153+Roma+RM/@41.879,12.47,17z/data=!3d41.8791!4d12.4762";
    const r = await handleGeo({ body: { link, place: { name: "Remo", address: "Roma" } }, env, fetchImpl, linkFetch, wait });
    expect(linkFetch).not.toHaveBeenCalled();
    expect(r.json.found).toEqual({ street: "Piazza di Santa Maria Liberatrice 44, Roma", zona: "Testaccio", lat: 41.8791, lng: 12.4762 });
    expect(fetchImpl.mock.calls[0][0]).toMatch(/^https:\/\/osm\.test\/reverse\?lat=41\.8791&lon=12\.4762&zoom=18&/);
  });

  it("link corto: si seguono i reindirizzamenti e la via viene dalle coordinate (OpenStreetMap)", async () => {
    const linkFetch = vi.fn(async () => ({ redirects: ["https://www.google.com/maps/place/Elio/@41.9,12.5,17z/data=!3d41.9012!4d12.5021"], finalUrl: "https://consent.google.com/x" }));
    const fetchImpl = vi.fn(async () => json({ address: { road: "Via dei Volsci", house_number: "7", suburb: "San Lorenzo", city: "Roma" } }));
    const r = await handleGeo({ body: { link: "https://maps.app.goo.gl/abc123", place: { name: "Elio", address: "Roma" } }, env, fetchImpl, linkFetch, wait });
    expect(r.json.found).toEqual({ street: "Via dei Volsci 7, Roma", zona: "San Lorenzo", lat: 41.9012, lng: 12.5021 });
  });

  it("pagina del consenso di Google: il posto si legge da ?continue=", async () => {
    const dentro = encodeURIComponent("https://www.google.com/maps/place/Elio/@41.9,12.5,17z/data=!3d41.9012!4d12.5021");
    const linkFetch = vi.fn(async () => ({ redirects: [`https://consent.google.com/m?continue=${dentro}&gl=IT`], finalUrl: `https://consent.google.com/m?continue=${dentro}&gl=IT` }));
    const fetchImpl = vi.fn(async () => json({ address: { road: "Via dei Volsci", house_number: "7", city: "Roma" } }));
    const r = await handleGeo({ body: { link: "https://maps.app.goo.gl/abc123", place: { name: "Elio" } }, env, fetchImpl, linkFetch, wait });
    expect(r.json.found).toMatchObject({ street: "Via dei Volsci 7, Roma", lat: 41.9012 });
  });

  it("con l'AI il quartiere è il nome comune dato dalla via", async () => {
    const linkFetch = vi.fn(async () => ({ redirects: ["https://www.google.com/maps/place/Elio/@41.9,12.5,17z/data=!3d41.9012!4d12.5021"], finalUrl: "x" }));
    const fetchImpl = vi.fn(async () => json({ address: { road: "Via dei Volsci", house_number: "7", quarter: "Tiburtino", city: "Roma" } }));
    const aiFetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ quartiere: "San Lorenzo" }) }] } }] }) }));
    const r = await handleGeo({ body: { link: "https://maps.app.goo.gl/abc123", place: { name: "Elio" } }, env: { ...env, GEMINI_API_KEY: "k", GEMINI_API_BASE: "https://ai.test" }, fetchImpl, aiFetch, linkFetch, wait });
    expect(r.json.found.zona).toBe("San Lorenzo");
  });

  it("link share.google con solo il nome: si cerca il locale per nome", async () => {
    const linkFetch = vi.fn(async () => ({ redirects: ["https://www.google.com/search?q=Elio&kgmid=/g/1"], finalUrl: "https://www.google.com/search?q=Elio&kgmid=/g/1" }));
    const fetchImpl = vi.fn(async () => json([{ category: "amenity", name: "Elio", display_name: "Elio, Roma", address: { road: "Via dei Volsci", house_number: "7", city: "Roma" } }]));
    const r = await handleGeo({ body: { link: "https://share.google/xyz", place: { name: "Elio", address: "Roma" } }, env, fetchImpl, linkFetch, wait });
    expect(r.json.found.street).toBe("Via dei Volsci 7, Roma");
  });

  it("niente via o link che non è di Maps", async () => {
    const linkFetch = vi.fn(async () => ({ redirects: [], finalUrl: "https://www.google.com/" }));
    const none = vi.fn(async () => json([]));
    const r = await handleGeo({ body: { link: "https://share.google/xyz", place: { name: "Elio", address: "Roma" } }, env, fetchImpl: none, linkFetch, wait });
    expect(r.json).toEqual({ found: null, error: "Non ho trovato la via in questo link." });
    expect((await handleGeo({ body: { link: "https://example.com/x", place: { name: "Elio" } }, env, linkFetch, wait })).status).toBe(400);
  });
});
