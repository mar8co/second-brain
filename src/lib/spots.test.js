import { describe, expect, it } from "vitest";
import { carryStreets } from "./enrich.js";
import { filtraRighe, opzioniLocali, gruppiFermi, linkIn, queryOf, righeLocali, sedePatch, ZONA_V, DA_CONTROLLARE, SENZA_CITTA, SENZA_ZONA, cittaDi, gruppiLocali, tipoLocale, eventKey, eventsOf, formatEventDate, hasStreet, hideEventPatches, hideRestaurantPatches, manualStreetPatches, mapsUrl, restaurantsOf, streetPatch, streetQueue, todayISO } from "./spots.js";

const reel = {
  id: "r1",
  ai: {
    places: [
      { name: "Da Enzo al 29", address: "Via dei Vascellari 29, Roma", kind: "ristorante" },
      { name: "Museo Egizio", address: "Torino", kind: "altro" },
      { name: "Vecchio posto senza tipo", address: "" },
    ],
    events: [
      { name: "Workshop IA", date: "2026-11-05", end_date: "2026-11-06", place: "Milano" },
      { name: "Concerto di ieri", date: "2026-10-13", end_date: "", place: "" },
      { name: "Festa senza data", date: "", end_date: "", place: "" },
    ],
  },
};
const altro = {
  id: "r2",
  ai: {
    places: [{ name: "  da enzo AL 29 ", address: "", kind: "ristorante" }, { name: "Bar Sport", address: "Roma", kind: "ristorante" }],
    events: [{ name: "Workshop IA", date: "2026-11-05", end_date: "", place: "" }, { name: "Mostra lunga", date: "2026-10-01", end_date: "2026-10-10", place: "Roma" }],
  },
};

describe("Ristoranti", () => {
  it("solo i locali, in ordine alfabetico, con i link a tutti i contenuti", () => {
    const r = restaurantsOf([reel, altro, { id: "x" }, { id: "y", ai: { places: "rotto" } }]);
    expect(r.map((e) => e.name)).toEqual(["Bar Sport", "Da Enzo al 29"]);
    const enzo = r[1];
    expect(enzo.address).toBe("Via dei Vascellari 29, Roma");
    expect(enzo.items.map((i) => i.id)).toEqual(["r1", "r2"]);
  });

  it("le schede vecchie, senza tipo, non danno ristoranti", () => {
    expect(restaurantsOf([{ id: "v", ai: { v: 3, places: [{ name: "Da Enzo", address: "Roma" }] } }])).toEqual([]);
  });
});

describe("Eventi", () => {
  const today = "2026-10-14";
  it("prossimi per data, poi senza data, in fondo i passati dal più recente", () => {
    const e = eventsOf([reel, altro], today);
    expect(e.upcoming.map((x) => x.name)).toEqual(["Workshop IA"]);
    expect(e.undated.map((x) => x.name)).toEqual(["Festa senza data"]);
    expect(e.past.map((x) => x.name)).toEqual(["Concerto di ieri", "Mostra lunga"]);
  });

  it("lo stesso evento in due contenuti è uno solo, con due link e la fine se c'è", () => {
    const w = eventsOf([reel, altro], today).upcoming.find((x) => x.name === "Workshop IA");
    expect(w.items.map((i) => i.id)).toEqual(["r1", "r2"]);
    expect(w).toMatchObject({ date: "2026-11-05", end_date: "2026-11-06", place: "Milano" });
  });

  it("un evento in corso (l'ultimo giorno è oggi o dopo) non è passato", () => {
    const e = eventsOf([{ id: "a", ai: { events: [{ name: "Fiera", date: "2026-10-12", end_date: "2026-10-14", place: "" }, { name: "Oggi", date: "2026-10-14", end_date: "", place: "" }] } }], today);
    expect(e.upcoming.map((x) => x.name)).toEqual(["Fiera", "Oggi"]);
    expect(e.past).toEqual([]);
  });

  it("date e dati rotti non fanno danni", () => {
    const e = eventsOf([{ id: "a", ai: { events: [{ name: "X", date: "domani", end_date: "boh" }, null, { name: "" }] } }, { id: "b", ai: { events: "rotto" } }], today);
    expect(e.undated.map((x) => x.name)).toEqual(["X"]);
    expect(e.upcoming).toEqual([]);
  });

  it("data in italiano, con l'anno solo se non è quello di oggi", () => {
    expect(formatEventDate("2026-10-24", "", today)).toBe("sab 24 ott");
    expect(formatEventDate("2026-10-24", "2026-10-26", today)).toBe("sab 24 ott – lun 26 ott");
    expect(formatEventDate("2027-01-02", "", today)).toBe("sab 2 gen 2027");
  });

  it("oggi nel fuso del telefono", () => {
    expect(todayISO(new Date(2026, 9, 4, 23, 30))).toBe("2026-10-04");
  });
});

