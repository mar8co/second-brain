// Swipe tra le schede vicine (foto, video, contenuti), come in Foto di iPhone:
// la scheda segue il dito e la vicina entra di lato, già pronta. Lasciando,
// si passa alla vicina se il gesto è abbastanza lungo o veloce, altrimenti la
// scheda torna al suo posto con una piccola molla. Ai bordi (nessuna vicina)
// il movimento è elastico. Le anteprime delle vicine esistono solo durante il
// gesto e l'animazione (`vicine`).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

// Spazio tra una scheda e la vicina mentre scorrono.
export const GAP = 40;
const USCITA = "cubic-bezier(0.22, 1, 0.36, 1)";
const MOLLA = "cubic-bezier(0.34, 1.25, 0.64, 1)";

const pocoMoto = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

// Elastico ai bordi, come lo scorrimento di iPhone: più si tira, meno si muove.
export function elastico(dx, larghezza) {
  const d = Math.max(1, larghezza);
  return Math.sign(dx) * (1 - 1 / ((Math.abs(dx) * 0.55) / d + 1)) * d;
}

// Lasciando il dito: si passa alla vicina? Gesto lungo (oltre il 22% della
// larghezza) o veloce nella stessa direzione, e non mentre si torna indietro.
export function passaOltre(dx, v, larghezza) {
  if (!dx) return false;
  const stessa = Math.sign(v) === Math.sign(dx);
  if (Math.abs(v) > 0.2 && !stessa) return false;
  return Math.abs(dx) > larghezza * 0.22 || (Math.abs(v) > 0.35 && Math.abs(dx) > 24);
}

// La scheda nuova, arrivata con lo swipe o le frecce, parte dall'inizio.
let arrivo = 0;
export function arrivoDaCarosello() {
  const ok = Date.now() - arrivo < 1500;
  arrivo = 0;
  return ok;
}

// Scheda che deve entrare scivolando (es. ripristinata con "Annulla"): da
// sinistra ("-") o da destra ("+"). Vale per poco, una volta per scheda.
let entrata = null;
export function chiediEntrata(id, lato) {
  entrata = { id, lato, at: Date.now() };
}
export function entrataScheda(id) {
  return entrata && entrata.id === id && Date.now() - entrata.at < 1500 ? entrata.lato : null;
}

