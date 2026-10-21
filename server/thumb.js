// Copia della miniatura di un link nell'archivio dell'utente: le copertine dei
// Reel e dei post arrivano dal CDN del social e il loro indirizzo scade. Il
// server scarica l'immagine (solo siti pubblici, con i limiti di net.js) e la
// salva nel bucket "files", cartella <utente>/miniature/, con il token
// dell'utente (niente chiavi di servizio). L'app poi scrive il percorso
// nell'elemento.

import { createClient } from "@supabase/supabase-js";
import { verifyRequest } from "./auth.js";
import { safeFetch } from "./net.js";

const MAX_BYTES = 5 * 1024 * 1024;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export async function handleThumb({ authHeader, body, env, fetchImpl = safeFetch, uploadImpl }) {
  const auth = await verifyRequest({ authHeader, env });
  if (!auth.ok) return { status: auth.status, json: { error: auth.error } };
  const id = typeof body?.id === "string" ? body.id : "";
  const url = typeof body?.url === "string" ? body.url : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: 400, json: { error: "Elemento non valido." } };
  if (!/^https?:\/\//i.test(url) || url.length > 4000) return { status: 400, json: { error: "Indirizzo non valido." } };
  if (!uploadImpl && (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || auth.userId === "local")) {
    return { status: 503, json: { error: "Archivio sincronizzato non disponibile." } };
  }
  let r;
  try {
    r = await fetchImpl(url, { binary: true, maxBytes: MAX_BYTES, timeoutMs: 10_000, accept: "image/*", allowPrivate: env.EXTRACT_ALLOW_PRIVATE === "1" });
  } catch (e) {
    return { status: 422, json: { error: e?.message || "Immagine non raggiungibile." } };
  }
  const type = String(r.contentType || "").split(";")[0].trim().toLowerCase();
  if (r.status !== 200 || !r.buf || !EXT[type]) return { status: 422, json: { error: "Il link non porta a un'immagine." } };
  if (r.truncated) return { status: 422, json: { error: "Immagine troppo grande." } };
  const path = `${auth.userId}/miniature/${id}.${EXT[type]}`;
  try {
    if (uploadImpl) await uploadImpl(path, r.buf, type);
    else {
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } });
      const { error } = await supabase.storage.from("files").upload(path, r.buf, { contentType: type, upsert: true });
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    return { status: 502, json: { error: `Salvataggio non riuscito: ${e.message}` } };
  }
  return { status: 200, json: { path, bytes: r.buf.length } };
}
