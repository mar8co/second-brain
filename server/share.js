// Core dell'endpoint POST /api/share: salvataggio "in background" da
// Comandi Rapidi su iPhone, senza aprire l'app.
//
// 1. Il Comando invia { token, text } (text = ciò che è stato condiviso).
// 2. Il token personale (creato in Impostazioni, salvato su Supabase solo come
//    hash SHA-256) identifica l'utente: l'elemento viene salvato subito.
// 3. Si risponde al Comando e, dopo la risposta, il server legge il link
//    (trascrive video e caroselli dei social, vedi social.js) e chiede all'AI
//    riassunto, categorie e tag (se GEMINI_API_KEY è presente).
//
// Le regole sono le stesse dell'app: solo dati pubblici, niente login o
// trucchi; le inferenze dell'AI restano nel campo `ai`, marcate come tali.

import { createClient } from "@supabase/supabase-js";
import { detectType, extractUrl } from "../src/lib/detect.js";
import { extractionPatch, hasContent, aiPayload, rebasePatch } from "../src/lib/enrich.js";
import { cleanList, sanitizeItem } from "../src/lib/item.js";
import { aiConfigured, classifyWithAi } from "./ai.js";
import { checkMedia, transcribeFiles } from "./media.js";
import { readLink, socialTarget } from "./social.js";

const MAX_TEXT = 5000;

// Accesso al database tramite due funzioni SQL (supabase/schema.sql) che
// verificano il token: la chiave pubblica basta, nessuna chiave di servizio.
export function supabaseShareDb(env) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const call = async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      const e = new Error(error.message);
      e.invalidToken = /invalid_token/.test(error.message || "");
      throw e;
    }
    return data;
  };
  return {
    save: (token, item) => call("share_save", { p_token: token, p_item: item }),
    get: (token, id) => call("share_get", { p_token: token, p_id: id }),
    update: (token, id, patch) => call("share_update", { p_token: token, p_id: id, p_patch: patch }),
  };
}

// Testo condiviso → elemento iniziale (come /aggiungi?text=).
export function itemFromShared(rawText) {
  const text = String(rawText || "").trim().slice(0, MAX_TEXT);
  const url = extractUrl(text);
  if (url) {
    const note = text.replace(/\bhttps?:\/\/\S+/i, "").trim() || null;
    return { type: detectType(url), url, note, status: "processing", status_detail: null };
  }
  if (!text) return null;
  return { type: "note", note: text, status: "saved", status_detail: "Testo inviato da Comandi Rapidi.", text_source: "inserito da te" };
}

// Audio di un video o slide di un carosello → elemento iniziale.
export function itemFromMedia(kind, rawText) {
  const text = String(rawText || "").trim().slice(0, MAX_TEXT);
  const url = extractUrl(text);
  const note = (url ? text.replace(/\bhttps?:\/\/\S+/i, "") : text).trim() || null;
  return {
    type: kind === "video" ? "video" : "social",
    url: url || null,
    title: kind === "video" ? "Video condiviso" : "Carosello condiviso",
    note,
    status: "processing",
    status_detail: kind === "video" ? "Trascrizione in corso…" : "Lettura delle slide in corso…",
  };
}

const SHARED_FILE_NOTE = "Il file non viene conservato: resta solo il testo, che può contenere errori.";

// Trascrizione (file condivisi o video YouTube) → patch.
async function transcriptionPatch(read, what) {
  try {
    const r = await read();
    if (!r.text) return { status: "partial", status_detail: `${what}: non ho trovato parole da trascrivere.` };
    return {
      ...(r.title ? { title: r.title } : {}),
      extracted_text: r.text,
      text_source: r.textSource,
      // Risposta tagliata al limite dell'AI: c'è solo la prima parte.
      status: r.truncated ? "partial" : "analyzed",
      status_detail: r.truncated ? `Letto in parte: ${r.looped ? "trascrizione interrotta dall'AI, salvata" : "file lungo, trascritta"} solo la prima parte.` : null,
    };
  } catch (e) {
    return { status: "saved", status_detail: `${what} non riuscita: ${e.message}` };
  }
}

export async function enrichMedia({ item, media, known = [], env, fetchImpl }) {
  const what = media.kind === "video" ? "Trascrizione" : "Lettura delle slide";
  const patch = await transcriptionPatch(() => transcribeFiles({ env, kind: media.kind, files: media.files, fetchImpl }), what);
  patch.processed_at = new Date().toISOString();
  if (patch.extracted_text) patch.status_detail = [patch.status_detail, SHARED_FILE_NOTE].filter(Boolean).join(" ");
  return withAi({ item, patch, known, env, fetchImpl });
}

// Lettura del link + AI. Scrive il risultato con un solo aggiornamento.
// Reel, TikTok, post Facebook e video YouTube vengono anche trascritti, i
// caroselli letti slide per slide (server/social.js). Il tempo è limitato
// dalla durata massima della funzione: resta margine per l'AI e il salvataggio.
// `classify: false` quando l'utente ha disattivato l'AI automatica nell'app.
export async function enrichShared({ item, known = [], env, fetchImpl, deadline = Date.now() + 240_000, classify = true }) {
  let patch = {};
  if (item.url) {
    try {
      const r = await readLink(item.url, { env, fetchImpl, deadline });
      patch = r.error
        ? { status: "saved", status_detail: r.error, processed_at: new Date().toISOString() }
        : extractionPatch(item, r);
    } catch {
      patch = { status: "saved", status_detail: "Analisi non eseguita: puoi riprovare dalla scheda.", processed_at: new Date().toISOString() };
    }
  }
  return classify ? withAi({ item, patch, known, env, fetchImpl }) : patch;
}

