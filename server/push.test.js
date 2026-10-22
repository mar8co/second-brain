import { describe, expect, it, vi } from "vitest";
import { dueEvents, handlePushCron, handlePushKey, handlePushTest, reminderPayload, romeDays, vapidKeys } from "./push.js";

const items = [
  { id: "1", ai: { events: [{ name: "Workshop AI", date: "2026-10-22", place: "Roma" }, { name: "Concerto", date: "2026-10-23" }, { name: "Passato", date: "2026-10-01" }, { name: "Nascosto", date: "2026-10-22", hidden: true }] } },
  { id: "2", ai: { events: [{ name: "Fiera", date: "2026-10-20", end_date: "2026-10-22" }] } },
];
const NOW = new Date("2026-10-22T06:00:00Z");

describe("vapidKeys", () => {
  it("ricava sempre la stessa coppia valida dal segreto", () => {
    const a = vapidKeys("segreto");
    expect(Buffer.from(a.publicKey, "base64url")).toHaveLength(65);
    expect(Buffer.from(a.privateKey, "base64url")).toHaveLength(32);
    expect(vapidKeys("segreto")).toEqual(a);
    expect(vapidKeys("altro").publicKey).not.toBe(a.publicKey);
  });
});

describe("eventi in arrivo", () => {
  it("giorni a Roma", () => {
    expect(romeDays(new Date("2026-10-22T22:30:00Z"))).toEqual({ today: "2026-10-23", tomorrow: "2026-10-24" });
  });
  it("oggi, in corso e domani; non i passati né i nascosti", () => {
    const due = dueEvents(items, NOW);
    expect(due.map((e) => `${e.when}:${e.name}`).sort()).toEqual(["domani:Concerto", "oggi:Fiera", "oggi:Workshop AI"]);
  });
  it("testo della notifica", () => {
    expect(reminderPayload([{ name: "Workshop AI", when: "oggi", place: "Roma" }])).toMatchObject({ title: "Oggi: Workshop AI", body: "Roma", url: "/archivio?sezione=eventi" });
    expect(reminderPayload([{ name: "A", when: "oggi" }, { name: "B", when: "domani" }]).title).toBe("2 eventi in arrivo");
  });
});

const fakeDb = (subs, itemsByUser) => ({
  deleted: [],
  from(table) {
    const self = this;
    return {
      select: () => ({
        eq: async (_col, id) => ({ data: itemsByUser[id] || [], error: null }),
        then: (res) => res({ data: table === "push_subscriptions" ? subs : [], error: null }),
      }),
      delete: () => ({ eq: async (_c, id) => void self.deleted.push(id) }),
    };
  },
});
const env = { CRON_SECRET: "s3", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "role" };
const sub = (id, user) => ({ id, user_id: user, endpoint: `https://push/${id}`, p256dh: "p", auth: "a" });

describe("handlePushCron", () => {
  it("rifiuta senza il segreto giusto e senza configurazione", async () => {
    expect((await handlePushCron({ authHeader: "Bearer no", env, db: fakeDb([], {}) })).status).toBe(401);
    expect((await handlePushCron({ authHeader: "", env, db: fakeDb([], {}) })).status).toBe(401);
    expect((await handlePushCron({ authHeader: "Bearer s3", env: { ...env, CRON_SECRET: "" }, db: fakeDb([], {}) })).status).toBe(503);
    expect((await handlePushCron({ authHeader: "Bearer s3", env: { CRON_SECRET: "s3" }, db: fakeDb([], {}) })).status).toBe(503);
  });
  it("manda la notifica a ogni dispositivo dell'utente con eventi e toglie le iscrizioni scadute", async () => {
    const send = vi.fn(async (s) => {
      if (s.endpoint.endsWith("/b")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    });
    const db = fakeDb([sub("a", "u1"), sub("b", "u1"), sub("c", "u2")], { u1: items, u2: [{ id: "9", ai: { events: [{ name: "Lontano", date: "2027-01-01" }] } }] });
    const r = await handlePushCron({ authHeader: "Bearer s3", env, now: NOW, send, db });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ users: 2, sent: 1, removed: 1, failed: 0 });
    expect(JSON.parse(send.mock.calls[0][1]).title).toBe("3 eventi in arrivo");
    expect(db.deleted).toEqual(["b"]);
  });
});

describe("handlePushKey", () => {
  it("serve la sessione e la chiave di servizio", async () => {
    const e = { ALLOW_NO_AUTH: "1", SUPABASE_SERVICE_ROLE_KEY: "role" };
    const r = await handlePushKey({ authHeader: "", env: e });
    expect(r.status).toBe(200);
    expect(r.json.publicKey).toBe(vapidKeys("role").publicKey);
    expect((await handlePushKey({ authHeader: "", env: { ALLOW_NO_AUTH: "1" } })).status).toBe(503);
  });
});

describe("handlePushTest", () => {
  const env = { ALLOW_NO_AUTH: "1", SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "role" };
  const dbFor = (subs) => ({
    deleted: [],
    from() {
      const self = this;
      return {
        select: () => ({ eq: async () => ({ data: subs, error: null }) }),
        delete: () => ({ eq: async (_c, id) => { self.deleted.push(id); return {}; } }),
      };
    },
  });
  it("manda la prova a ogni dispositivo e dice quanti", async () => {
    const send = vi.fn(async () => {});
    const r = await handlePushTest({ authHeader: "", env, send, db: dbFor([{ id: "a", endpoint: "e/a", p256dh: "p", auth: "q" }]) });
    expect(r.json).toMatchObject({ sent: 1, failed: 0, devices: 1 });
    expect(JSON.parse(send.mock.calls[0][1]).title).toBe("Notifica di prova");
  });
  it("senza iscrizioni risponde devices 0; con iscrizione scaduta la toglie", async () => {
    expect((await handlePushTest({ authHeader: "", env, db: dbFor([]) })).json.devices).toBe(0);
    const db = dbFor([{ id: "b", endpoint: "e/b", p256dh: "p", auth: "q" }]);
    const send = vi.fn(async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); });
    const r = await handlePushTest({ authHeader: "", env, send, db });
    expect(r.json).toMatchObject({ sent: 0, removed: 1, code: 410 });
    expect(db.deleted).toEqual(["b"]);
  });
});
