// Cronologia della chat (domande e risposte), fuori dai componenti: una
// risposta che arriva mentre si guarda l'Archivio non va persa. Resta in
// questo browser (localStorage), al massimo le ultime 60 domande.
import { useSyncExternalStore } from "react";

const LOG_KEY = "sb-chat-v1";
const MAX_LOG = 60;
const INTERRUPTED = { kind: "error", error: "domanda interrotta, riprova", sources: [], candidates: [] };

let log = null;
const listeners = new Set();

// All'avvio nessuna domanda è in corso: quelle rimaste in attesa (pagina
// chiusa o ricaricata prima della risposta) sono state interrotte.
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    return (Array.isArray(v) ? v : [])
      .filter((m) => m && typeof m.q === "string" && m.at)
      .map((m) => (m.pending || !m.result ? { ...m, pending: false, result: m.result || INTERRUPTED } : m));
  } catch {
    return [];
  }
}

export function getChatLog() {
  if (!log) log = load();
  return log;
}

export function updateChatLog(fn) {
  log = fn(getChatLog()).slice(-MAX_LOG);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* archiviazione locale non disponibile: la cronologia resta in memoria */
  }
  for (const l of listeners) l();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const useChatLog = () => useSyncExternalStore(subscribe, getChatLog);