async function withAi({ item, patch, known, env, fetchImpl }) {
  const cur = { ...item, ...patch };
  if (aiConfigured(env) && hasContent(cur)) {
    try {
      const r = await classifyWithAi({ env, item: aiPayload(cur), known, fetchImpl });
      // Salvataggio senza app: le categorie e i tag dell'AI vengono assegnati
      // subito (resta traccia in `ai.applied`, la scheda lo dice).
      patch.ai = { summary: r.summary, categories: r.categories, tags: r.tags, model: r.model, generated_at: new Date().toISOString(), applied: true };
      patch.categories = cleanList([...(cur.categories || []), ...r.categories], 10);
      patch.tags = cleanList([...(cur.tags || []), ...r.tags]).map((t) => t.toLowerCase());
    } catch (e) {
      patch.status_detail = [cur.status_detail, `AI non disponibile: ${e.message}`].filter(Boolean).join(" ");
    }
  }
  return patch;
}

function tokenFrom({ body, authHeader }) {
  const t = typeof body?.token === "string" ? body.token : String(authHeader || "").replace(/^Bearer\s+/i, "");
  return t.trim();
}

// Comandi Rapidi mostra la risposta in una notifica: testo semplice, salvo
// richiesta esplicita di JSON (body.format = "json").
export async function handleShare(args) {
  const out = await shareCore(args);
  if (args.body?.format === "json") return out;
  return { status: out.status, text: out.json.message || out.json.error };
}

async function shareCore({ authHeader, body, env, waitUntil, db, fetchImpl }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return { status: 503, json: { error: "Server non configurato: mancano SUPABASE_URL e SUPABASE_ANON_KEY." } };
  }
  const token = tokenFrom({ body, authHeader });
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return { status: 401, json: { error: "Codice mancante o non valido: crealo in Impostazioni → Salvataggio rapido." } };
  }
  const raw = body?.text ?? body?.url;
  const media = Array.isArray(body?.files) && body.files.length ? checkMedia(body.files) : null;
  if (media?.error) return { status: 400, json: { error: media.error } };
  if (media && !aiConfigured(env)) {
    return { status: 503, json: { error: "Per trascrivere video e slide serve l'AI: manca GEMINI_API_KEY sul server." } };
  }
  const item = media ? itemFromMedia(media.kind, typeof raw === "string" ? raw : "") : itemFromShared(typeof raw === "string" ? raw : "");
  if (!item) return { status: 400, json: { error: "Niente da salvare: il Comando non ha inviato testo o link." } };

  const store = db || supabaseShareDb(env);
  let saved;
  try {
    saved = await store.save(token, item);
  } catch (e) {
    if (e.invalidToken) return { status: 401, json: { error: "Codice non valido o revocato: creane uno nuovo in Impostazioni." } };
    return { status: 502, json: { error: "Salvataggio non riuscito: riprova." } };
  }
  const id = saved?.id;
  const known = Array.isArray(saved?.categories) ? saved.categories : [];

  // Scrive il risultato. Se intanto l'utente ha modificato l'elemento
  // nell'app, le sue modifiche restano (rebasePatch); se l'ha eliminato, niente.
  // sanitizeItem: gli stessi limiti di lunghezza del database (altrimenti la
  // scrittura fallisce e l'elemento resta "in elaborazione").
  const before = { ...item, description: null, categories: [], tags: [], ai: null };
  const write = async (patch) => {
    let fresh;
    try {
      fresh = store.get ? await store.get(token, id) : before;
    } catch {
      fresh = before;
    }
    const next = rebasePatch(fresh, before, patch);
    if (next && Object.keys(next).length) await store.update(token, id, sanitizeItem(next));
  };
  const job = media
    ? enrichMedia({ item, media, known, env, fetchImpl })
        .then(write)
        .catch((e) => console.warn("share: trascrizione non riuscita", e?.message))
    : item.url || aiConfigured(env)
    ? enrichShared({ item, known, env, fetchImpl })
        .then(write)
        .catch((e) => console.warn("share: elaborazione non riuscita", e?.message))
    : null;
  // Su Vercel il lavoro continua dopo la risposta; altrove (sviluppo) si aspetta.
  if (job && waitUntil) waitUntil(job);
  else if (job) await job;

  const message = media
    ? media.kind === "video"
      ? "Video ricevuto in Second Brain: lo trascrivo in background."
      : `Carosello ricevuto in Second Brain (${media.files.length} file): leggo le slide in background.`
    : item.url
      ? socialTarget(item.url)
        ? "Link salvato in Second Brain: leggo e trascrivo il post in background."
        : "Link salvato in Second Brain: lo analizzo in background."
      : "Nota salvata in Second Brain.";
  return { status: 200, json: { ok: true, id, message } };
}
