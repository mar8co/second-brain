// Lavori in coda, fatti dal server anche ad app chiusa (POST /api/lavori).
//
// La "sveglia" di Supabase (pg_cron + pg_net) chiama questo endpoint ogni pochi
// minuti con un token: nel database c'è solo il suo hash (tabella
// lavori_chiave). A ogni giro, per tutto l'archivio:
//  1. vettori per la ricerca per significato (un gruppo di elementi);
//  2. al massimo una rilettura di un link o di un file (lettura interrotta,
//     non riuscita per poco, solo didascalia, immagine non ancora letta);
//  3. schede di memoria dell'AI mancanti o vecchie, finché c'è tempo.
// Sono gli stessi lavori che l'app fa quando è aperta (src/lib/memory.js,
// src/lib/embed.js): stesse regole, stessi limiti per elemento. I tentativi
// sono contati nella tabella `lavori`; ripartono da zero se l'elemento cambia.
// Al limite gratuito dell'AI tutto si ferma per 6 ore (tabella lavori_stato).
// Serve la chiave di servizio: la sveglia non ha la sessione di nessun utente.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_CATEGORIES } from "../src/lib/constants.js";
import { aiFromDigest, aiPayload, rebasePatch, unreadFile, withoutAiFailure } from "../src/lib/enrich.js";
import { EMBED_BATCH, embeddingText, needsEmbedding } from "../src/lib/embed.js";
import { COLUMNS, sanitizeItem } from "../src/lib/item.js";
import { AI_LIMIT, AI_LIMIT_PAUSE_MS, needsDigest, needsReread, rereadLimit, rereadReason } from "../src/lib/memory.js";
import { aiConfigured, classifyWithAi, embedTexts } from "./ai.js";
import { enrichFile, enrichShared } from "./share.js";

export const DIGEST_TRIES = 3;
const FILE_MAX = 15 * 1024 * 1024;
const VIDEO_FILE_MAX = 50 * 1024 * 1024;
// La funzione dura al massimo 300 s: si smette di iniziare lavori prima.
const RUN_MS = 250_000;
const REREAD_MS = 150_000;

export const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

// Accesso al database con la chiave di servizio.
export function lavoriDb(env) {
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const ok = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    async keyOk(hash) {
      return (ok(await sb.from("lavori_chiave").select("hash").eq("hash", hash).limit(1)) || []).length > 0;
    },
    async pausedUntil() {
      const row = ok(await sb.from("lavori_stato").select("pausa_fino").eq("id", 1).maybeSingle());
      return Date.parse(row?.pausa_fino || "") || 0;
    },
    async pause(until) {
      ok(await sb.from("lavori_stato").upsert({ id: 1, pausa_fino: new Date(until).toISOString() }));
    },
    // Resoconto dell'ultimo giro, per controllare che la sveglia funzioni.
    async saveReport(report) {
      ok(await sb.from("lavori_stato").upsert({ id: 1, ultimo: report, ultimo_at: new Date().toISOString() }));
    },
    async items() {
      const cols = [...COLUMNS, "user_id"].join(",");
      const out = [];
      for (let from = 0; ; from += 1000) {
        const data = ok(await sb.from("items").select(cols).order("created_at", { ascending: false }).range(from, from + 999));
        out.push(...data);
        if (data.length < 1000) break;
      }
      return out;
    },
    async get(id) {
      return ok(await sb.from("items").select([...COLUMNS, "user_id"].join(",")).eq("id", id).maybeSingle());
    },
    async update(id, patch) {
      ok(await sb.from("items").update(patch).eq("id", id));
    },
    async setEmbedding(id, vector) {
      ok(await sb.from("items").update({ embedding: `[${vector.join(",")}]` }).eq("id", id));
    },
    async download(path) {
      const { data, error } = await sb.storage.from("files").download(path);
      if (error) throw new Error(error.message || "file non scaricabile");
      return Buffer.from(await data.arrayBuffer());
    },
    async tries() {
      return ok(await sb.from("lavori").select("item_id,tipo,tentativi,versione")) || [];
    },
    async addTry(row) {
      ok(await sb.from("lavori").upsert(row, { onConflict: "item_id,tipo" }));
    },
  };
}

