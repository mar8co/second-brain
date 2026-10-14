import { describe, expect, it } from "vitest";
import { eventsOf, formatEventDate, restaurantsOf, todayISO } from "./spots.js";

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