describe("mapsUrl", () => {
  it("cerca nome e indirizzo su Google Maps, senza chiavi", () => {
    expect(mapsUrl("Da Enzo", "Via dei Vascellari 29, Roma")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Da%20Enzo%2C%20Via%20dei%20Vascellari%2029%2C%20Roma",
    );
  });
  it("senza indirizzo cerca solo il nome", () => {
    expect(mapsUrl("Bar San Calisto", "")).toBe("https://www.google.com/maps/search/?api=1&query=Bar%20San%20Calisto");
  });
});

describe("hasStreet", () => {
  it("riconosce la via, il civico e non la sola città", () => {
    expect(hasStreet("Via dei Vascellari 29, Roma")).toBe(true);
    expect(hasStreet("Piazza di San Calisto, Roma")).toBe(true);
    expect(hasStreet("Trastevere 12, Roma")).toBe(true);
    expect(hasStreet("Roma")).toBe(false);
    expect(hasStreet("Roma 00184")).toBe(false);
    expect(hasStreet("")).toBe(false);
  });
});

describe("via dei locali", () => {
  const item = (id, places) => ({ id, ai: { v: 5, places } });
  it("mette in coda i locali senza via o con il quartiere di una versione precedente, una volta per locale", () => {
    const fatto = { geo_at: "2026-10-15T08:00:00Z", zona_at: "2026-10-28T08:00:00Z", zona_v: ZONA_V, paese: "Italia" };
    const q = streetQueue([
      item("a", [{ name: "Bar San Calisto", address: "Roma", kind: "ristorante" }, { name: "Da Enzo", address: "Via dei Vascellari 29, Roma", kind: "ristorante" }, { name: "Museo", address: "Roma", kind: "altro" }]),
      item("b", [
        { name: "bar san calisto", address: "Roma", kind: "ristorante" },
        { name: "Già cercato", address: "Roma", kind: "ristorante", ...fatto },
        { name: "Quartiere vecchio", address: "Via Y 2, Roma", kind: "ristorante", zona: "Città giudiziaria", zona_at: "2026-10-28T08:00:00Z" },
        { name: "Via trovata prima", address: "Roma", street: "Via X 1, La Spezia", kind: "ristorante", geo_at: "2026-10-15T08:00:00Z" },
        { name: "A mano", address: "Roma", street: "Via M 3, Roma", sedi: ["Via M 3, Roma"], manual: true, kind: "ristorante" },
      ]),
    ]);
    expect(q.map((x) => x.name)).toEqual(["Bar San Calisto", "Da Enzo", "Quartiere vecchio", "Via trovata prima", "A mano"]);
    expect(q[0].targets.map((t) => t.id)).toEqual(["a", "b"]);
    // Si ricerca con l'indirizzo dell'AI, non con la via trovata prima; con la via a mano se c'è.
    expect(q[3].address).toBe("Roma");
    expect(q[4].address).toBe("Via M 3, Roma");
  });

  it("dalla versione 2 si rifanno solo i locali con la via ma senza quartiere; se l'AI non ha risposto si riprova", () => {
    const v2 = { geo_at: "2026-10-28T08:00:00Z", zona_at: "2026-10-28T08:00:00Z", zona_v: 2, paese: "Italia" };
    const q = streetQueue([
      item("a", [
        { name: "Casamora", address: "Via di Monte Testaccio 65b, Roma", kind: "ristorante", ...v2 },
        { name: "Da Enzo", address: "Via dei Vascellari 29, Roma", kind: "ristorante", zona: "Trastevere", ...v2 },
        { name: "Elio", address: "Roma", kind: "ristorante", ...v2 },
      ]),
    ]);
    expect(q.map((x) => x.name)).toEqual(["Casamora"]);
    const at = new Date("2026-10-28T09:00:00Z");
    const casa = item("a", [{ name: "Casamora", address: "Via di Monte Testaccio 65b, Roma", kind: "ristorante", ...v2 }]);
    const p = streetPatch(casa, 0, "Casamora", { street: "", zona: "Testaccio", riprova: true }, at).ai.places[0];
    expect(p).toMatchObject({ zona: "Testaccio" });
    expect(p.zona_v).toBeUndefined();
    expect(streetQueue([{ id: "a", ai: { v: 5, places: [p] } }])).toHaveLength(1);
    const ok = streetPatch(casa, 0, "Casamora", { street: "", zona: "Testaccio" }, at).ai.places[0];
    expect(streetQueue([{ id: "a", ai: { v: 5, places: [ok] } }])).toHaveLength(0);
  });

  it("vie e quartieri: OpenStreetMap si sostituisce, a mano e AI restano", () => {
    const at = new Date("2026-10-28T08:00:00Z");
    const done = { geo_at: at.toISOString(), zona_at: at.toISOString(), zona_v: ZONA_V, paese: "" };
    const conVia = item("a", [{ name: "Da Enzo", address: "Via dei Vascellari 29, Roma", kind: "ristorante", zona: "Città giudiziaria" }]);
    expect(streetPatch(conVia, 0, "Da Enzo", { street: "Via Sbagliata 1, Roma", zona: "Trastevere" }, at).ai.places[0]).toEqual({ name: "Da Enzo", address: "Via dei Vascellari 29, Roma", kind: "ristorante", zona: "Trastevere", ...done });
    // Via di OpenStreetMap sbagliata (altra città): non si trova più, si toglie.
    const sbagliata = item("b", [{ name: "Controluce", address: "Roma", street: "Via X 1, La Spezia", geo_at: "2026-10-15T08:00:00Z", kind: "ristorante", zona: "Centro" }]);
    expect(streetPatch(sbagliata, 0, "Controluce", null, at).ai.places[0]).toEqual({ name: "Controluce", address: "Roma", kind: "ristorante", ...done });
    const manuale = item("c", [{ name: "Mazzo", address: "Roma", street: "Via degli Equi 62, Roma", manual: true, kind: "ristorante" }]);
    expect(streetPatch(manuale, 0, "Mazzo", { street: "Altra 1, Roma", zona: "San Lorenzo" }, at).ai.places[0]).toMatchObject({ street: "Via degli Equi 62, Roma", zona: "San Lorenzo" });
  });

  it("salva la via trovata, o solo che è già stato cercato", () => {
    const it0 = item("a", [{ name: "Bar San Calisto", address: "Roma", kind: "ristorante" }]);
    const at = new Date("2026-10-15T08:00:00Z");
    const ok = streetPatch(it0, 0, "Bar San Calisto", { street: "Piazza di San Calisto 3, Roma" }, at);
    expect(ok.ai.places[0]).toMatchObject({ street: "Piazza di San Calisto 3, Roma", geo_at: "2026-10-15T08:00:00.000Z" });
    const none = streetPatch(it0, 0, "Bar San Calisto", null, at);
    expect(none.ai.places[0].street).toBeUndefined();
    expect(none.ai.places[0].geo_at).toBeDefined();
    // La scheda è cambiata nel frattempo: niente da salvare.
    expect(streetPatch(it0, 0, "Altro", { street: "x" }, at)).toBeNull();
  });

  it("l'elenco dei ristoranti usa la via trovata", () => {
    const r = restaurantsOf([item("a", [{ name: "Bar San Calisto", address: "Roma", street: "Piazza di San Calisto 3, Roma", kind: "ristorante" }])]);
    expect(r[0].address).toBe("Piazza di San Calisto 3, Roma");
  });
});

