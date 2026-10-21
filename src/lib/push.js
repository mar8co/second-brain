// Notifiche push per i promemoria degli eventi (lato app).
// Su iPhone funzionano solo con l'app aggiunta alla schermata Home (iOS 16.4+).
import { api } from "./api.js";

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const isStandalone = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true);
export const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent || "");

export function keyToBytes(base64url) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.ready;
}

// Questo dispositivo è già iscritto?
export async function pushEnabled() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    return Boolean(await (await registration()).pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function enablePush(store) {
  if (!pushSupported()) throw new Error("Questo browser non supporta le notifiche.");
  if (isIos() && !isStandalone()) throw new Error("Su iPhone aggiungi prima l'app alla schermata Home, poi riprova da lì.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifiche non consentite: puoi cambiare idea dalle impostazioni del telefono.");
  const { publicKey } = await api.pushKey();
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }));
  const j = sub.toJSON();
  await store.savePushSubscription({ endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth });
}

export async function disablePush(store) {
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await store.removePushSubscription(endpoint);
}
