// Core dell'endpoint POST /api/extract: lettura di un link dall'app.
//
// - Link normali: risposta immediata con ciò che è stato letto; il client
//   salva il risultato.
// - Post social e video (trascrizione, slide): possono servire minuti. Se il
//   client manda l'id dell'elemento (modalità sincronizzata), il server
//   risponde subito e prosegue in background (waitUntil), poi scrive il
//   risultato con il token dell'utente: le regole RLS di Supabase limitano la
//   scrittura ai suoi elementi. Così chiudere l'app non fa perdere la lettura.

import { createClient } from "@supabase/supabase-js";
import { rebasePatch, unreadFile } from "../src/lib/enrich.js";
import { STATUS_KEYS } from "../src/lib/constants.js";
import { cleanList, sanitizeItem } from "../src/lib/item.js";
import { verifyRequest } from "./auth.js";
import { aiConfigured } from "./ai.js";
import { enrichFile, enrichShared } from "./share.js";
import { readLink, socialTarget } from "./social.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Il lavoro in background dura fino a 5 minuti e scrive con il token
// dell'utente: serve che resti valido fino alla fine (l'app lo rinnova prima
// di chiamare). Altrimenti si legge subito e scrive l'app.
const BACKGROUND_TOKEN_MS = 310_000;

export function tokenExpiresAt(authHeader) {
  try {
    const payload = String(authHeader || "").replace(/^Bearer\s+/i, "").split(".")[1];
    const exp = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).exp;
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

// Accesso agli elementi con il token dell'utente (niente chiavi di servizio).
export function userItemsDb(env, authHeader) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  return {
    async get(id) {
      const { data, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async update(id, patch) {
      const { error } = await supabase.from("items").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    // File dell'elemento nello Storage (le regole RLS limitano ai propri file).
    async download(path) {
      const { data, error } = await supabase.storage.from("files").download(path);
      if (error) throw new Error(error.message || "file non scaricabile");
      return Buffer.from(await data.arrayBuffer());
    },
  };
}

// File letti dall'AI: fino a 15 MB (limite del bucket).
const FILE_MAX = 15 * 1024 * 1024;

// Immagine o PDF senza testo già salvato: l'AI lo legge in background e
// scrive il risultato con il token dell'utente, come per i post social.
async function readSavedFile({ authHeader, body, env, fetchImpl, waitUntil, db, now }) {
  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : null;
  const store = db || (id && env.SUPABASE_URL && env.SUPABASE_ANON_KEY && authHeader ? userItemsDb(env, authHeader) : null);
  if (!id || !store) return { status: 400, json: { error: "Lettura del file disponibile solo con l'archivio sincronizzato." } };
  if (!aiConfigured(env)) return { status: 503, json: { error: "AI non configurata: manca GEMINI_API_KEY sul server.", code: "ai_disabled" } };
  if (tokenExpiresAt(authHeader) - now() <= BACKGROUND_TOKEN_MS) return { status: 401, json: { error: "Sessione in scadenza: riapri l'app e riprova." } };
  let item;
  try {
    item = await store.get(id);
  } catch {
    return { status: 502, json: { error: "Elemento non leggibile dal database: riprova." } };
  }
  if (!item?.file_path) return { status: 404, json: { error: "Elemento non trovato." } };
  const kind = unreadFile(item);
  if (!kind) return { status: 400, json: { error: "Questo file non va letto dall'AI (già letto o di un tipo non supportato)." } };
  if (Number(item.file_size) > FILE_MAX) return { status: 400, json: { error: "File troppo grande per la lettura dell'AI." } };
  const known = cleanList(Array.isArray(body.categories) ? body.categories : [], 50);
  // Stato prima della lettura (ora l'elemento è "in elaborazione").
  const prevStatus = typeof body.prev_status === "string" && STATUS_KEYS.includes(body.prev_status) ? body.prev_status : "saved";
  const job = store
    .download(item.file_path)
    .then((data) => enrichFile({ item, kind, data, known, env, fetchImpl, classify: body.ai !== false, apply: body.apply !== false, prevStatus }))
    .catch((e) => ({ status: prevStatus === "partial" ? "partial" : "saved", status_detail: `Lettura del file non riuscita: ${e?.message || "errore"}. Puoi riprovare dalla scheda.`, processed_at: new Date().toISOString() }))
    .then(async (patch) => {
      const fresh = await store.get(id).catch(() => item);
      const next = rebasePatch(fresh, item, patch);
      if (next) await store.update(id, sanitizeItem(next));
    })
    .catch((e) => console.warn("extract: lettura del file non riuscita", e?.message));
  if (waitUntil) waitUntil(job);
  else await job;
  return { status: 202, json: { background: true } };
}

export async function handleRead({ authHeader, body, env, fetchImpl, waitUntil, db, now = Date.now }) {
  const auth = await verifyRequest({ authHeader, env });
  if (!auth.ok) return { status: auth.status, json: { error: auth.error } };
  if (body?.file === true) return readSavedFile({ authHeader, body, env, fetchImpl, waitUntil, db, now });
  const raw = body?.url;
  if (typeof raw !== "string" || raw.length > 4000) return { status: 400, json: { error: "Link mancante o troppo lungo." } };

  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : null;
  const store = db || (id && env.SUPABASE_URL && env.SUPABASE_ANON_KEY && authHeader ? userItemsDb(env, authHeader) : null);
  const tokenOk = tokenExpiresAt(authHeader) - now() > BACKGROUND_TOKEN_MS;
  if (id && store && tokenOk && socialTarget(raw)) {
    let item;
    try {
      item = await store.get(id);
    } catch {
      return { status: 502, json: { error: "Elemento non leggibile dal database: riprova." } };
    }
    if (!item?.url) return { status: 404, json: { error: "Elemento non trovato." } };
    const known = cleanList(Array.isArray(body.categories) ? body.categories : [], 50);
    // apply=false: categorie e tag dell'AI restano proposte (riletture automatiche).
    // Stato prima della nuova lettura (ora l'elemento è "in elaborazione").
    const prevStatus = typeof body.prev_status === "string" && STATUS_KEYS.includes(body.prev_status) ? body.prev_status : item.status;
    const job = enrichShared({ item, known, env, fetchImpl, classify: body.ai === true, apply: body.apply !== false, prevStatus })
      .then(async (patch) => {
        // Le modifiche fatte dall'utente durante la lettura non si perdono.
        const fresh = await store.get(id).catch(() => item);
        const next = rebasePatch(fresh, item, patch);
        if (next) await store.update(id, sanitizeItem(next));
      })
      .catch(async (e) => {
        console.warn("extract: elaborazione in background non riuscita", e?.message);
        await store
          .update(id, { status: "saved", status_detail: "Analisi non riuscita: puoi riprovare dalla scheda.", processed_at: new Date().toISOString() })
          .catch(() => {});
      });
    // Su Vercel il lavoro continua dopo la risposta; altrove (sviluppo) si aspetta.
    if (waitUntil) waitUntil(job);
    else await job;
    return { status: 202, json: { background: true } };
  }

  const out = await readLink(raw, { env, fetchImpl });
  if (out.error) return { status: 400, json: { error: out.error } };
  return { status: 200, json: out };
}