describe("via scritta a mano", () => {
  const c2 = () => ({ id: "z", ai: { v: 5, places: [{ name: "Da Enzo", address: "Roma", kind: "ristorante" }] } });
  const a = { id: "a", ai: { v: 5, places: [{ name: "Da Enzo", address: "Roma", kind: "ristorante" }, { name: "Museo", address: "Roma", kind: "altro" }] } };
  const b = { id: "b", ai: { v: 5, places: [{ name: "da  enzo", address: "Roma", kind: "ristorante", street: "Via vecchia 1, Roma", geo_at: "2026-10-14T00:00:00Z" }] } };
  const c = { id: "c", ai: { v: 5, places: [{ name: "Altro", address: "Roma", kind: "ristorante" }] } };
  const NOW = new Date("2026-10-15T08:00:00Z");

  it("si salva in ogni contenuto che cita il locale e vale più di quella trovata", () => {
    const patches = manualStreetPatches([a, b, c], "Da Enzo", "  Via Prova   5, Roma ", NOW);
    expect(patches.map((p) => p.id)).toEqual(["a", "b"]);
    expect(patches[0].patch.ai.places[0]).toMatchObject({ street: "Via Prova 5, Roma", sedi: ["Via Prova 5, Roma"], manual: true, geo_at: NOW.toISOString() });
    expect(patches[0].patch.ai.places[1]).toEqual(a.ai.places[1]);
    expect(patches[1].patch.ai.places[0].street).toBe("Via Prova 5, Roma");
    const after = { ...a, ai: patches[0].patch.ai };
    expect(restaurantsOf([after])[0]).toMatchObject({ address: "Via Prova 5, Roma", streets: ["Via Prova 5, Roma"], manual: true });
    // La via a mano non si cerca più; si cerca una volta il suo quartiere.
    expect(streetQueue([after]).map((x) => x.address)).toEqual(["Via Prova 5, Roma"]);
  });

  it("più sedi: tutte salvate, senza doppioni, e mostrate tutte", () => {
    const [p] = manualStreetPatches([a], "Da Enzo", ["Via A 1, Roma", " ", "Via B 2, Milano", "Via A 1, Roma"], NOW);
    expect(p.patch.ai.places[0]).toMatchObject({ street: "Via A 1, Roma", sedi: ["Via A 1, Roma", "Via B 2, Milano"], manual: true });
    const r = restaurantsOf([{ ...a, ai: p.patch.ai }])[0];
    expect(r.addresses).toEqual(["Via A 1, Roma", "Via B 2, Milano"]);
    expect(r.streets).toEqual(r.addresses);
  });

  it("a mano vince anche se un altro contenuto cita il locale con la sola città", () => {
    const manuale = { ...a, ai: manualStreetPatches([a], "Da Enzo", "Via A 1, Roma", NOW)[0].patch.ai };
    const r = restaurantsOf([c2(), manuale])[0];
    expect(r.manual).toBe(true);
    expect(r.streets).toEqual(["Via A 1, Roma"]);
    // Una sede scritta a mano senza numero civico conta comunque come via.
    const libera = { ...a, ai: manualStreetPatches([a], "Da Enzo", "Zona Pigneto", NOW)[0].patch.ai };
    expect(restaurantsOf([libera])[0].streets).toEqual(["Zona Pigneto"]);
    // Senza sedi a mano, una città sola non è una via.
    expect(restaurantsOf([a])[0].streets).toEqual([]);
  });

  it("vuota, toglie la via e il locale torna a essere cercato", () => {
    const [p] = manualStreetPatches([b], "Da Enzo", "  ", NOW);
    expect(p.patch.ai.places[0]).toEqual({ name: "da  enzo", address: "Roma", kind: "ristorante" });
    expect(restaurantsOf([{ ...b, ai: p.patch.ai }])[0]).toMatchObject({ addresses: ["Roma"], streets: [] });
  });

  it("resta quando l'AI rifà la scheda; un locale a mano che l'AI non cita più si tiene", () => {
    const manual = [{ name: "Da Enzo", address: "Roma", kind: "ristorante", street: "Via Prova 5, Roma", manual: true, geo_at: "x", zona: "Trastevere", zona_at: "y" }, { name: "Sparito", address: "", kind: "ristorante", street: "Via X 1, Roma", manual: true }];
    const next = carryStreets([{ name: "da enzo", address: "Roma", kind: "ristorante", tipo: "trattoria" }, { name: "Museo", address: "", kind: "altro" }], manual);
    expect(next[0]).toMatchObject({ street: "Via Prova 5, Roma", manual: true, geo_at: "x", zona: "Trastevere", zona_at: "y", tipo: "trattoria" });
    expect(next[1].name).toBe("Museo");
    // Ha un tipo (vuoto), così non fa rileggere il contenuto all'infinito.
    expect(next[2]).toMatchObject({ name: "Sparito", tipo: "" });
    // Un locale nuovo, senza via già nota, resta com'è.
    expect(carryStreets([{ name: "Nuovo", kind: "ristorante" }], manual)[0]).toEqual({ name: "Nuovo", kind: "ristorante" });
  });
});

