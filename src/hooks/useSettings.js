// Preferenze locali del dispositivo (non sincronizzate).
import { useCallback, useState } from "react";

const KEY = "second-brain-settings";
const DEFAULTS = { autoAi: true };

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(load);
  const update = useCallback((patch) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage pieno o disattivato: la preferenza vale solo per la sessione */
      }
      return next;
    });
  }, []);
  return [settings, update];
}
