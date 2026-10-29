// Schermata di avvio: il cervello dell'icona si compone (lobi che spuntano,
// pieghe che si disegnano), poi sale "second-brain". Finché si carica il
// cervello respira; a caricamento finito tutto si allarga e sfuma.
import { useEffect, useState, useSyncExternalStore } from "react";
import { avvioTenuto, seguiAvvio } from "../lib/avvio.js";

// Nei test automatici non si aspetta l'animazione.
const MINIMO = typeof navigator !== "undefined" && navigator.webdriver ? 0 : 1250;
const USCITA = 450;
const t0 = typeof performance !== "undefined" ? performance.now() : 0;

// Stessa forma di public/icon.svg; l'ordine dà il ritmo con cui spuntano i lobi.
const LOBI = [
  [214, 256, 70], [298, 256, 70], [196, 168, 66], [316, 168, 66], [140, 236, 62],
  [372, 236, 62], [150, 318, 62], [362, 318, 62], [214, 356, 56], [298, 356, 56],
];
const PIEGHE = [
  "M256 96 V 420", "M150 186 q 44 -2 52 44", "M232 124 q -34 34 -2 70", "M96 284 q 40 -22 74 2 q 22 16 50 2",
  "M196 418 q 0 -40 40 -50", "M280 124 q 36 28 6 70", "M416 226 q -46 0 -62 40", "M292 304 q 28 -28 72 -10", "M318 418 q -2 -38 -40 -50",
];

export default function Avvio() {
  const tenuto = useSyncExternalStore(seguiAvvio, avvioTenuto);
  const [fase, setFase] = useState("dentro");
  const [lento, setLento] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLento(true), 3500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (tenuto || fase !== "dentro") return undefined;
    const t = setTimeout(() => setFase("esce"), Math.max(0, MINIMO - (performance.now() - t0)));
    return () => clearTimeout(t);
  }, [tenuto, fase]);
  useEffect(() => {
    if (fase !== "esce") return undefined;
    const t = setTimeout(() => setFase("finito"), MINIMO ? USCITA : 0);
    return () => clearTimeout(t);
  }, [fase]);
  if (fase === "finito") return null;
  return (
    <div className={`avvio ${fase === "esce" ? "esce" : ""}`} role="status" aria-label="Carico la tua memoria…">
      <div className="avvio-centro">
        <svg viewBox="80 80 352 352" className="avvio-cervello" aria-hidden="true">
          <g className="avvio-respira">
            <g fill="#0a0a0a">
              {LOBI.map(([cx, cy, r], i) => (
                <circle key={i} cx={cx} cy={cy} r={r} className="avvio-lobo" style={{ animationDelay: `${60 + i * 45}ms` }} />
              ))}
            </g>
            <g fill="none" stroke="#ffb5d0" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round">
              {PIEGHE.map((d, i) => (
                <path key={i} d={d} pathLength="1" className="avvio-piega" style={{ animationDelay: `${520 + i * 40}ms` }} />
              ))}
            </g>
          </g>
        </svg>
        <p className="avvio-nome" aria-hidden="true">
          <span>second-brain</span>
        </p>
        <p className={`avvio-lento ${lento ? "vedi" : ""}`} aria-hidden="true">
          Carico la tua memoria…
        </p>
      </div>
    </div>
  );
}
