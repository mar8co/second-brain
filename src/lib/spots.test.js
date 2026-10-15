import { describe, expect, it } from "vitest";
import { carryStreets } from "./enrich.js";
import { eventsOf, formatEventDate, hasStreet, manualStreetPatches, mapsUrl, restaurantsOf, streetPatch, streetQueue, todayISO } from "./spots.js";

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
  it("mette in coda solo i locali con la sola città, una volta per locale", () => {
    const q = streetQueue([
      item("a", [{ name: "Bar San Calisto", address: "Roma", kind: "ristorante" }, { name: "Da Enzo", address: "Via dei Vascellari 29, Roma", kind: "ristorante" }, { name: "Museo", address: "Roma", kind: "altro" }]),
      item("b", [{ name: "bar san calisto", address: "Roma", kind: "ristorante" }, { name: "Già cercato", address: "Roma", kind: "ristorante", geo_at: "2026-10-15T08:00:00Z" }, { name: "Con via", address: "Roma", street: "Via X 1, Roma", kind: "ristorante" }]),
    ]);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ name: "Bar San Calisto", address: "Roma" });
    expect(q[0].targets.map((t) => t.id)).toEqual(["a", "b"]);
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
  const a = { id: "a", ai: { v: 5, places: [{ name: "Da Enzo", address: "Roma", kind: "ristorante" }, { name: "Museo", address: "Roma", kind: "altro" }] } };
  const b = { id: "b", ai: { v: 5, places: [{ name: "da  enzo", address: "Roma", kind: "ristorante", street: "Via vecchia 1, Roma", geo_at: "2026-10-14T00:00:00Z" }] } };
  const c = { id: "c", ai: { v: 5, places: [{ name: "Altro", address: "Roma", kind: "ristorante" }] } };
  const NOW = new Date("2026-10-15T08:00:00Z");

  it("si salva in ogni contenuto che cita il locale e vale più di quella trovata", () => {
    const patches = manualStreetPatches([a, b, c], "Da Enzo", "  Via Prova   5, Roma ", NOW);
    expect(patches.map((p) => p.id)).toEqual(["a", "b"]);
    expect(patches[0].patch.ai.places[0]).toMatchObject({ street: "Via Prova 5, Roma", manual: true, geo_at: NOW.toISOString() });
    expect(patches[0].patch.ai.places[1]).toEqual(a.ai.places[1]);
    expect(patches[1].patch.ai.places[0].street).toBe("Via Prova 5, Roma");
    const after = { ...a, ai: patches[0].patch.ai };
    expect(restaurantsOf([after])[0]).toMatchObject({ address: "Via Prova 5, Roma", manual: true });
    expect(streetQueue([after])).toEqual([]);
  });

  it("vuota, toglie la via e il locale torna a essere cercato", () => {
    const [p] = manualStreetPatches([b], "Da Enzo", "  ", NOW);
    expect(p.patch.ai.places[0]).toEqual({ name: "da  enzo", address: "Roma", kind: "ristorante" });
  });

  it("resta quando l'AI rifà la scheda; un locale a mano che l'AI non cita più si tiene", () => {
    const manual = [{ name: "Da Enzo", address: "Roma", kind: "ristorante", street: "Via Prova 5, Roma", manual: true, geo_at: "x" }, { name: "Sparito", address: "", kind: "ristorante", street: "Via X 1, Roma", manual: true }];
    const next = carryStreets([{ name: "da enzo", address: "Roma", kind: "ristorante" }, { name: "Museo", address: "", kind: "altro" }], manual);
    expect(next[0]).toMatchObject({ street: "Via Prova 5, Roma", manual: true, geo_at: "x" });
    expect(next[1].name).toBe("Museo");
    expect(next[2].name).toBe("Sparito");
    // Un locale nuovo, senza via già nota, resta com'è.
    expect(carryStreets([{ name: "Nuovo", kind: "ristorante" }], manual)[0]).toEqual({ name: "Nuovo", kind: "ristorante" });
  });
});
