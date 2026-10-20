// Riga dell'elenco: copertina (o il colore dell'elemento con l'icona del tipo),
// fonte e data in piccolo, titolo grande, in basso stato e categorie. In vista
// a box, ogni elemento è una copertina con il titolo sotto.
import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { rememberThumb } from "../lib/thumbs.js";
import { hasFileCover, useFileUrl } from "../lib/fileurl.js";
import { displayTitle } from "../lib/item.js";
import { displayHost, mapTileUrl } from "../lib/detect.js";
import { itemColor } from "../lib/colors.js";
import { StatusBadge, TypeIcon } from "./ui.jsx";
import { formatDate, typeLabel } from "../lib/format.js";
import { copyText } from "../lib/clipboard.js";

// Copertina in piccolo (Reel, video, link con immagine); se manca o non si
// carica più (i link delle copertine social scadono) resta il quadrato del
// colore dell'elemento con l'icona del tipo.
export function Thumb(props) {
  return hasFileCover(props.item) ? <FileCover {...props} /> : <LinkThumb {...props} />;
}

// Foto e video caricati: la copertina è il file stesso (per i video, il primo fotogramma).
function FileCover({ item, size = "h-14 w-14", rounded = "rounded-xl" }) {
  const url = useFileUrl(item);
  const video = /^video\//.test(item.file_mime || "");
  const cls = `${size} shrink-0 ${rounded} object-cover`;
  if (!url) return <LinkThumbFallback item={item} size={size} rounded={rounded} />;
  return video ? (
    <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className={cls} style={{ background: itemColor(item) }} aria-hidden="true" />
  ) : (
    <img src={url} alt="" loading="lazy" className={cls} style={{ background: itemColor(item) }} />
  );
}

function LinkThumbFallback({ item, size, rounded }) {
  return (
    <div className={`${size} flex shrink-0 items-center justify-center ${rounded} text-[#0a0a0a]`} style={{ background: itemColor(item), boxShadow: "inset 0 0 0 1.5px #0a0a0a" }}>
      <TypeIcon type={item.type} className="h-6 w-6" />
    </div>
  );
}

function LinkThumb({ item, size = "h-14 w-14", rounded = "rounded-xl" }) {
  // Se il CDN non risponde subito si riprova una volta dopo un attimo.
  const [tries, setTries] = useState(0);
  // Senza copertina propria, i posti con coordinate mostrano la loro mappa.
  const url = item.image_url || (item.type === "place" ? mapTileUrl(item.place) : null);
  if (url && tries < 2 && /^https?:\/\//.test(url)) {
    return (
      <img
        key={tries}
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => rememberThumb(url)}
        onError={() => (tries === 0 ? setTimeout(() => setTries(1), 1500) : setTries(2))}
        className={`${size} shrink-0 ${rounded} object-cover`}
        style={{ background: itemColor(item) }}
      />
    );
  }
  return <LinkThumbFallback item={item} size={size} rounded={rounded} />;
}

// Pulsante "copia" accanto alla scritta Nota: copia solo il testo di quella nota.
// Il segno di spunta compare solo se la copia è riuscita; altrimenti un avviso.
export function CopyNote({ text }) {
  const [stato, setStato] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyText(text);
    setStato(ok ? "ok" : "no");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStato(null), ok ? 1600 : 3000);
  };
  return (
    <>
      <button
        type="button"
        aria-label={stato === "ok" ? "Nota copiata" : "Copia nota"}
        onClick={copy}
        onPointerDown={(e) => e.stopPropagation()}
        className="-my-2 grid h-9 w-9 shrink-0 place-items-center"
      >
        {stato === "ok" ? <Check className="h-4 w-4" strokeWidth={2.8} aria-hidden="true" /> : <Copy className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />}
      </button>
      <span role="status" className={stato ? "shrink-0 font-bold" : "sr-only"}>
        {stato === "ok" ? "Nota copiata" : stato === "no" ? "Copia non riuscita" : ""}
      </span>
    </>
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
          {item.type === "note" && item.note && <CopyNote text={item.note} />}
          <span aria-hidden="true">·</span>
          <time className="num shrink-0" dateTime={item.created_at}>{formatDate(item.created_at)}</time>
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-[1.15rem] font-extrabold leading-[1.08] tracking-[-0.035em]">{title}</h3>
        {snippet && <p className="mt-1 line-clamp-2 text-[0.9rem] font-medium leading-snug text-tenue">{snippet}</p>}
        {/* In basso: lo stato e, alla sua destra, le categorie. */}
        <p className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="-ml-1 inline-flex">
            <StatusBadge status={item.status} compact />
          </span>
          {(item.categories || []).slice(0, 3).map((c) => (
            <span key={c} className="cartellino">{c}</span>
          ))}
        </p>
      </div>
    </a>
  );
}