import { docsOf, photosOf } from "./spots.js";
describe("photosOf e docsOf", () => {
  const items = [
    { id: 1, file_path: "a", file_mime: "image/jpeg" },
    { id: 2, file_path: "b", file_mime: "video/mp4" },
    { id: 3, file_path: "c", file_mime: "application/pdf" },
    { id: 4, image_url: "https://x/y.jpg" },
  ];
  it("foto e video", () => expect(photosOf(items).map((i) => i.id)).toEqual([1, 2]));
  it("documenti", () => expect(docsOf(items).map((i) => i.id)).toEqual([3]));
});

describe("hideRestaurantPatches", () => {
  const mk = (id, name) => ({ id, ai: { v: 5, places: [{ name, address: "Roma", kind: "ristorante" }, { name: "Museo", kind: "altro" }] } });

  it("toglie il locale dalla lista in ogni contenuto che lo cita e lo rimette", () => {
    const items = [mk("a", "Da Enzo"), mk("b", "da enzo"), mk("c", "Altro")];
    const patches = hideRestaurantPatches(items, "Da Enzo");
    expect(patches.map((p) => p.id)).toEqual(["a", "b"]);
    const after = items.map((it) => ({ ...it, ai: patches.find((p) => p.id === it.id)?.patch.ai || it.ai }));
    expect(restaurantsOf(after).map((r) => r.name)).toEqual(["Altro"]);
    const back = hideRestaurantPatches(after, "Da Enzo", false);
    const restored = after.map((it) => ({ ...it, ai: back.find((p) => p.id === it.id)?.patch.ai || it.ai }));
    expect(restaurantsOf(restored).map((r) => r.name)).toEqual(["Altro", "Da Enzo"]);
  });

  it("resta nascosto quando l'AI rifà la scheda", () => {
    const [p] = hideRestaurantPatches([mk("a", "Da Enzo")], "Da Enzo");
    const next = carryStreets([{ name: "Da Enzo", address: "Roma", kind: "ristorante" }], p.patch.ai.places);
    expect(next[0].hidden).toBe(true);
  });
});

