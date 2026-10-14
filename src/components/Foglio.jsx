// Scheda che sale dal basso e messaggio dell'app (al posto di confirm del
// sistema). Si chiude toccando fuori o trascinandola giù, mai con una X; il
// tocco fuori non attiva niente di quello che c'è sotto.
import { useCallback, useEffect, useRef, useState } from "react";

export function Foglio({ label, color, onClose, children }) {
  const [esce, setEsce] = useState(false);
  const ref = useRef(null);
  const drag = useRef(null);
  const closing = useRef(false);

  const chiudi = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setEsce(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Dietro la scheda la pagina non scorre.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && chiudi();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chiudi]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Trascinare giù: parte solo col contenuto in cima, direzione decisa dopo 6 px.
  const onPointerDown = (e) => {
    if (ref.current.scrollTop > 0 || e.button > 0) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dir: null, d: 0 };
  };
  const onPointerMove = (e) => {
    const g = drag.current;
    if (!g) return;
    const dy = e.clientY - g.y;
    const dx = e.clientX - g.x;
    if (!g.dir) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      g.dir = dy > 0 && Math.abs(dy) > Math.abs(dx) ? "giu" : "no";
      if (g.dir === "giu") ref.current.setPointerCapture?.(e.pointerId);
    }
    if (g.dir !== "giu") return;
    g.d = Math.max(0, dy);
    ref.current.style.transition = "none";
    ref.current.style.transform = `translateY(${g.d}px)`;
  };
  const onPointerUp = () => {
    const g = drag.current;
    drag.current = null;
    if (!g || g.dir !== "giu") return;
    const el = ref.current;
    const v = g.d / Math.max(1, performance.now() - g.t);
    el.style.transition = "transform .22s cubic-bezier(.2, .8, .2, 1)";
    if (g.d > 110 || (v > 0.6 && g.d > 30)) {
      closing.current = true;
      el.style.transform = "translateY(110%)";
      setTimeout(onClose, 220);
    } else {
      el.style.transform = "";
    }
  };

  const fuori = (e) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    e.stopPropagation();
    chiudi();
  };

  return (
    <div className={`velo${esce ? " esce" : ""}`}>
      <div className="zona-foglio" onClick={fuori}>
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className="foglio pieno outline-none"
          style={color ? { "--c": color } : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="maniglia" aria-hidden="true" />
          {children}
        </div>
      </div>
    </div>
  );
}

// Una domanda e due risposte: Annulla a sinistra, conferma a destra (rossa se
// toglie qualcosa).
export function Domanda({ titolo, testo, si, rosso = false, color, onSi, onClose }) {
  return (
    <Foglio label={titolo} color={color} onClose={onClose}>
      <h2 className="domanda-titolo">{titolo}</h2>
      {testo && <p className="domanda-testo">{testo}</p>}
      <div className="mt-[30px] grid grid-cols-2 gap-2">
        <button type="button" className="bottone chiaro" onClick={onClose}>
          Annulla
        </button>
        <button
          type="button"
          className={`bottone${rosso ? " rosso" : ""}`}
          onClick={() => {
            onClose();
            onSi();
          }}
        >
          {si}
        </button>
      </div>
    </Foglio>
  );
}
