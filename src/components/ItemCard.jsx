// Riga dell'elenco: copertina (o il colore dell'elemento con l'icona del tipo),
// fonte e data in piccolo, titolo grande, in basso stato e categorie. In vista
// a box, ogni elemento è una copertina con il titolo sotto.
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Trash2 } from "lucide-react";
import { isStoredThumb, rememberThumb } from "../lib/thumbs.js";
import { hasFileCover, useCoverUrl, useFileUrl } from "../lib/fileurl.js";
import { displayTitle } from "../lib/item.js";
import { displayHost, mapTileUrl } from "../lib/detect.js";
import { itemColor } from "../lib/colors.js";
import { StatusBadge, TypeIcon } from "./ui.jsx";
import { formatDate, typeLabel } from "../lib/format.js";
import { copyText } from "../lib/clipboard.js";
import Stella from "./Stella.jsx";

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
  const cover = useCoverUrl(item);
  const url = item.image_url ? cover : item.type === "place" ? mapTileUrl(item.place) : null;
  if (url && tries < 2 && /^https?:\/\//.test(url)) {
    return (
      <img
        key={tries}
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => !isStoredThumb(item.image_url) && rememberThumb(url)}
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
  // Messaggio e icona sono due stati separati: l'icona resta sempre quella di copia,
  // il messaggio (con la spunta) resta per 20 secondi.
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyText(text);
    setMsg(ok ? "ok" : "no");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 20000);
  };
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span role="status" className={msg ? "inline-flex items-center gap-1 whitespace-nowrap font-bold" : "sr-only"}>
        {msg === "ok" && (
          <>
            Nota copiata <Check className="h-4 w-4" strokeWidth={2.8} aria-hidden="true" />
          </>
        )}
        {msg === "no" && "Copia non riuscita"}
      </span>
      <button
        type="button"
        aria-label="Copia nota"
        onClick={copy}
        onPointerDown={(e) => e.stopPropagation()}
        className="-my-2 grid h-9 w-9 shrink-0 place-items-center"
      >
        <Copy className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
      </button>
    </span>
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
          <span className="min-w-0 flex-1 truncate">{source}</span>
          <Stella item={item} className="ml-auto -my-3 h-10 w-8" size={17} />
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
          {item.type === "note" && item.note && (
            <span className="ml-auto">
              <CopyNote text={item.note} />
            </span>
          )}
        </p>
      </div>
    </a>
  );
}

// Swipe verso sinistra (uguale in tutta l'app): la riga scorre e scopre un
// cestino rosso che cresce col gesto; oltre il bordo fa resistenza. Tocco sul
// cestino: la riga scivola via e si chiude, poi l'avviso con "Annulla".
const APERTA = 76;
const MOLLA = "cubic-bezier(0.22, 1, 0.36, 1)";
const pocoMoto = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export function SwipeElimina({ onDelete, children }) {
  const [x, setX] = useState(0);
  const [trascina, setTrascina] = useState(false);
  const [via, setVia] = useState(false);
  const [alt, setAlt] = useState(null);
  const box = useRef(null);
  const start = useRef(null);
  const mosso = useRef(false);
  const io = useRef(Symbol("riga"));
  // Si apre una riga: le altre aperte si chiudono.
  useEffect(() => {
    const chiudi = (e) => e.detail !== io.current && setX(0);
    window.addEventListener("swipe-aperta", chiudi);
    return () => window.removeEventListener("swipe-aperta", chiudi);
  }, []);
  const onDown = (e) => {
    if (via) return;
    start.current = { x: e.clientX, y: e.clientY, base: x };
    mosso.current = false;
  };
  const onMove = (e) => {
    const s0 = start.current;
    if (!s0) return;
    const dx = e.clientX - s0.x;
    if (!mosso.current && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - s0.y) * 1.2) {
      mosso.current = true;
      setTrascina(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
      window.dispatchEvent(new CustomEvent("swipe-aperta", { detail: io.current }));
    }
    if (!mosso.current) return;
    const raw = Math.min(0, s0.base + dx);
    // Oltre l'apertura il movimento rallenta (effetto elastico).
    setX(raw < -APERTA ? -APERTA - (-raw - APERTA) * 0.25 : raw);
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    setTrascina(false);
    if (mosso.current) setX((v) => (v < -APERTA * 0.45 ? -APERTA : 0));
  };
  const elimina = (e) => {
    e.stopPropagation();
    if (via) return;
    if (pocoMoto()) return onDelete();
    setAlt(box.current?.offsetHeight || null);
    setVia(true);
    // Prima la riga scivola via, poi lo spazio si chiude.
    requestAnimationFrame(() => requestAnimationFrame(() => setAlt(0)));
    setTimeout(onDelete, 320);
  };
  const p = Math.min(1, -x / APERTA);
  const aperta = x < 0 || trascina || via;
  return (
    <div
      ref={box}
      className={`relative ${aperta ? "overflow-hidden" : ""}`}
      style={alt === null ? undefined : { height: alt, opacity: alt === 0 ? 0 : 1, transition: `height 0.3s ${MOLLA} 0.12s, opacity 0.25s ease 0.12s` }}
    >
      <div className="absolute inset-y-0 right-0 flex items-center justify-center" style={{ width: Math.max(APERTA, -x) }}>
        <button
          type="button"
          aria-label="Elimina"
          aria-hidden={x === 0 && !via}
          tabIndex={x < 0 ? 0 : -1}
          onClick={elimina}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e5372a] text-white shadow-[0_6px_16px_-6px_rgba(229,55,42,0.7)] active:scale-90"
          style={{
            opacity: via ? 0 : p,
            transform: `scale(${via ? 0.6 : 0.55 + 0.45 * p})`,
            transition: trascina ? "none" : `opacity 0.25s ease, transform 0.35s ${MOLLA}`,
          }}
        >
          <Trash2 size={19} strokeWidth={2.2} aria-hidden="true" style={{ transform: `rotate(${(1 - p) * -14}deg)`, transition: trascina ? "none" : `transform 0.35s ${MOLLA}` }} />
        </button>
      </div>
      <div
        className="relative bg-sfondo"
        style={{
          transform: `translateX(${via ? "-105%" : `${x}px`})`,
          opacity: via ? 0 : 1,
          transition: trascina ? "none" : via ? `transform 0.28s cubic-bezier(0.4, 0, 1, 1), opacity 0.22s ease` : `transform 0.42s ${MOLLA}`,
          touchAction: "pan-y",
          willChange: aperta ? "transform" : undefined,
        }}
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
              <div className="relative aspect-square">
                <Thumb item={it} size="h-full w-full" rounded="rounded-2xl" />
                <Stella item={it} className="absolute right-1 top-1 h-9 w-9 rounded-full bg-white/90 text-[#0a0a0a]" size={17} />
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