describe("hideEventPatches", () => {
  const items = [{ id: "a", ai: { events: [{ name: "Festa", date: "2030-05-01" }, { name: "Altra", date: "2030-06-01" }] } }];
  it("nasconde e rimette un evento, eventsOf lo salta", () => {
    const key = eventKey({ name: "Festa", date: "2030-05-01" });
    const [{ patch }] = hideEventPatches(items, key);
    const hidden = [{ id: "a", ai: patch.ai }];
    expect(eventsOf(hidden, "2030-01-01").upcoming.map((e) => e.name)).toEqual(["Altra"]);
    const [{ patch: back }] = hideEventPatches(hidden, key, false);
    expect(eventsOf([{ id: "a", ai: back.ai }], "2030-01-01").upcoming).toHaveLength(2);
  });
});

describe("ristoranti: ordine", () => {
  const rist = (id, name, created_at) => ({ id, created_at, ai: { v: 4, places: [{ name, address: "Roma", kind: "ristorante" }] } });
  const lista = [rist("1", "Alfa", "2026-01-01T10:00:00Z"), rist("2", "Zeta", "2026-01-03T10:00:00Z"), rist("3", "Mela", "2026-01-02T10:00:00Z")];
  it("predefinito: data di archiviazione, più recenti prima (non alfabetico)", () => {
    expect(restaurantsOf(lista).map((r) => r.name)).toEqual(["Zeta", "Mela", "Alfa"]);
  });
  it("meno recenti prima, e per nome", () => {
    expect(restaurantsOf(lista, "vecchi").map((r) => r.name)).toEqual(["Alfa", "Mela", "Zeta"]);
    expect(restaurantsOf(lista, "nome").map((r) => r.name)).toEqual(["Alfa", "Mela", "Zeta"]);
  });
});

