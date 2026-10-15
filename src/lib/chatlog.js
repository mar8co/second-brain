// Cronologia della chat (domande e risposte), fuori dai componenti: una
// risposta che arriva mentre si guarda l'Archivio non va persa. Resta in
// questo browser (localStorage), al massimo le ultime 60 domande. Con l'account
// sincronizzato la copia sta anche sul server (tabella chat_log, una riga per
// utente), così la stessa chat si ritrova da tutti i dispositivi.
import { useSyncExternalStore } from "react";

const LOG_KEY = "sb-chat-v1";
const MAX_LOG = 60;
const INTERRUPTED = { kind: "error", error: "domanda interrotta, riprova", sources: [], candidates: [] };

let log = null;
const listeners = new Set();

// Domande rimaste in attesa (pagina chiusa o ricaricata prima della risposta)
// sono state interrotte.
function clean(list) {
  return (Array.isArray(list) ? list : [])
    .filter((m) => m && typeof m.q === "string" && m.at)
    .map((m) => (m.pending || !m.result ? { ...m, pending: false, result: m.result || INTERRUPTED } : m))
    .slice(-MAX_LOG);
}

function load() {
  try {
    return clean(JSON.parse(localStorage.getItem(LOG_KEY) || "[]"));
  } catch {
    return [];
  }
}

export function getChatLog() {
  if (!log) log = load();
  return log;
}

function setLog(next) {
  log = next;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* archiviazione locale non disponibile: la cronologia resta in memoria */
  }
  for (const l of listeners) l();
}

export function updateChatLog(fn) {
  setLog(fn(getChatLog()).slice(-MAX_LOG));
  if (sync) saveSoon();
}

// Sincronizzazione con l'account. Se il server ha già una chat, vince quella
// (così "Pulisci chat" fatto da un altro dispositivo vale anche qui); se non
// c'è ancora, si carica quella di questo dispositivo.
let sync = null; // { supabase, userId, timer }
const SAVE_DELAY_MS = 800;

export async function startChatSync(supabase, userId) {
  if (!supabase || !userId) return;
  if (sync?.timer) clearTimeout(sync.timer);
  sync = null;
  try {
    const { data, error } = await supabase.from("chat_log").select("messages").eq("user_id", userId).maybeSingle();
    if (error) return; // senza server resta la copia del dispositivo
    sync = { supabase, userId, timer: null };
    if (data && Array.isArray(data.messages)) setLog(clean(data.messages));
    else saveSoon(0);
  } catch {
    /* rete assente: la chat resta su questo dispositivo */
  }
}

// Uscita dall'account: la chat non resta su questo dispositivo per il prossimo.
export function stopChatSync() {
  if (sync?.timer) clearTimeout(sync.timer);
  sync = null;
  log = [];
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    /* niente da pulire */
  }
  for (const l of listeners) l();
}

function saveSoon(delay = SAVE_DELAY_MS) {
  if (!sync) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(async () => {
    const current = sync;
    if (!current) return;
    try {
      await current.supabase
        .from("chat_log")
        .upsert({ user_id: current.userId, messages: getChatLog(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    } catch {
      /* senza rete la prossima modifica riprova */
    }
  }, delay);
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const useChatLog = () => useSyncExternalStore(subscribe, getChatLog);