export function useCarosello(ref, { prev, next, onGo, enabled = true }) {
  const [vicine, setVicine] = useState(false);
  const gesto = useRef(null);
  const inCorso = useRef(false);
  const nascondi = useRef(0);
  const opts = useRef({ prev, next, onGo });
  useLayoutEffect(() => {
    opts.current = { prev, next, onGo };
  });

  const sposta = useCallback(
    (x, ms = 0, ease = USCITA) => {
      const el = ref.current;
      if (!el) return;
      el.style.transition = ms ? `transform ${ms}ms ${ease}` : "none";
      el.style.transform = x ? `translate3d(${x}px,0,0)` : "";
    },
    [ref],
  );
  // Dove si trova la scheda in questo momento (anche a metà di un'animazione).
  const posizione = useCallback(() => {
    const t = ref.current ? getComputedStyle(ref.current).transform : "none";
    return t && t !== "none" ? new DOMMatrixReadOnly(t).m41 : 0;
  }, [ref]);

  // Anteprime delle vicine allineate alla parte di pagina che si vede
  // (--alto: quanto si è scesi, --sopra: dove inizia la scheda).
  const prepara = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    clearTimeout(nascondi.current);
    el.style.setProperty("--alto", `${window.scrollY}px`);
    el.style.setProperty("--sopra", `${el.getBoundingClientRect().top + window.scrollY}px`);
    el.style.willChange = "transform";
    flushSync(() => setVicine(true));
  }, [ref]);

  // Passa alla vicina: la scheda esce di lato mentre la vicina entra, poi si
  // cambia pagina (la scheda nuova è già al suo posto). `poi(to)` sostituisce
  // il cambio di pagina (es. dopo Elimina). Restituisce false se non c'è.
  const vai = useCallback(
    (dir, { v = 0, poi } = {}) => {
      const { prev: p, next: n, onGo: go } = opts.current;
      const to = dir === "next" ? n : p;
      if (!to || inCorso.current) return false;
      const fine = () => {
        arrivo = Date.now();
        if (poi) poi(to);
        else go(to, dir);
      };
      const el = ref.current;
      if (!el || pocoMoto()) {
        fine();
        return true;
      }
      inCorso.current = true;
      prepara();
      const larghezza = el.offsetWidth + GAP;
      const meta = dir === "next" ? -larghezza : larghezza;
      // Più veloce il dito, più rapido l'arrivo (tra 220 e 380 ms).
      const ms = Math.round(Math.min(380, Math.max(220, Math.abs(meta - posizione()) / Math.max(Math.abs(v), 1.6))));
      el.getBoundingClientRect();
      sposta(meta, ms);
      let fatto = false;
      const chiudi = () => {
        if (fatto) return;
        fatto = true;
        el.removeEventListener("transitionend", suFine);
        fine();
      };
      const suFine = (e) => e.target === el && e.propertyName === "transform" && chiudi();
      el.addEventListener("transitionend", suFine);
      setTimeout(chiudi, ms + 80);
      return true;
    },
    [ref, prepara, sposta, posizione],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    const inizio = (e) => {
      gesto.current = null;
      if (inCorso.current || e.touches.length > 1) return;
      const t = e.touches[0];
      // Non sui comandi del video né sui campi; non dai bordi dello schermo,
      // dove parte il gesto Indietro di iPhone.
      if (e.target.closest?.("video, input, textarea, select") || t.clientX < 20 || t.clientX > window.innerWidth - 20) return;
      // Ripresa mentre la scheda torna al suo posto: si ferma dov'è, senza salti.
      const base = posizione();
      if (base) sposta(base);
      gesto.current = { x: t.clientX, y: t.clientY, base, asse: null, punti: [[e.timeStamp, t.clientX]] };
    };
    const movimento = (e) => {
      const g = gesto.current;
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.asse) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.asse = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
        if (g.asse === "x") prepara();
        else if (g.base) torna();
      }
      if (g.asse !== "x") return;
      if (e.cancelable) e.preventDefault();
      g.punti.push([e.timeStamp, t.clientX]);
      if (g.punti.length > 8) g.punti.shift();
      const { prev: p, next: n } = opts.current;
      const x = g.base + dx;
      sposta((x < 0 ? n : p) ? x : elastico(x, el.offsetWidth));
    };
    const fine = (e) => {
      const g = gesto.current;
      gesto.current = null;
      const t = e.changedTouches?.[0];
      if (!g || !t) return;
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.asse) {
        // Gesto rapido senza movimenti intermedi.
        if (Math.abs(dx) >= 60 && Math.abs(dx) >= Math.abs(dy) * 1.5 && vai(dx < 0 ? "next" : "prev")) return;
        if (g.base) torna();
        return;
      }
      if (g.asse !== "x") return;
      // Velocità sugli ultimi 100 ms (px/ms).
      const vecchio = g.punti.find(([ts]) => e.timeStamp - ts <= 100) || g.punti[0];
      const v = (t.clientX - vecchio[1]) / Math.max(16, e.timeStamp - vecchio[0]);
      const x = g.base + dx;
      if (passaOltre(x, v, el.offsetWidth) && vai(x < 0 ? "next" : "prev", { v })) return;
      torna();
    };
    const torna = () => {
      sposta(0, 380, MOLLA);
      clearTimeout(nascondi.current);
      nascondi.current = setTimeout(() => {
        if (gesto.current?.asse === "x" || inCorso.current) return;
        el.style.transition = "";
        el.style.willChange = "";
        setVicine(false);
      }, 400);
    };
    const annullato = () => {
      if (gesto.current?.asse === "x" || gesto.current?.base) torna();
      gesto.current = null;
    };
    el.addEventListener("touchstart", inizio, { passive: true });
    el.addEventListener("touchmove", movimento, { passive: false });
    el.addEventListener("touchend", fine);
    el.addEventListener("touchcancel", annullato);
    return () => {
      el.removeEventListener("touchstart", inizio);
      el.removeEventListener("touchmove", movimento);
      el.removeEventListener("touchend", fine);
      el.removeEventListener("touchcancel", annullato);
    };
  }, [ref, enabled, prepara, sposta, posizione, vai]);

  useEffect(() => () => clearTimeout(nascondi.current), []);

  return { vai, vicine };
}
