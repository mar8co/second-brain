// Promemoria degli eventi con notifiche push (anche a app chiusa).
//
// - Chiave pubblica per iscriversi (/api/push, azione "key"): le chiavi VAPID
//   non si tengono in un file né su Vercel: si ricavano da un segreto del
//   server (SUPABASE_SERVICE_ROLE_KEY), quindi non serve altro da impostare.
// - Invio (Vercel Cron, una volta al giorno, GET /api/push con
//   Authorization: Bearer CRON_SECRET): per ogni utente iscritto cerca gli
//   eventi di oggi e di domani e manda una notifica. Serve la chiave di
//   servizio perché il cron non ha la sessione di nessun utente.
//
// Su iPhone le notifiche push funzionano solo per l'app aggiunta alla schermata
// Home (iOS 16.4 o successivo) e dopo che l'utente ha acconsentito.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { eventsOf } from "../src/lib/spots.js";
import { verifyRequest } from "./auth.js";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

// Coppia di chiavi VAPID (curva P-256) ricavata in modo stabile dal segreto.
export function vapidKeys(seed) {
  const ecdh = crypto.createECDH("prime256v1");
  for (let i = 0; i < 8; i++) {
    const priv = crypto.createHash("sha256").update(`second-brain-vapid:${i}:${seed}`).digest();
    try {
      ecdh.setPrivateKey(priv);
      return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(priv) };
    } catch {
      /* scalare non valido per la curva (rarissimo): si riprova */
    }
  }
  throw new Error("vapid_keys");
}

// Giorno di oggi (e di domani) a Roma, come AAAA-MM-GG.
export function romeDays(now = new Date()) {
  const fmt = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return { today: fmt(now), tomorrow: fmt(new Date(now.getTime() + 24 * 3600_000)) };
}

// Eventi di oggi e di domani (anche quelli già in corso, di più giorni).
export function dueEvents(items, now = new Date()) {
  const { today, tomorrow } = romeDays(now);
  const out = [];
  for (const e of eventsOf(items, today).upcoming) {
    const last = e.end_date || e.date;
    if (e.date === tomorrow) out.push({ name: e.name, when: "domani", place: e.place });
    else if (e.date <= today && last >= today) out.push({ name: e.name, when: "oggi", place: e.place });
  }
  return out;
}

export function reminderPayload(due) {
  const one = due.length === 1 ? due[0] : null;
  const title = one ? `${one.when === "oggi" ? "Oggi" : "Domani"}: ${one.name}` : `${due.length} eventi in arrivo`;
  const body = one ? one.place || "Apri Second Brain per i dettagli." : due.map((e) => `${e.when === "oggi" ? "Oggi" : "Domani"}: ${e.name}`).join("\n");
  return { title, body: body.slice(0, 240), url: "/archivio?sezione=eventi" };
}

export async function handlePushKey({ authHeader, env }) {
  const auth = await verifyRequest({ authHeader, env });
  if (!auth.ok) return { status: auth.status, json: { error: auth.error } };
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return { status: 503, json: { error: "Notifiche non configurate: manca SUPABASE_SERVICE_ROLE_KEY sul server." } };
  return { status: 200, json: { publicKey: vapidKeys(env.SUPABASE_SERVICE_ROLE_KEY).publicKey } };
}

// Invio giornaliero. `send`: iniettabile per i test.
export async function handlePushCron({ authHeader, env, now = new Date(), send = (sub, payload, opts) => webpush.sendNotification(sub, payload, opts), db }) {
  if (!env.CRON_SECRET) return { status: 503, json: { error: "Manca CRON_SECRET sul server." } };
  const given = String(authHeader || "").replace(/^Bearer\s+/i, "");
  const ok = given.length === env.CRON_SECRET.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(env.CRON_SECRET));
  if (!ok) return { status: 401, json: { error: "Non autorizzato." } };
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) return { status: 503, json: { error: "Notifiche non configurate: manca SUPABASE_SERVICE_ROLE_KEY." } };

  const admin = db || createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const keys = vapidKeys(env.SUPABASE_SERVICE_ROLE_KEY);
  const opts = { vapidDetails: { subject: env.VAPID_SUBJECT || "https://second-brain-qqwi.vercel.app", publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 12 * 3600 };

  const { data: subs, error } = await admin.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth");
  if (error) return { status: 502, json: { error: `Iscrizioni non leggibili: ${error.message}` } };
  const byUser = new Map();
  for (const s of subs || []) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);

  let sent = 0;
  let removed = 0;
  let failed = 0;
  for (const [userId, list] of byUser) {
    const { data: items, error: e2 } = await admin.from("items").select("id,ai").eq("user_id", userId);
    if (e2) {
      failed += list.length;
      continue;
    }
    const due = dueEvents(items || [], now);
    if (!due.length) continue;
    const payload = JSON.stringify(reminderPayload(due));
    for (const s of list) {
      try {
        await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, opts);
        sent += 1;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
          removed += 1;
        } else failed += 1;
      }
    }
  }
  return { status: 200, json: { users: byUser.size, sent, removed, failed } };
}
