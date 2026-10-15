// Repository: i file caricati, a griglia (foto e video con la miniatura, i
// documenti con icona e nome), da toccare per aprire la scheda. Gli originali stanno nell'archivio privato: l'indirizzo
// temporaneo di ogni file si chiede quando la miniatura compare.
import { useEffect, useRef, useState } from "react";
import { FileText, Play } from "lucide-react";
import { isImage, isVideo } from "../lib/files.js";

function Tile({ item, store, onOpen }) {
  const video = isVideo(item.file_mime);
  const visual = video || isImage(item.file_mime);
  const [url, setUrl] = useState(null);
  const [seen, setSeen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setSeen(true), io.disconnect()), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    let alive = true;
    if (seen && visual) store.fileUrl(item).then((u) => alive && setUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [seen, visual, item.id, item.file_path, store]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = item.title || item.file_name || (video ? "Video" : "Foto");
  return (
    <li ref={box} className="min-w-0">
      <a
        href={`/elemento/${item.id}`}
        aria-label={label}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          onOpen(item);
        }}
        className="relative block aspect-square overflow-hidden rounded-xl bg-[rgb(10_10_10/0.08)] active:opacity-70"
      >
        {!visual && (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 text-center">
            <FileText className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
            <span className="line-clamp-2 break-all text-[0.7rem] font-bold leading-tight">{item.file_name || label}</span>
          </span>
        )}
        {url && (video ? (
          <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        ) : (
          <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ))}
        {video && (
          <span className="absolute bottom-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#0a0a0a] text-white" aria-hidden="true">
            <Play className="h-3 w-3" fill="currentColor" strokeWidth={0} />
          </span>
        )}
      </a>
    </li>
  );
}

export default function Gallery({ items, store, onOpen }) {
  return (
    <ul className="grid grid-cols-3 gap-1.5 pt-3.5">
      {items.map((it) => (
        <Tile key={it.id} item={it} store={store} onOpen={onOpen} />
      ))}
    </ul>
  );
}
