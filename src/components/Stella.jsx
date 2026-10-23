// Stellina Preferiti: piena se l'elemento è tra i preferiti.
import { useContext } from "react";
import { Star } from "lucide-react";
import { PreferitiContext } from "../lib/preferiti.js";

export default function Stella({ item, className = "", size = 18 }) {
  const toggle = useContext(PreferitiContext);
  if (!toggle) return null;
  const on = Boolean(item.favorite);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Togli dai preferiti" : "Aggiungi ai preferiti"}
      className={`stella grid shrink-0 place-items-center ${className}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(item);
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Star style={{ width: size, height: size }} fill={on ? "currentColor" : "none"} strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}