// Riga con swipe verso sinistra: scopre "Elimina". Solo nella lista.
const APERTA = 88;
export function SwipeElimina({ onDelete, children }) {
  const [x, setX] = useState(0);
  const [trascina, setTrascina] = useState(false);
  const start = useRef(null);
  const mosso = useRef(false);
  const onDown = (e) => {
    start.current = { x: e.clientX, y: e.clientY, base: x };
    mosso.current = false;
  };
  const onMove = (e) => {
    const s0 = start.current;
    if (!s0) return;
    const dx = e.clientX - s0.x;
    if (!mosso.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(e.clientY - s0.y)) {
      mosso.current = true;
      setTrascina(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (mosso.current) setX(Math.max(-APERTA, Math.min(0, s0.base + dx)));
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    setTrascina(false);
    if (mosso.current) setX((v) => (v < -APERTA / 2 ? -APERTA : 0));
  };
  return (
    <div className={`relative ${x < 0 || trascina ? "overflow-hidden" : ""}`}>
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-[#e02a0d] text-[0.95rem] font-extrabold text-white"
        style={{ width: APERTA }}
        tabIndex={x < 0 ? 0 : -1}
        aria-hidden={x === 0}
        onClick={onDelete}
      >
        Elimina
      </button>
      <div
        className="relative bg-sfondo"
        style={{ transform: `translateX(${x}px)`, transition: trascina ? "none" : "transform 0.18s", touchAction: "pan-y" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          // Dopo un trascinamento il tocco non apre la scheda; a riga aperta chiude.
          if (mosso.current) {
            e.preventDefault();
            e.stopPropagation();
            mosso.current = false;
          } else if (x < 0) {
            e.preventDefault();
            e.stopPropagation();
            setX(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

function RigaSwipe({ item, onOpen, onDelete }) {
  return (
    <SwipeElimina onDelete={() => onDelete(item)}>
      <ItemCard item={item} onOpen={onOpen} />
    </SwipeElimina>
  );
}

export function ItemList({ items, onOpen, onDelete }) {
  return (
    <ul className="righe">
      {items.map((it) => (
        <li key={it.id}>{onDelete ? <RigaSwipe item={it} onOpen={onOpen} onDelete={onDelete} /> : <ItemCard item={it} onOpen={onOpen} />}</li>
      ))}
    </ul>
  );
}

// Copertine in griglia (vista a box, dentro una categoria).
export function ItemGrid({ items, onOpen }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 pt-3.5">
      {items.map((it) => {
        const site = it.site_name || (it.url ? displayHost(it.url) : it.file_name ? "File caricato" : typeLabel(it.type));
        return (
          <li key={it.id} className="min-w-0">
            <a
              href={`/elemento/${it.id}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                onOpen(it);
              }}
              className="block active:opacity-70"
            >
              <div className="aspect-square">
                <Thumb item={it} size="h-full w-full" rounded="rounded-2xl" />
              </div>
              <p className="mt-1.5 line-clamp-2 text-[0.95rem] font-extrabold leading-[1.08] tracking-[-0.03em]">{displayTitle(it)}</p>
              <p className="micro mt-0.5 flex items-center gap-0.5">
                <span className="-ml-1 inline-flex">
                  <StatusBadge status={it.status} compact />
                </span>
                <span className="sr-only">{typeLabel(it.type)} · </span>
                <span className="truncate">{site}</span>
              </p>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
