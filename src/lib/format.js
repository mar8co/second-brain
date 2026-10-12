// Piccole funzioni di formattazione condivise dalle schermate.
import { TYPES } from "./constants.js";

export const typeLabel = (t) => TYPES[t]?.label || "Elemento";

// Una domanda "sembra" tale se finisce con ? o inizia con una parola interrogativa.
export function looksLikeQuestion(q) {
  return /\?\s*$/.test(q) || /^(dove|cosa|che|quale|quali|quando|come|chi|quanto|perch[eé]|mi\s+ricordi|avevo)\b/i.test(q.trim());
}

export function formatDate(iso, withTime = false) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}
