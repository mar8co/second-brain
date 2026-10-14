// Riga dell'elenco: copertina (o il colore dell'elemento con l'icona del tipo),
// fonte e data in piccolo, titolo grande, in basso categorie e stato.
import { useState } from "react";
import { displayTitle } from "../lib/item.js";
import { displayHost } from "../lib/detect.js";
import { itemColor } from "../lib/colors.js";
import { StatusBadge, TypeIcon } from "./ui.jsx";
import { formatDate, typeLabel } from "../lib/format.js";

// Copertina in piccolo (Reel, video, link con immagine); se manca o non si
// carica più (i link delle copertine social scadono) resta il quadrato del
// colore dell'elemento con l'icona del tipo.
export function Thumb({ item, size = "h-14 w-14" }) {
  const [failed, setFailed] = useState(false);
  const url = item.image_url;
  if (url && !failed && /^https?:\/\//.test(url)) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${size} shrink-0 rounded-xl object-cover`}
        style={{ background: itemColor(item) }}
      />
    );
  }
  return (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-xl text-[#0a0a0a]`} style={{ background: itemColor(item), boxShadow: "inset 0 0 0 1.5px #0a0a0a" }}>
      <TypeIcon type={item.type} className="h-6 w-6" />
    </div>
  );
}

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
      className="flex gap-3 py-3.5 active:opacity-70"
    >
      <Thumb item={item} />
      <div className="min-w-0 flex-1">
        <p className="micro flex items-center gap-1.5">
          <span className="sr-only">{typeLabel(item.type)} · </span>
          <span className="truncate">{source}</span>
          <span aria-hidden="true">·</span>
          <time className="num shrink-0" dateTime={item.created_at}>{formatDate(item.created_at)}</time>
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-[1.15rem] font-extrabold leading-[1.08] tracking-[-0.035em]">{title}</h3>
        {snippet && <p className="mt-1 line-clamp-2 text-[0.9rem] font-medium leading-snug text-tenue">{snippet}</p>}
        {/* In basso: categorie e, alla loro destra, lo stato. */}
        <p className="mt-1.5 flex flex-wrap items-center gap-1">
          {(item.categories || []).slice(0, 3).map((c) => (
            <span key={c} className="cartellino">{c}</span>
          ))}
          <StatusBadge status={item.status} compact />
        </p>
      </div>
    </a>
  );
}

export function ItemList({ items, onOpen }) {
  return (
    <ul className="righe">
      {items.map((it) => (
        <li key={it.id}>
          <ItemCard item={it} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}