// Impronta del contenuto: i tentativi contano finché il contenuto resta
// questo (non lo stato o la scheda dell'AI, che cambiano a ogni tentativo).
export const versionOf = (it) =>
  hashToken(JSON.stringify(["url", "file_path", "title", "description", "note", "extracted_text", "author"].map((k) => it[k] ?? null))).slice(0, 16);

// Tentativi fatti per un elemento e un tipo di lavoro.
export function triesOf(rows) {
  const m = new Map(rows.map((r) => [`${r.item_id}:${r.tipo}`, r]));
  return (item, tipo) => {
    const r = m.get(`${item.id}:${tipo}`);
    return r && r.versione === versionOf(item) ? Number(r.tentativi) || 0 : 0;
  };
}

function knownCategories(items, userId) {
  const s = new Set(DEFAULT_CATEGORIES);
  for (const it of items) if (it.user_id === userId) for (const c of it.categories || []) s.add(c);
  return [...s];
}

const changedSince = (now, before) =>
  !now || now.status === "processing" || !["title", "description", "note", "extracted_text", "author"].every((k) => (now[k] ?? null) === (before[k] ?? null)) || (now.ai?.generated_at ?? null) !== (before.ai?.generated_at ?? null);

// Un giro della coda. → { status, json } con il resoconto.
export async function runLavori({ env, db, fetchImpl, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), gapMs = 3000 }) {
  const start = now();
  const left = () => RUN_MS - (now() - start);
  const report = { vettori: 0, riletture: 0, schede: 0, errori: 0 };
  if (!aiConfigured(env)) return { status: 200, json: { ...report, fermo: "AI non configurata" } };
  const paused = await db.pausedUntil();
  if (paused > now() && paused - now() <= AI_LIMIT_PAUSE_MS) return { status: 200, json: { ...report, fermo: "limite gratuito dell'AI", fino: new Date(paused).toISOString() } };

  const items = await db.items();
  const count = triesOf(await db.tries());
  const done = new Set();
  const addTry = (item, tipo) => db.addTry({ item_id: item.id, user_id: item.user_id, tipo, tentativi: count(item, tipo) + 1, versione: versionOf(item), ultimo_at: new Date(now()).toISOString() }).catch(() => {});
  const limit = async () => {
    await db.pause(now() + AI_LIMIT_PAUSE_MS);
    return { status: 200, json: { ...report, fermo: "limite gratuito dell'AI" } };
  };

  // 1. Vettori (una sola chiamata per un gruppo).
  const toEmbed = items.filter(needsEmbedding).slice(0, EMBED_BATCH);
  if (toEmbed.length) {
    try {
      const vectors = await embedTexts({ env, texts: toEmbed.map(embeddingText), fetchImpl });
      for (let i = 0; i < toEmbed.length; i++) {
        const it = toEmbed[i];
        await db.setEmbedding(it.id, vectors[i]);
        const fresh = await db.get(it.id);
        if (fresh?.ai) await db.update(it.id, { ai: { ...fresh.ai, emb_at: new Date(now()).toISOString() } });
        report.vettori += 1;
      }
    } catch (e) {
      if (e?.status === 429) return limit();
      report.errori += 1;
    }
  }

  // 2. Una rilettura (usa una lettura di Apify o la lettura di un file).
  const canReread = (it) => {
    const reason = rereadReason(it, now());
    if (!reason || (reason === "file" && !unreadFile(it))) return false;
    if (it.file_path && Number(it.file_size) > (unreadFile(it) === "video" ? VIDEO_FILE_MAX : FILE_MAX)) return false;
    return count(it, "rilettura") < rereadLimit(reason);
  };
  const old = items.find(canReread);
  if (old) {
    done.add(old.id);
    await addTry(old, "rilettura");
    const kind = old.file_path ? unreadFile(old) : null;
    const prevStatus = old.status === "processing" ? "saved" : old.status;
    try {
      await db.update(old.id, { status: "processing", status_detail: kind ? "Lettura automatica del file in corso…" : "Lettura automatica in corso…" });
      const known = knownCategories(items, old.user_id);
      // Chi ha già una scheda tiene categorie e tag: quelli dell'AI restano proposte.
      const apply = !old.ai;
      const deadline = now() + REREAD_MS;
      let patch;
      try {
        patch = kind
          ? await enrichFile({ item: old, kind, data: await db.download(old.file_path), known, env, fetchImpl, deadline, apply, prevStatus })
          : await enrichShared({ item: old, known, env, fetchImpl, deadline, apply, prevStatus });
      } catch (e) {
        patch = { status: prevStatus === "partial" ? "partial" : "saved", status_detail: `Lettura non riuscita: ${e?.message || "errore"}. Puoi riprovare dalla scheda.`, processed_at: new Date(now()).toISOString() };
      }
      const fresh = await db.get(old.id);
      const next = rebasePatch(fresh, old, patch);
      if (next) await db.update(old.id, sanitizeItem(next));
      report.riletture += 1;
      const after = fresh && { ...fresh, ...next };
      if (after && needsReread(after, now()) && AI_LIMIT.test(withoutAiFailure(after.status_detail) || "")) return limit();
    } catch {
      report.errori += 1;
      await db.update(old.id, { status: prevStatus, status_detail: "Analisi non riuscita: puoi riprovare dalla scheda." }).catch(() => {});
    }
  }

  // 3. Schede di memoria, finché c'è tempo.
  const willReread = (it) => canReread(it);
  while (left() > 60_000) {
    const next = items.find((it) => !done.has(it.id) && needsDigest(it, now(), willReread) && count(it, "scheda") < DIGEST_TRIES);
    if (!next) break;
    done.add(next.id);
    await addTry(next, "scheda");
    try {
      const r = await classifyWithAi({ env, item: aiPayload(next), known: knownCategories(items, next.user_id), fetchImpl, deadline: now() + 55_000 });
      const cur = await db.get(next.id);
      if (!changedSince(cur, next)) {
        const patch = {};
        const detail = withoutAiFailure(cur.status_detail);
        if (detail !== (cur.status_detail ?? null)) patch.status_detail = detail;
        if (cur.ai) {
          patch.ai = aiFromDigest(r, { applied: Boolean(cur.ai.applied), previous: cur.ai });
        } else {
          patch.ai = aiFromDigest(r, { applied: true, previous: null });
          patch.categories = [...(cur.categories || []), ...r.categories.filter((c) => !(cur.categories || []).includes(c))];
          patch.tags = [...(cur.tags || []), ...r.tags.filter((t) => !(cur.tags || []).includes(t))];
        }
        await db.update(next.id, sanitizeItem(patch));
        report.schede += 1;
      }
    } catch (e) {
      if (e?.status === 429) return limit();
      report.errori += 1;
    }
    await sleep(gapMs);
  }
  return { status: 200, json: report };
}

// Risponde subito (la sveglia non aspetta) e lavora dopo la risposta
// (waitUntil); il resoconto finisce in lavori_stato.
export async function handleLavori({ authHeader, env, fetchImpl, db, now, sleep, waitUntil }) {
  const token = String(authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, json: { error: "Non autorizzato." } };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { status: 503, json: { error: "Manca SUPABASE_SERVICE_ROLE_KEY sul server." } };
  const store = db || lavoriDb(env);
  if (!(await store.keyOk(hashToken(token)))) return { status: 401, json: { error: "Non autorizzato." } };
  const job = runLavori({ env, db: store, fetchImpl, now, sleep })
    .then((out) => out.json)
    .catch((e) => ({ errore: e?.message || "errore" }))
    .then((report) => store.saveReport(report).then(() => report))
    .catch((e) => console.warn("lavori: resoconto non salvato", e?.message));
  if (waitUntil) {
    waitUntil(job);
    return { status: 202, json: { avviato: true } };
  }
  return { status: 200, json: await job };
}
