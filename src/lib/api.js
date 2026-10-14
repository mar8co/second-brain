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

async function post(path, body, { timeoutMs = 30000, minTokenMs = 0 } = {}) {
  const headers = { "content-type": "application/json" };
  if (supabase) {
    const token = await accessToken(minTokenMs);
    if (token) headers.authorization = `Bearer ${token}`;
  }
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
  ask: (question, items, memory = [], total = items.length + memory.length, history = []) =>
    post("/api/ai", { action: "ask", question, items, memory, total, history }, { timeoutMs: 45000 }),
  // Archivi grandi: quali elementi leggere per intero → { ids }.
  // Posizione di un posto dal nome (OpenStreetMap) → { query, found }.
  geo: (place) => post("/api/geo", { place }, { timeoutMs: 15000 }),
  select: (question, memory, history = []) => post("/api/ai", { action: "select", question, memory, history }, { timeoutMs: 25000 }),
};
