// Chiamate alle funzioni server (/api/*), con il token di sessione Supabase.

import { supabase } from "./supabase.js";

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function post(path, body, { timeoutMs = 30000 } = {}) {
  const headers = { "content-type": "application/json" };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) headers.authorization = `Bearer ${data.session.access_token}`;
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
  extract: (url) => post("/api/extract", { url }),
  aiStatus: () => post("/api/ai", { action: "status" }, { timeoutMs: 10000 }),
  classify: (item, categories) => post("/api/ai", { action: "classify", item, categories }),
  ask: (question, items) => post("/api/ai", { action: "ask", question, items }, { timeoutMs: 45000 }),
};
