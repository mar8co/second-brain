// Componenti di base condivisi dalle schermate.
import { useId, useState } from "react";
import {
  AlertCircle, CheckCircle2, CircleDashed, FileText, Image as ImageIcon, Link2, Loader2, Lock, MapPin,
  Play, ShoppingBag, Sparkles, StickyNote, X, Clapperboard,
} from "lucide-react";
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

export function TypeIcon({ type, className = "h-5 w-5" }) {
  const Icon = TYPE_ICONS[type] || Link2;
  return <Icon className={className} aria-hidden="true" />;
}

const STATUS_STYLE = {
  saved: ["text-muted", CheckCircle2],
  processing: ["text-accent", Loader2],
  analyzed: ["text-ok", CheckCircle2],
  partial: ["text-warn", CircleDashed],
  inaccessible: ["text-bad", Lock],
};

export function StatusBadge({ status, compact = false }) {
  const [color, Icon] = STATUS_STYLE[status] || STATUS_STYLE.saved;
  const label = STATUSES[status]?.label || "Salvato";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`} title={STATUSES[status]?.hint}>
      <Icon className={`h-3.5 w-3.5 ${status === "processing" ? "animate-spin" : ""}`} aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}

export function AiBadge({ children = "Suggerito dall'AI" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ai/10 px-2 py-0.5 text-xs font-medium text-ai">
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Spinner({ label = "Caricamento…" }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-muted">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon = Sparkles, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 rounded-2xl bg-accent-soft p-4 text-accent">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <p className="mt-1.5 max-w-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBox({ children, onRetry }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-bad/30 bg-bad/5 p-3.5 text-sm">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden="true" />
      <div className="flex-1">
        <p>{children}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-2 font-medium text-accent underline underline-offset-2">
            Riprova
          </button>
        )}
      </div>
    </div>
  );
}

// Editor di etichette (categorie o tag): chip rimovibili + campo di inserimento
// con suggerimenti. Invio o virgola aggiunge.
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
      <label htmlFor={id} className="label">{label}</label>
      {values.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li key={v}>
              <button type="button" className="chip-on" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Rimuovi ${v}`}>
                {v}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        className="input"
        value={text}
        placeholder={placeholder}
        enterKeyHint="done"
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
            <button key={s} type="button" className="chip text-muted" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
