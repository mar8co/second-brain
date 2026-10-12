import { describe, expect, it } from "vitest";
import { detectType, extractUrl, parsePlaceFromUrl } from "./detect.js";

describe("extractUrl", () => {
  it("estrae il link da un testo condiviso", () => {
    expect(extractUrl("Guarda questo reel! https://www.instagram.com/reel/C0abc/?igsh=xyz.")).toBe(
      "https://www.instagram.com/reel/C0abc/?igsh=xyz",
    );
  });
  it("aggiunge https ai domini senza schema", () => {
    expect(extractUrl("instagram.com/reel/abc")).toBe("https://instagram.com/reel/abc");
  });
  it("ignora testo senza link, email e schemi non http", () => {
    expect(extractUrl("ciao come stai")).toBeNull();
    expect(extractUrl("scrivi a mario@example.com")).toBeNull();
    expect(extractUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("detectType", () => {
  it.each([
    ["https://www.instagram.com/reel/abc/", "social"],
    ["https://vm.tiktok.com/xyz", "social"],
    ["https://youtu.be/dQw4w9WgXcQ", "video"],
    ["https://www.google.com/maps/place/Da+Michele/@40.8497,14.2632,17z", "place"],
    ["https://maps.app.goo.gl/AbC123", "place"],
    ["https://maps.apple.com/?q=Bar&ll=45.1,9.2", "place"],
    ["https://example.com/doc.pdf", "file"],
    ["https://blog.example.com/articolo", "link"],
    [null, "note"],
  ])("%s → %s", (url, type) => expect(detectType(url)).toBe(type));
});

describe("parsePlaceFromUrl", () => {
  it("legge nome e coordinate da Google Maps", () => {
    const p = parsePlaceFromUrl("https://www.google.com/maps/place/Antica+Pizzeria+da+Michele/@40.8497,14.2632,17z/data=!3d40.84971!4d14.26321");
    expect(p).toEqual({ name: "Antica Pizzeria da Michele", lat: 40.84971, lng: 14.26321 });
  });
  it("legge Apple Mappe", () => {
    expect(parsePlaceFromUrl("https://maps.apple.com/?q=Caff%C3%A8%20Florian&ll=45.4337,12.3381")).toEqual({
      name: "Caffè Florian",
      lat: 45.4337,
      lng: 12.3381,
    });
  });
  it("riconosce le coordinate nude", () => {
    expect(parsePlaceFromUrl("https://maps.google.com/?q=45.46,9.19")).toEqual({ name: null, lat: 45.46, lng: 9.19 });
  });
  it("null per link non di mappe o senza dati", () => {
    expect(parsePlaceFromUrl("https://example.com")).toBeNull();
    expect(parsePlaceFromUrl("https://maps.app.goo.gl/AbC")).toBeNull();
  });
});

describe("extractUrl: casi limite", () => {
  it("non scambia nomi di file per siti", () => {
    expect(extractUrl("ho letto doc.pdf ieri")).toBeNull();
    expect(extractUrl("vedi youtu.be/abc")).toBe("https://youtu.be/abc");
  });
});