describe("tipo e zona dei locali", () => {
  it("tipo dell'AI, altrimenti dal nome, altrimenti ristorante", () => {
    expect(tipoLocale({ name: "Da Enzo", tipo: "trattoria" })).toBe("trattoria");
    expect(tipoLocale({ name: "Pizzeria Ai Marmi", tipo: "" })).toBe("pizzeria");
    expect(tipoLocale({ name: "Bar San Calisto" })).toBe("bar");
    expect(tipoLocale({ name: "Gelateria del Teatro" })).toBe("dolci");
    expect(tipoLocale({ name: "Osteria Fernanda" })).toBe("trattoria");
    expect(tipoLocale({ name: "Mezé Bistrot", tipo: "sconosciuto" })).toBe("ristorante");
  });

  it("città dall'indirizzo", () => {
    expect(cittaDi("Via dei Vascellari 29, 00153 Roma")).toBe("Roma");
    expect(cittaDi("Roma")).toBe("Roma");
    expect(cittaDi("Via dei Vascellari 29")).toBe("");
    expect(cittaDi("")).toBe("");
  });

  it("gruppi per zona (quartiere, poi città, poi in fondo senza zona) e per tipo", () => {
    const places = [
      { name: "Da Enzo", address: "Via dei Vascellari 29, Roma", kind: "ristorante", tipo: "trattoria", zona: "Trastevere" },
      { name: "Bar San Calisto", address: "Roma", kind: "ristorante", zona: "Trastevere" },
      { name: "Luini", address: "Via Santa Radegonda 16, Milano", kind: "ristorante", tipo: "street" },
      { name: "Senza nulla", address: "", kind: "ristorante" },
    ];
    const r = restaurantsOf([{ id: "a", created_at: "2026-10-01", ai: { v: 5, places } }]);
    expect(r.find((x) => x.name === "Bar San Calisto")).toMatchObject({ tipo: "bar", zona: "Trastevere", citta: "Roma" });
    expect(gruppiLocali(r).map((g) => [g.label, g.list.length])).toEqual([["Milano", 1], ["Trastevere", 2], [SENZA_ZONA, 1]]);
    expect(gruppiLocali(r, "tipo").map((g) => g.label)).toEqual(["Bar e caffè", "Ristoranti", "Street food", "Trattorie"]);
    expect(gruppiLocali(r, "citta").map((g) => [g.label, g.list.length])).toEqual([["Milano", 1], ["Roma", 2], [SENZA_CITTA, 1]]);
    expect(gruppiLocali(r, "nome").map((g) => [g.label, g.list.map((x) => x.name)])).toEqual([["", ["Bar San Calisto", "Da Enzo", "Luini", "Senza nulla"]]]);
    expect(gruppiLocali([], "nome")).toEqual([]);
    const opz = opzioniLocali(r);
    expect(opz.tipi.map((t) => t[1])).toEqual(["Bar e caffè", "Ristorante", "Street food", "Trattoria"]);
    expect(opz.zone).toEqual([["Trastevere", 2]]);
    expect(opz.citta).toEqual([["Milano", 1], ["Roma", 2]]);
    const righe = righeLocali(r);
    expect(filtraRighe(righe, { zona: "Trastevere" }).map((x) => x.name).sort()).toEqual(["Bar San Calisto", "Da Enzo"]);
    expect(filtraRighe(righe, { tipo: "street", citta: "Roma" })).toEqual([]);
    expect(filtraRighe(righe)).toHaveLength(4);
  });

  it("i locali esteri vanno in fondo, per paese, prima di Senza quartiere e Via da controllare", () => {
    const places = [
      { name: "Da Enzo", address: "Via dei Vascellari 29, Roma", kind: "ristorante", zona: "Trastevere", paese: "Italia" },
      { name: "Baia Do Bago", address: "Porto da Cruz, Madeira", street: "Estrada Regional 101, Porto da Cruz", kind: "ristorante", paese: "Portogallo", geo_at: "x" },
      { name: "La Torrada", address: "Lázaro Cardenas 2500, San Pedro Garza García, México", kind: "ristorante", zona: "Valle Oriente", paese: "Messico" },
      { name: "Senza nulla", address: "", kind: "ristorante" },
      { name: "Introvabile", address: "Roma", kind: "ristorante", geo_at: "x", paese: "Italia" },
      { name: "Luini", address: "Via Santa Radegonda 16, Milano", kind: "ristorante", zona: "Duomo" },
    ];
    const r = restaurantsOf([{ id: "a", created_at: "2026-10-01", ai: { v: 5, places } }]);
    expect(gruppiLocali(r).map((g) => g.label)).toEqual(["Duomo", "Trastevere", "Messico", "Portogallo", SENZA_ZONA, DA_CONTROLLARE]);
    expect(gruppiLocali(r, "citta").map((g) => g.label).slice(0, 2)).toEqual(["Milano", "Roma"]);
    expect(gruppiLocali(r, "citta").at(-1).label).toBe(SENZA_CITTA);
    // Paese mai cercato: il locale va in coda (una volta); "" = cercato.
    expect(streetQueue([{ id: "a", ai: { v: 5, places: [{ name: "Luini", address: "Via Santa Radegonda 16, Milano", kind: "ristorante", zona: "Duomo", zona_v: ZONA_V, geo_at: "x" }] } }])).toHaveLength(1);
    expect(streetQueue([{ id: "a", ai: { v: 5, places: [{ name: "Luini", address: "Via Santa Radegonda 16, Milano", kind: "ristorante", zona: "Duomo", zona_v: ZONA_V, geo_at: "x", paese: "" }] } }])).toHaveLength(0);
    const item = { id: "a", ai: { v: 5, places: [{ name: "Baia", address: "Porto da Cruz", kind: "ristorante" }] } };
    expect(streetPatch(item, 0, "Baia", { street: "", paese: "Portogallo" }).ai.places[0].paese).toBe("Portogallo");
    expect(streetPatch(item, 0, "Baia", { street: "", riprova: true }).ai.places[0].paese).toBeUndefined();
  });

  it("per zona, in fondo i locali senza via già cercati su OpenStreetMap", () => {
    const places = [
      { name: "Da Enzo", address: "Via dei Vascellari 29, Roma", kind: "ristorante", zona: "Trastevere" },
      { name: "Introvabile", address: "Roma", kind: "ristorante", geo_at: "2026-10-28T08:00:00Z" },
      { name: "Ancora da cercare", address: "Roma", kind: "ristorante" },
    ];
    const r = restaurantsOf([{ id: "a", created_at: "2026-10-01", ai: { v: 5, places } }]);
    const g = gruppiLocali(r);
    expect(g.map((x) => [x.label, x.list.map((l) => l.name)])).toEqual([["Roma", ["Ancora da cercare"]], ["Trastevere", ["Da Enzo"]], [DA_CONTROLLARE, ["Introvabile"]]]);
    expect(g[2].controllare).toBe(true);
    expect(gruppiLocali(r, "tipo").some((x) => x.controllare)).toBe(false);
  });
});

