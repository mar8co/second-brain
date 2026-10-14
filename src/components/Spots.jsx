// Elenchi dei box Ristoranti ed Eventi: nome e dati importanti, e sotto il link
// al Reel, al post o alla pagina da cui vengono.
import { EmptyState } from "./ui.jsx";
import { displayHost } from "../lib/detect.js";
import { formatEventDate } from "../lib/spots.js";

// Link all'originale (si apre fuori dall'app) e alla scheda nell'app.
function SourceLinks({ items, onOpen }) {
  return (
    <ul className="mt-1.5 space-y-0.5 text-[0.88rem] font-bold">
      {items.map((it) => (
        <li key={it.id} className="flex flex-wrap gap-x-3">
          {/^https?:\/\//.test(it.url || "") && (
            <a href={it.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-[3px]">
              Apri su {it.site_name || displayHost(it.url)} ↗
            </a>
          )}
          <a
            href={`/elemento/${it.id}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              onOpen(it);
            }}
            className="text-tenue underline underline-offset-[3px]"
          >
            Scheda
          </a>
        </li>
      ))}
    </ul>
  );
}

const NAME = "text-[1.2rem] font-extrabold leading-[1.05] tracking-[-0.035em]";

export function RestaurantList({ restaurants, onOpen }) {
  if (!restaurants.length) {
    return (
      <EmptyState title="Ancora nessun ristorante">
        Qui compaiono i ristoranti, i bar e i locali citati nei contenuti che salvi, come quelli di un Reel. Li trova l'AI quando legge un contenuto.
      </EmptyState>
    );
  }
  return (
    <ul className="righe">
      {restaurants.map((r) => (
        <li key={r.key} className="py-3.5">
          <p className={NAME}>{r.name}</p>
          {r.address && <p className="micro mt-0.5 text-[0.85rem]">{r.address}</p>}
          <SourceLinks items={r.items} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

function EventRows({ events, onOpen }) {
  return (
    <ul className="righe">
      {events.map((e) => (
        <li key={e.key} className="grid grid-cols-[5.6rem_minmax(0,1fr)] gap-3 py-3.5">
          <p className="num text-[0.9rem] font-extrabold leading-tight">{e.date ? formatEventDate(e.date, e.end_date) : "—"}</p>
          <div className="min-w-0">
            <p className={NAME}>{e.name}</p>
            {e.place && <p className="micro mt-0.5 text-[0.85rem]">{e.place}</p>}
            <SourceLinks items={e.items} onOpen={onOpen} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EventList({ events, onOpen }) {
  const { upcoming, undated, past } = events;
  if (!upcoming.length && !undated.length && !past.length) {
    return (
      <EmptyState title="Ancora nessun evento">
        Qui compaiono gli eventi con una data citati nei contenuti che salvi, come un workshop o un concerto. Li trova l'AI quando legge un contenuto.
      </EmptyState>
    );
  }
  return (
    <>
      {upcoming.length > 0 && <EventRows events={upcoming} onOpen={onOpen} />}
      {undated.length > 0 && (
        <>
          <h3 className="sezione">Data non indicata</h3>
          <EventRows events={undated} onOpen={onOpen} />
        </>
      )}
      {past.length > 0 && (
        <div className="opacity-50" data-passati>
          <h3 className="sezione">Passati</h3>
          <EventRows events={past} onOpen={onOpen} />
        </div>
      )}
    </>
  );
}
