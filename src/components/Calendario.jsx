// Calendario dell'app per scegliere un periodo: si tocca il primo giorno e poi
// l'ultimo, senza chiudere niente. Toccando il mese si sceglie mese e anno.
import { useRef, useState } from "react";
import { GIORNI_SETTIMANA, MESI, MESI_BREVI, isoDay, monthGrid, parseDay, pickDay } from "../lib/calendar.js";

export default function Calendario({ from, to, onChange }) {
  const start = parseDay(from) || parseDay(to) || new Date();
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [phase, setPhase] = useState(from && !to ? "fine" : "inizio");
  const [scegliMese, setScegliMese] = useState(false);
  const [anno, setAnno] = useState(view.y);
  const [verso, setVerso] = useState("");
  const touch = useRef(null);

  const today = isoDay(new Date());
  const days = monthGrid(view.y, view.m);
  const sposta = (delta) => {
    const d = new Date(view.y, view.m + delta, 1);
    setVerso(delta > 0 ? "destra" : "sinistra");
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };
  const tocca = (day) => {
    const s = pickDay({ from, to }, day, phase);
    setPhase(s.phase);
    onChange({ from: s.from, to: s.to });
  };
  const titolo = MESI[view.m][0].toUpperCase() + MESI[view.m].slice(1);
  // Il periodo scelto si legge già nella riga "Periodo": qui solo cosa fare.
  const stato = phase === "fine" && from && !to ? "Ora tocca l'ultimo giorno" : from || to ? "" : "Tocca il primo giorno";

  return (
    <div className="calendario-filtro">
      <div className="mese-testa">
        <button
          type="button"
          className="mese-titolo"
          aria-expanded={scegliMese}
          aria-label={`${titolo} ${view.y}: scegli mese e anno`}
          onClick={() => {
            setAnno(view.y);
            setScegliMese((o) => !o);
          }}
        >
          <span>{titolo}</span> <small className="num">{view.y}</small>
          <span aria-hidden="true" className="mese-segno">{scegliMese ? "−" : "+"}</span>
        </button>
        {!scegliMese && (
          <div className="flex gap-2">
            <button type="button" className="tondo" aria-label="Mese prima" onClick={() => sposta(-1)}>‹</button>
            <button type="button" className="tondo" aria-label="Mese dopo" onClick={() => sposta(1)}>›</button>
          </div>
        )}
      </div>

      {scegliMese ? (
        <div className="scegli-mese">
          <div className="flex items-center justify-between">
            <button type="button" className="tondo" aria-label="Anno prima" onClick={() => setAnno((a) => a - 1)}>‹</button>
            <span className="num text-[1.4rem] font-extrabold tracking-[-0.04em]" aria-live="polite">{anno}</span>
            <button type="button" className="tondo" aria-label="Anno dopo" onClick={() => setAnno((a) => a + 1)}>›</button>
          </div>
          <div className="griglia-mesi" role="group" aria-label={`Mesi del ${anno}`}>
            {MESI_BREVI.map((nome, m) => (
              <button
                key={nome}
                type="button"
                className={`pillola${anno === view.y && m === view.m ? " attiva" : ""}`}
                aria-label={`${MESI[m]} ${anno}`}
                onClick={() => {
                  setVerso("");
                  setView({ y: anno, m });
                  setScegliMese(false);
                }}
              >
                {nome}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          key={`${view.y}-${view.m}`}
          className={`calendario ${verso ? `entra-${verso}` : ""}`}
          onTouchStart={(e) => {
            const t = e.touches[0];
            touch.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            if (!touch.current) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - touch.current.x;
            const dy = t.clientY - touch.current.y;
            touch.current = null;
            if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) sposta(dx < 0 ? 1 : -1);
          }}
        >
          {GIORNI_SETTIMANA.map((g, i) => (
            <span key={i} aria-hidden="true" className={`intestazione${i > 4 ? " weekend" : ""}`}>{g}</span>
          ))}
          {days.map((d) => {
            const iso = isoDay(d);
            const fuori = d.getMonth() !== view.m;
            const end = to || (phase === "fine" ? "" : from);
            const isStart = iso === from;
            const isEnd = iso === end;
            const dentro = from && end && iso >= from && iso <= end;
            const cls = [
              "giorno",
              fuori && "fuori",
              iso === today && "oggi",
              (isStart || isEnd) && "scelto",
              dentro && from !== end && "fascia",
              dentro && isStart && "inizio",
              dentro && isEnd && "fine",
            ].filter(Boolean).join(" ");
            const nome = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            return (
              <button
                key={iso}
                type="button"
                className={cls}
                tabIndex={fuori ? -1 : 0}
                disabled={fuori}
                aria-pressed={Boolean(isStart || isEnd)}
                aria-label={`${nome}${isStart ? ", primo giorno" : ""}${isEnd && !isStart ? ", ultimo giorno" : ""}`}
                onClick={() => tocca(iso)}
              >
                <span className="cerchio num">{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex min-h-[36px] items-center justify-between gap-3 pb-2 pt-1">
        <p className={`text-[0.95rem] font-bold tracking-[-0.02em]${phase === "fine" && from && !to ? " pulsa-testo" : ""}`} aria-live="polite">{stato}</p>
        {(from || to) && (
          <button
            type="button"
            className="link rosso text-[0.85rem]"
            onClick={() => {
              setPhase("inizio");
              onChange({ from: "", to: "" });
            }}
          >
            Togli date
          </button>
        )}
      </div>
    </div>
  );
}
