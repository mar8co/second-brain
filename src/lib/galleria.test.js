import { beforeEach, describe, expect, it } from "vitest";
import { setGalleria, togliDallaGalleria, vicini } from "./galleria.js";

describe("galleria", () => {
  beforeEach(() => setGalleria([]));

  it("dà precedente e successivo", () => {
    setGalleria(["a", "b", "c"]);
    expect(vicini("b")).toEqual({ prev: "a", next: "c" });
    expect(vicini("a")).toEqual({ prev: null, next: "b" });
    expect(vicini("c")).toEqual({ prev: "b", next: null });
  });

  it("un elemento fuori dall'elenco non ha vicini", () => {
    setGalleria(["a", "b"]);
    expect(vicini("z")).toEqual({ prev: null, next: null });
  });

  it("dopo un'eliminazione i vicini si ricalcolano", () => {
    setGalleria(["a", "b", "c"]);
    togliDallaGalleria("b");
    expect(vicini("a")).toEqual({ prev: null, next: "c" });
  });
});