describe("queryOf", () => {
  it("cerca con la via scritta a mano, altrimenti con l'indirizzo dell'AI", () => {
    const it0 = { ai: { places: [{ name: "A", address: "Roma", manual: true, sedi: ["Via Uno 1, Roma", "Via Due 2, Milano"] }, { name: "B", address: "Roma", street: "Via Osm 3" }] } };
    expect(queryOf(it0, 0)).toBe("Via Uno 1, Roma");
    expect(queryOf(it0, 1)).toBe("Roma");
    expect(queryOf({}, 0)).toBe("");
  });
});

describe("gruppiFermi", () => {
  it("tiene i gruppi com'erano, con i dati nuovi; i locali nuovi nel loro gruppo, se c'è", () => {
    const a = { key: "a", name: "A", zona: "Roma" };
    const b = { key: "b", name: "B" };
    const fermi = [{ key: "trastevere", label: "Trastevere", list: ["a", "b"] }];
    const nuovi = [
      { key: "roma", label: "Roma", list: [a] },
      { key: "trastevere", label: "Trastevere", list: [b, { key: "c", name: "C" }] },
      { key: "milano", label: "Milano", list: [{ key: "d", name: "D" }] },
    ];
    expect(gruppiFermi(fermi, nuovi)).toEqual([{ key: "trastevere", label: "Trastevere", list: [a, b, { key: "c", name: "C" }] }]);
  });
});

