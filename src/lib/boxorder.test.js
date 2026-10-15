import { describe, expect, it } from "vitest";
import { moveBox, orderBoxes } from "./boxorder.js";

describe("ordine dei box", () => {
  it("rispetta l'ordine scelto e lascia in coda i nuovi", () => {
    expect(orderBoxes(["a", "b", "c", "d"], ["c", "a"])).toEqual(["c", "a", "b", "d"]);
  });
  it("ignora i box che non ci sono più e i doppioni", () => {
    expect(orderBoxes(["a", "b"], ["x", "b", "b", "a"])).toEqual(["b", "a"]);
  });
  it("sposta di un posto senza uscire dai bordi", () => {
    expect(moveBox(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveBox(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveBox(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});
