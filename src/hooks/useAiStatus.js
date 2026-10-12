// Chiede al server se l'AI (Gemini) è configurata. Nessuna chiave nel client.
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export function useAiStatus(enabled = true) {
  const [state, setState] = useState({ ai: null, model: null, error: null });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api
      .aiStatus()
      .then((r) => alive && setState({ ai: Boolean(r.ai), model: r.model, error: null }))
      .catch((e) => alive && setState({ ai: false, model: null, error: e.message }));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}
