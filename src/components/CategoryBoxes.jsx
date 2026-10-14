// Archivio a box: una scatola colorata per categoria, con le copertine dei
// contenuti dentro (fino a 4), il nome grande e quanti sono.
import { Thumb } from "./ItemCard.jsx";
import { categoryColor } from "../lib/colors.js";

export default function CategoryBoxes({ boxes, onOpen }) {
  return (
    <ul className="grid grid-cols-2 gap-3 pt-3.5">
      {boxes.map(([name, items]) => {
        // Prima quelli con la copertina.
        const covers = [...items].sort((a, b) => Number(Boolean(b.image_url)) - Number(Boolean(a.image_url))).slice(0, 4);
        return (
          <li key={name} className="min-w-0">
            <button
              type="button"
              className="scatola"
              style={{ background: categoryColor(name) }}
              aria-label={`${name}, ${items.length === 1 ? "1 contenuto" : `${items.length} contenuti`}`}
              onClick={() => onOpen(name)}
            >
              <span className="mosaico" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="cella">
                    {covers[i] && <Thumb item={covers[i]} size="h-full w-full" rounded="rounded-lg" />}
                  </span>
                ))}
              </span>
              <b className="mt-2.5 block break-words text-[1.3rem] font-extrabold leading-[1.02] tracking-[-0.04em]">{name}</b>
              <span className="micro mt-0.5 block font-semibold">{items.length === 1 ? "1 contenuto" : `${items.length} contenuti`}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
