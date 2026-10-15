import { describe, expect, it, vi } from "vitest";
import { watchForUpdates } from "./updates.js";

function setup({ controller = {}, visibility = "visible", active = null } = {}) {
  const swL = {};
  const docL = {};
  const reg = { update: vi.fn(() => Promise.resolve()) };
  const sw = { controller, addEventListener: (t, f) => (swL[t] = f), getRegistration: vi.fn(() => Promise.resolve(reg)) };
  const doc = { visibilityState: visibility, activeElement: active, addEventListener: (t, f) => (docL[t] = f) };
  const reload = vi.fn();
  watchForUpdates({ sw, doc, reload });
  return { swL, docL, doc, reg, sw, reload };
}

describe("aggiornamento dell'app", () => {
  it("ricarica quando il service worker nuovo prende il controllo", () => {
    const t = setup();
    t.swL.controllerchange();
    t.swL.controllerchange();
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it("non ricarica al primo avvio, quando non c'era un controller", () => {
    const t = setup({ controller: null });
    t.swL.controllerchange();
    expect(t.reload).not.toHaveBeenCalled();
  });

  it("se si sta scrivendo aspetta che l'app vada in secondo piano", () => {
    const t = setup({ active: { tagName: "TEXTAREA" } });
    t.swL.controllerchange();
    expect(t.reload).not.toHaveBeenCalled();
    t.doc.visibilityState = "hidden";
    t.docL.visibilitychange();
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it("tornando in primo piano cerca una versione nuova", async () => {
    const t = setup();
    t.docL.visibilitychange();
    await Promise.resolve();
    await Promise.resolve();
    expect(t.reg.update).toHaveBeenCalledTimes(1);
    t.doc.visibilityState = "hidden";
    t.docL.visibilitychange();
    expect(t.sw.getRegistration).toHaveBeenCalledTimes(1);
  });

  it("senza service worker non fa nulla", () => {
    expect(() => watchForUpdates({ sw: undefined, doc: {} })).not.toThrow();
  });
});
