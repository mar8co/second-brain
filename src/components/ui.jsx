// Componenti di base condivisi dalle schermate.
import { useId, useState } from "react";
import { Clapperboard, FileText, Image as ImageIcon, Link2, MapPin, Play, ShoppingBag, Sparkles, StickyNote } from "lucide-react";
import { STATUSES } from "../lib/constants.js";

const TYPE_ICONS = {
  link: Link2,
  social: Clapperboard,
  video: Play,
  place: MapPin,
  note: StickyNote,
  shopping: ShoppingBag,
  image: ImageIcon,
  file: FileText,
};

// Icone a tratto spesso, come vogliono le linee guida.
export function TypeIcon({ type, className = "h-5 w-5" }) {
  const Icon = TYPE_ICONS[type] || Link2;
  return <Icon className={className} strokeWidth={2.5} aria-hidden="true" />;
}

// Pallino dello stato, con il filo dell'inchiostro: si legge su ogni colore
// (vuoto = solo salvato, pieno = analizzato, metà = parziale, rosso = non
// accessibile, pulsa = in elaborazione).
const STATUS_DOT = {
  saved: "transparent",
  processing: "transparent",
  analyzed: "var(--inchiostro)",
  partial: "linear-gradient(90deg, var(--inchiostro) 50%, transparent 50%)",
  inaccessible: "#e02a0d",
};

function Dot({ status }) {
  return (
    <i
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${status === "processing" ? "pulsa" : ""}`}
      style={{ background: STATUS_DOT[status] || STATUS_DOT.saved, boxShadow: `0 0 0 ${status === "processing" ? 2.5 : 1.5}px var(--inchiostro)` }}
    />
  );
}

export function StatusBadge({ status, compact = false }) {
  const label = STATUSES[status]?.label || "Salvato";
  if (compact) {
    return (
      <span className="inline-flex p-1" title={label}>
        <Dot status={status} />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" title={STATUSES[status]?.hint}>
      <Dot status={status} />
      {label}
    </span>
  );
}

export function AiBadge({ children = "Suggerito dall'AI" }) {
  return (
    <span className="cartellino">
      <Sparkles className="h-3 w-3" strokeWidth={2.6} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Spinner({ label = "Carico…" }) {
  return (
    <p role="status" className="grande py-16 text-center">
      {label}
    </p>
  );
}

// Stato vuoto: una frase grande e cosa basta fare.
export function EmptyState({ title, children, action }) {
  return (
    <div className="pb-2 pt-7">
      <h2 className="grande">{title}</h2>
      {children && <p className="mt-2.5 max-w-sm font-medium text-tenue">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBox({ children, onRetry }) {
  return (
    <div role="alert" className="py-1">
      <p className="errore">{children}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="link">
          Riprova
        </button>
      )}
    </div>
  );
}

// Editor di etichette (categorie o tag): pillole nere da togliere + campo con
// suggerimenti. Invio o virgola aggiunge.
export function ChipEditor({ label, values, onChange, suggestions = [], placeholder, lowercase = false }) {
  const id = useId();
  const [text, setText] = useState("");
  const norm = (s) => (lowercase ? s.toLowerCase() : s).trim().replace(/\s+/g, " ");
  const add = (raw) => {
    const v = norm(raw);
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setText("");
  };
  const remaining = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));
  const filtered = text ? remaining.filter((s) => s.toLowerCase().includes(text.toLowerCase())) : remaining;
  return (
    <div>
      <label htmlFor={id} className="etichetta">{label}</label>
      {values.length > 0 && (
        <ul className="mb-1 mt-1.5 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li key={v}>
              <button type="button" className="pillola attiva" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Rimuovi ${v}`}>
                {v} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        className="campo piccolo"
        value={text}
        placeholder={placeholder}
        enterKeyHint="done"
        autoComplete="off"
        autoCapitalize={lowercase ? "none" : "sentences"}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v.slice(0, -1));
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (text.trim()) add(text);
          }
        }}
        onBlur={() => text.trim() && add(text)}
      />
      {filtered.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Suggerimenti per ${label}`}>
          {filtered.slice(0, 12).map((s) => (
            <button key={s} type="button" className="pillola" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