describe("linkIn", () => {
  it("trova il link anche attaccato al nome copiato da Condividi", () => {
    expect(linkIn("https://maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(linkIn("Bar San Calistohttps://maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(linkIn("Bar San Calisto https://maps.app.goo.gl/abc?g_st=ic")).toMatch(/^https:\/\/maps\.app\.goo\.gl\/abc/);
    expect(linkIn("Via Ostiense 12, Roma")).toBeNull();
  });
});

describe("locali con più sedi", () => {
  const item = {
    id: "a",
    created_at: "2026-10-01",
    ai: { places: [{ name: "Mazzo", address: "Roma", kind: "ristorante", tipo: "trattoria", manual: true, street: "Via degli Equi 62, Roma", sedi: ["Via degli Equi 62, Roma", "Via Gola 4, Milano"], zona: "San Lorenzo", zona_v: ZONA_V, paese: "Italia", geo_at: "x" }] },
  };

  it("ogni sede in più si cerca una volta, per il suo quartiere", () => {
    expect(streetQueue([item])).toEqual([{ name: "Mazzo", address: "Via Gola 4, Milano", sede: "Via Gola 4, Milano", targets: [{ id: "a", index: 0, name: "Mazzo", sede: "Via Gola 4, Milano" }] }]);
    const p = sedePatch(item, 0, "Mazzo", "Via Gola 4, Milano", { zona: "Navigli" });
    expect(p.ai.places[0].zone_sedi).toEqual({ "Via Gola 4, Milano": "Navigli" });
    expect(streetQueue([{ ...item, ...p }])).toEqual([]);
    // Non trovato: segnato come cercato.
    expect(sedePatch(item, 0, "Mazzo", "Via Gola 4, Milano", null).ai.places[0].zone_sedi).toEqual({ "Via Gola 4, Milano": "" });
    // Sede tolta nel frattempo: non si scrive nulla.
    expect(sedePatch(item, 0, "Mazzo", "Via Altra 1, Milano", { zona: "x" })).toBeNull();
  });

  it("una riga per sede, ognuna con la sua via, il suo quartiere e la sua città", () => {
    const withZone = { ...item, ai: { places: [{ ...item.ai.places[0], zone_sedi: { "Via Gola 4, Milano": "Navigli" } }] } };
    const righe = righeLocali(restaurantsOf([withZone]));
    expect(righe.map((r) => [r.key, r.streets, r.zona, r.citta, r.sede])).toEqual([
      ["mazzo#0", ["Via degli Equi 62, Roma"], "San Lorenzo", "Roma", "Via degli Equi 62, Roma"],
      ["mazzo#1", ["Via Gola 4, Milano"], "Navigli", "Milano", "Via Gola 4, Milano"],
    ]);
    expect(righe[1].tutte).toEqual(["Via degli Equi 62, Roma", "Via Gola 4, Milano"]);
    expect(gruppiLocali(righe).map((g) => g.label)).toEqual(["Navigli", "San Lorenzo"]);
    // Una sola sede: una riga sola, senza "sede".
    const una = righeLocali(restaurantsOf([{ id: "b", created_at: "2026-10-01", ai: { places: [{ name: "Enzo", address: "Via dei Vascellari 29, Roma", kind: "ristorante" }] } }]));
    expect(una.map((r) => [r.key, r.sede, r.tutte])).toEqual([["enzo", undefined, ["Via dei Vascellari 29, Roma"]]]);
  });
});

import { resetGeoPatches as _rg } from "./spots.js";
it("resetGeoPatches toglie quartiere e via trovata, tiene quella manuale", () => {
  const items = [{ id: 1, ai: { places: [{ kind: "ristorante", name: "Tullia", street: "X", geo_at: "t", zona: "Roma", zona_v: 3, paese: "Italia" }, { kind: "ristorante", name: "Altro", zona: "Prati" }] } }, { id: 2, ai: { places: [{ kind: "ristorante", name: "tullia", manual: true, street: "Via Cicerone 55A, Roma", geo_at: "t", zona_v: 3 }] } }];
  const out = _rg(items, "Tullia");
  expect(out[0].patch.ai.places[0]).toEqual({ kind: "ristorante", name: "Tullia" });
  expect(out[0].patch.ai.places[1].zona).toBe("Prati");
  expect(out[1].patch.ai.places[0]).toEqual({ kind: "ristorante", name: "tullia", manual: true, street: "Via Cicerone 55A, Roma", geo_at: "t" });
});
