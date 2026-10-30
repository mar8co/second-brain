// Chiamate alle funzioni server (/api/*), con il token di sessione Supabase.

import { supabase } from "./supabase.js";

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Token di sessione. `minTokenMs`: per i lavori che il server prosegue in
// background il token deve restare valido fino alla fine, altrimenti il server
// non riesce a scrivere il risultato. Se scade prima, viene rinnovato ora.
async function accessToken(minTokenMs) {
  const { data } = await supabase.auth.getSession();
  let session = data?.session;
  if (session && minTokenMs && (session.expires_at || 0) * 1000 - Date.now() < minTokenMs) {
    const r = await supabase.auth.refreshSession().catch(() => null);
    if (r?.data?.session) session = r.data.session;
  }
  return session?.access_token || null;
}

async function headersFor(minTokenMs) {
  const headers = { "content-type": "application/json" };
  if (supabase) {
    const token = await accessToken(minTokenMs);
    if (token) headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

async function post(path, body, { timeoutMs = 30000, minTokenMs = 0 } = {}) {
  const headers = await headersFor(minTokenMs);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
  } catch {
    throw new ApiError(0, navigator.onLine === false ? "Sei offline." : "Server non raggiungibile.");
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error || `Errore del server (${res.status}).`, data?.code);
  return data;
}

// Risposta in streaming (eventi SSE "data: {…}"): `onDelta` riceve ogni
// evento "delta" mentre arriva; restituisce l'evento "done" (senza type). Se
// il server risponde con un JSON normale (errore, versione precedente) vale
// quello, come per post().
async function postStream(path, body, onDelta, { timeoutMs = 45000 } = {}) {
  const headers = await headersFor(0);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    } catch {
      throw new ApiError(0, navigator.onLine === false ? "Sei offline." : "Server non raggiungibile.");
    }
    if (!/event-stream/i.test(res.headers.get("content-type") || "")) {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new ApiError(res.status, data?.error || `Errore del server (${res.status}).`, data?.code);
      return data;
    }
    let done = null;
    const line = (raw) => {
      const l = raw.trim();
      if (!l.startsWith("data:")) return;
      let ev;
      try {
        ev = JSON.parse(l.slice(5));
      } catch {
        return;
      }
      if (ev?.type === "delta") onDelta?.(ev);
      else if (ev?.type === "done") done = ev;
      else if (ev?.type === "error") throw new ApiError(ev.status || 502, ev.error || "Errore dal servizio AI.");
    };
    try {
      if (res.body?.getReader) {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            line(buf.slice(0, i));
            buf = buf.slice(i + 1);
          }
        }
        line(buf + dec.decode());
      } else {
        (await res.text()).split("\n").forEach(line);
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, ctrl.signal.aborted ? "Tempo scaduto: riprova." : "Risposta interrotta: riprova.");
    }
    if (!done) throw new ApiError(502, "Risposta interrotta: riprova.");
    const { type: _type, ...data } = done;
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // Trascrivere un Reel o leggere un carosello può richiedere qualche minuto.
  // Con `id` (modalità sincronizzata) i post social proseguono sul server e
  // la risposta è { background: true }.
  extract: (url, opts = {}) => post("/api/extract", { url, ...opts }, { timeoutMs: 295000, minTokenMs: opts.id ? 360_000 : 0 }),
  aiStatus: () => post("/api/ai", { action: "status" }, { timeoutMs: 10000 }),
  classify: (item, categories) => post("/api/ai", { action: "classify", item, categories }),
  // items: contenuto completo (di tutto l'archivio o dei più pertinenti);
  // memory: schede brevi degli altri; total: elementi nell'archivio;
  // history: turni precedenti [{ q, a }] per le domande di seguito.
  // onDelta (facoltativa): la risposta arriva parola per parola, con
  // { answer, sources } scritti finora a ogni pezzo.
  ask: (question, items, memory = [], total = items.length + memory.length, history = [], onDelta = null) =>
    onDelta
      ? postStream("/api/ai", { action: "ask", question, items, memory, total, history, stream: true }, onDelta, { timeoutMs: 45000 })
      : post("/api/ai", { action: "ask", question, items, memory, total, history }, { timeoutMs: 45000 }),
  // Domanda preparata dal server, che legge l'archivio dal database: si
  // mandano solo la domanda e i turni precedenti [{ q, a, sources }].
  askArchive: (question, history = [], onDelta = null) =>
    onDelta
      ? postStream("/api/ai", { action: "askArchive", question, history, stream: true }, onDelta, { timeoutMs: 50000 })
      : post("/api/ai", { action: "askArchive", question, history }, { timeoutMs: 50000 }),
  // Via di un locale dal nome (OpenStreetMap) → { query, found: { street } | null }.
  pushKey: () => post("/api/push", { action: "key" }, { timeoutMs: 15000 }),
  pushTest: () => post("/api/push", { action: "test" }, { timeoutMs: 20000 }),
  embed: (texts, taskType = "RETRIEVAL_DOCUMENT") => post("/api/ai", { action: "embed", texts, taskType }, { timeoutMs: 25000 }),
  geo: (place) => post("/api/geo", { place }, { timeoutMs: 15000 }),
  // Via e quartiere dal link di Google Maps di un locale → { found: { street, zona? } | null }.
  geoLink: (place, link) => post("/api/geo", { place, link }, { timeoutMs: 30000 }),
  thumb: (id, url) => post("/api/thumb", { id, url }, { timeoutMs: 20000 }),
};
