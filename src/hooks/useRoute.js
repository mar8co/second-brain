// Router minimo basato sulla History API: poche schermate, nessuna dipendenza.
import { useCallback, useEffect, useState } from "react";

function read() {
  return { path: window.location.pathname, query: new URLSearchParams(window.location.search) };
}

export function useRoute() {
  const [loc, setLoc] = useState(read);

  useEffect(() => {
    const on = () => setLoc(read());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (to === window.location.pathname + window.location.search) return;
    window.history[replace ? "replaceState" : "pushState"]({}, "", to);
    setLoc(read());
    if (!replace) window.scrollTo(0, 0);
  }, []);

  const back = useCallback((fallback = "/") => {
    // Se si è entrati direttamente su una scheda (es. da Comandi Rapidi) non
    // c'è una pagina precedente dell'app: si va alla home.
    if (window.history.state && window.history.length > 1) window.history.back();
    else navigate(fallback, { replace: true });
  }, [navigate]);

  return { ...loc, navigate, back };
}
