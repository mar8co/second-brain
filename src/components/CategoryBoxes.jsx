// Archivio a box: una scatola colorata per ogni box. I box fissi (Ristoranti,
// Eventi, Foto e video, File) hanno un'icona; quelli delle categorie le
// copertine dei contenuti (fino a 4). Il nome grande e quanti sono.
// In modalità "Ordina" ogni scatola ha due frecce per spostarla.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Thumb } from "./ItemCard.jsx";
import { boxStyle } from "../lib/colors.js";

// `tiles`: [{ id, kind: "fisso" | "categoria", name, sub, color, Icon?, items? }]
export default function CategoryBoxes({ tiles, onOpen, ordina = false, onMove, preferiti = null, onPreferiti }) {
  return (
    <>
      {preferiti && (
        <button type="button" className="scatola mt-3.5 flex !h-auto items-center gap-3 !px-4 !py-3.5" style={boxStyle(preferiti.color)} aria-label={`${preferiti.name}, ${preferiti.sub}`} onClick={() => !ordina && onPreferiti()}>
          <preferiti.Icon className="h-8 w-8 shrink-0" strokeWidth={2.2} aria-hidden="true" />
          <b className="text-[1.3rem] font-extrabold leading-[1.02] tracking-[-0.04em]">{preferiti.name}</b>
          <span className="micro ml-auto font-semibold">{preferiti.sub}</span>
        </button>
      )}
    <ul className="grid grid-cols-2 gap-3 pt-3.5">
      {tiles.map((t, i) => (
        <li key={t.id} className="relative min-w-0">
          {t.kind === "fisso" ? (
            <button type="button" className="scatola fissa" style={boxStyle(t.color)} aria-label={`${t.name}, ${t.sub}`} onClick={() => !ordina && onOpen(t)}>
              <t.Icon className="h-9 w-9" strokeWidth={2.2} aria-hidden="true" />
              <span className="mt-auto block pt-6">
                <b className="block break-words text-[1.3rem] font-extrabold leading-[1.02] tracking-[-0.04em]">{t.name}</b>
                <span className="micro mt-0.5 block font-semibold">{t.sub}</span>
              </span>
            </button>
          ) : (
            <button type="button" className="scatola" style={boxStyle(t.color)} aria-label={`${t.name}, ${t.sub}`} onClick={() => !ordina && onOpen(t)}>
              <Mosaico items={t.items} />
              <b className="mt-2.5 block break-words text-[1.3rem] font-extrabold leading-[1.02] tracking-[-0.04em]">{t.name}</b>
              <span className="micro mt-0.5 block font-semibold">{t.sub}</span>
            </button>
          )}
          {ordina && (
            <span className="absolute right-2 top-2 flex gap-1.5">
              <button type="button" className="tondo !h-9 !w-9 bg-white text-[#0a0a0a]" aria-label={`Sposta ${t.name} prima`} disabled={i === 0} onClick={() => onMove(t.id, -1)}>
                <ChevronLeft className="h-4 w-4" strokeWidth={2.8} aria-hidden="true" />
              </button>
              <button type="button" className="tondo !h-9 !w-9 bg-white text-[#0a0a0a]" aria-label={`Sposta ${t.name} dopo`} disabled={i === tiles.length - 1} onClick={() => onMove(t.id, 1)}>
                <ChevronRight className="h-4 w-4" strokeWidth={2.8} aria-hidden="true" />
              </button>
            </span>
          )}
        </li>
      ))}
    </ul>
    </>
  );
}

function Mosaico({ items }) {
  // Prima quelli con la copertina.
  const covers = [...items].sort((a, b) => Number(Boolean(b.image_url)) - Number(Boolean(a.image_url))).slice(0, 4);
  return (
    <span className="mosaico" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="cella">
          {covers[i] && <Thumb item={covers[i]} size="h-full w-full" rounded="rounded-lg" />}
        </span>
      ))}
    </span>
  );
}
