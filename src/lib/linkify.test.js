import { describe, expect, it } from "vitest";
import { isLink, linkParts, LINK_SOURCE } from "./linkify.js";

const trova = (t) => t.match(new RegExp(LINK_SOURCE, "gi")) || [];

describe("linkify", () => {
  it("trova link con e senza protocollo", () => {
    expect(trova("vai su developer.apple.com/design.")).toEqual(["developer.apple.com/design."]);
    expect(trova("vedi https://example.com/a?b=1, poi www.sito.it")).toEqual(["https://example.com/a?b=1,", "www.sito.it"]);
  });
  it("non scambia nomi di file o numeri per link", () => {
    expect(trova("apri app.js e il valore 3.5 o v1.2")).toEqual([]);
  });
  it("toglie la punteggiatura finale dall'indirizzo", () => {
    expect(linkParts("developer.apple.com/design.")).toEqual({ url: "developer.apple.com/design", href: "https://developer.apple.com/design", rest: "." });
    expect(linkParts("https://x.org/a")).toEqual({ url: "https://x.org/a", href: "https://x.org/a", rest: "" });
  });
  it("isLink riconosce solo link interi", () => {
    expect(isLink("apple.com")).toBe(true);
    expect(isLink("ciao")).toBe(false);
  });
});
