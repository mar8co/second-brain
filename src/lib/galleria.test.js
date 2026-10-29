import { beforeEach, describe, expect, it } from "vitest";
import { posizioneInGalleria, rimettiNellaGalleria, setGalleria, togliDallaGalleria, vicini } from "./galleria.js";

describe("galleria", () => {
  beforeEach(() => setGalleria([]));

  it("dà precedente e successivo", () => {
    setGalleria(["a", "b", "c"]);
    expect(vicini("b")).toMatchObject({ prev: "a", next: "c" });
    expect(vicini("a")).toMatchObject({ prev: null, next: "b" });
    expect(vicini("c")).toMatchObject({ prev: "b", next: null });
  });

  it("un elemento fuori dall'elenco non ha vicini", () => {
    setGalleria(["a", "b"]);
    expect(vicini("z")).toMatchObject({ prev: null, next: null });
  });

  it("dopo un'eliminazione i vicini si ricalcolano", () => {
    setGalleria(["a", "b", "c"]);
    togliDallaGalleria("b");
    expect(vicini("a")).toMatchObject({ prev: null, next: "c" });
  });

  it("annullata l'eliminazione, l'elemento torna al suo posto", () => {
    setGalleria(["a", "b", "c"]);
    const at = posizioneInGalleria("b");
    togliDallaGalleria("b");
    rimettiNellaGalleria("b", at);
    expect(vicini("b")).toMatchObject({ prev: "a", next: "c", pos: 2, tot: 3 });
    // Fuori dall'elenco prima dell'eliminazione: resta fuori.
    rimettiNellaGalleria("z", posizioneInGalleria("z"));
    expect(vicini("z")).toMatchObject({ prev: null, next: null });
  });
});
