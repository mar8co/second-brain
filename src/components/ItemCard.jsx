// Riga dell'elenco: tipo, titolo, fonte, data e stato.
import { displayTitle } from "../lib/item.js";
import { displayHost } from "../lib/detect.js";
import { StatusBadge, TypeIcon } from "./ui.jsx";
import { formatDate, typeLabel } from "../lib/format.js";

export function ItemCard({ item, onOpen }) {
  const title = displayTitle(item);
  const site = item.site_name || (item.url ? displayHost(item.url) : item.file_name ? "File caricato" : typeLabel(item.type));
  const source = item.author ? `${site} · ${item.author}` : site;
  // Niente ripetizioni: se il titolo è ricavato dalla nota, non la ripetiamo sotto.
  const snippet = [item.description, item.note, item.ai?.summary].find((t) => t && !t.startsWith(title)) || "";
  return (
    <a
      href={`/elemento/${item.id}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        onOpen(item);
      }}
      className="card flex gap-3 p-3.5 transition active:bg-sunken"
    >
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <TypeIcon type={item.type} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-semibold leading-snug">{title}</h3>
          <StatusBadge status={item.status} compact />
        </div>
        {snippet && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{snippet}</p>}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span className="sr-only">{typeLabel(item.type)} · </span>
          <span className="truncate">{source}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
          {(item.categories || []).slice(0, 2).map((c) => (
            <span key={c} className="rounded-full bg-sunken px-2 py-0.5 text-ink/80">{c}</span>
          ))}
        </p>
      </div>
    </a>
  );
}

export function ItemList({ items, onOpen }) {
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.id}>
          <ItemCard item={it} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}
