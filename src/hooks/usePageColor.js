// Ogni schermata ha il suo colore pieno, che colora anche la barra di stato
// dell'iPhone (theme-color). Il colore reale si legge da un elemento di prova,
// perché quello del body in quel momento è ancora in transizione.
import { useLayoutEffect } from "react";

export function usePageColor(color, { pieno = true, scuro = false } = {}) {
  useLayoutEffect(() => {
    const body = document.body;
    body.style.setProperty("--sfondo", color);
    body.classList.toggle("pieno", pieno);
    body.classList.toggle("pieno-scuro", pieno && scuro);
    const prova = document.createElement("i");
    prova.style.cssText = `position:absolute;visibility:hidden;background:${color}`;
    body.append(prova);
    const reale = getComputedStyle(prova).backgroundColor;
    prova.remove();
    let metas = document.querySelectorAll('meta[name="theme-color"]');
    if (!metas.length) {
      const m = document.createElement("meta");
      m.name = "theme-color";
      document.head.append(m);
      metas = [m];
    }
    for (const m of metas) m.content = reale;
      return () => body.classList.remove("pieno-scuro");
  }, [color, pieno, scuro]);
}
