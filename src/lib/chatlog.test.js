import { beforeEach, describe, expect, it, vi } from "vitest";

// Ambiente Node: un localStorage finto basta.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
};

const fakeSupabase = (row, { fail = false } = {}) => {
  const saves = [];
  return {
    saves,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => (fail ? { data: null, error: { message: "rete" } } : { data: row, error: null }) }) }),
      upsert: async (payload) => {
        saves.push(payload);
        return { error: null };
      },
    }),
  };
};

const pergunta = (q, extra = {}) => ({ id: q, at: "2026-10-15T08:00:00.000Z", q, pending: false, result: { kind: "none" }, ...extra });

async function load() {
  vi.resetModules();
  return import("./chatlog.js");
}

describe("chat sincronizzata con l'account", () => {
  beforeEach(() => {
    store.clear();
  });

  it("se il server ha una chat, vince quella (dagli altri dispositivi)", async () => {
    const m = await load();
    m.updateChatLog(() => [pergunta("vecchia sul telefono")]);
    await m.startChatSync(fakeSupabase({ messages: [pergunta("dal PC")] }), "u1");
    expect(m.getChatLog().map((x) => x.q)).toEqual(["dal PC"]);
    expect(JSON.parse(store.get("sb-chat-v1"))[0].q).toBe("dal PC");
  });

  it("primo accesso: se il server non ha chat, si carica quella del dispositivo", async () => {
    const m = await load();
    m.updateChatLog(() => [pergunta("sul telefono")]);
    const sb = fakeSupabase(null);
    await m.startChatSync(sb, "u1");
    await new Promise((r) => setTimeout(r, 20));
    expect(sb.saves.at(-1)).toMatchObject({ user_id: "u1", messages: [expect.objectContaining({ q: "sul telefono" })] });
  });

  it("ogni modifica viene salvata sul server", async () => {
    const m = await load();
    const sb = fakeSupabase(null);
    await m.startChatSync(sb, "u1");
    await new Promise((r) => setTimeout(r, 20));
    m.updateChatLog((cur) => [...cur, pergunta("nuova")]);
    await new Promise((r) => setTimeout(r, 1000));
    expect(sb.saves.at(-1).messages.map((x) => x.q)).toEqual(["nuova"]);
  });

  it("se il server non risponde la chat resta sul dispositivo e non si sincronizza", async () => {
    const m = await load();
    m.updateChatLog(() => [pergunta("solo qui")]);
    await m.startChatSync(fakeSupabase(null, { fail: true }), "u1");
    expect(m.getChatLog().map((x) => x.q)).toEqual(["solo qui"]);
  });

  it("all'uscita la chat si svuota su questo dispositivo", async () => {
    const m = await load();
    m.updateChatLog(() => [pergunta("privata")]);
    m.stopChatSync();
    expect(m.getChatLog()).toEqual([]);
    expect(store.has("sb-chat-v1")).toBe(false);
  });

  it("le domande in attesa sul server diventano interrotte", async () => {
    const m = await load();
    await m.startChatSync(fakeSupabase({ messages: [{ id: "x", at: "2026-10-15T08:00:00.000Z", q: "in attesa", pending: true }] }), "u1");
    expect(m.getChatLog()[0]).toMatchObject({ pending: false, result: { kind: "error" } });
  });
});
