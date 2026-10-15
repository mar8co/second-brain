import { describe, expect, it } from "vitest";

import { placeNameFromChain } from "./extract.js";
describe("nome del posto da link share.google", () => {
  it("legge la ricerca Google a cui rimanda", () => {
    expect(placeNameFromChain(["https://share.google/abc", "https://www.google.com/search?q=Mez%C3%A9+Bistrot+Prati&kgmid=/g/1"], null)).toBe("Mezé Bistrot Prati");
  });
  it("legge il titolo della pagina finale", () => {
    const page = { status: 200, contentType: "text/html", text: "<html><head><title>Mezé Bistrot Prati - Google Maps</title></head></html>" };
    expect(placeNameFromChain(["https://share.google/abc"], page)).toBe("Mezé Bistrot Prati");
  });
  it("ignora le pagine generiche", () => {
    const page = { status: 200, contentType: "text/html", text: "<title>Google</title>" };
    expect(placeNameFromChain(["https://share.google/abc"], page)).toBe(null);
  });
});
