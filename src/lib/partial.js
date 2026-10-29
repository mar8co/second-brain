// Risposte della chat mentre arrivano (parola per parola), per id del
// messaggio: { answer, sources }. Restano solo in memoria: nella cronologia
// (sincronizzata con il server) va soltanto la risposta completa.
import { useSyncExternalStore } from "react";

const partials = new Map();
const listeners = new Set();

export function setPartial(id, value) {
  if (value) partials.set(id, value);
  else if (!partials.delete(id)) return;
  listeners.forEach((l) => l());
}

export const getPartial = (id) => (id ? partials.get(id) || null : null);

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePartial(id) {
  return useSyncExternalStore(subscribe, () => getPartial(id));
}
