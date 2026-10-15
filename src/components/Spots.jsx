// Elenchi dei box Ristoranti ed Eventi: nome e dati importanti, e sotto il link
// al Reel, al post o alla pagina da cui vengono.
import { useState } from "react";
import { EmptyState } from "./ui.jsx";
import { displayHost } from "../lib/detect.js";
import { formatEventDate, hasStreet, mapsUrl } from "../lib/spots.js";

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

// Link a Maps: con la via completa mostra la via; senza, "Cerca su Maps" (la
// ricerca usa comunque nome e città). `plain`: il luogo di un evento si legge
// comunque, anche senza via.
function MapsLink({ name, where, plain = false }) {
  const street = hasStreet(where);
  return (
    <>
      {plain && where && !street && <p className="micro mt-0.5 text-[0.85rem]">{where}</p>}
      <a href={mapsUrl(name, where)} target="_blank" rel="noopener noreferrer" className="micro mt-0.5 block text-[0.85rem] underline underline-offset-[3px]">
        {street ? <>{where} <span aria-hidden="true">↗</span><span className="sr-only"> (apri su Maps)</span></> : <>Cerca su Maps <span aria-hidden="true">↗</span></>}
      </a>
    </>
  );
}

const NAME = "text-[1.2rem] font-extrabold leading-[1.05] tracking-[-0.035em]";

// Via scritta a mano: un campo sotto il locale, con Salva e Annulla. Vuoto e
// salvato, toglie la via scritta e il locale torna a essere cercato.
function StreetForm({ name, start, onSave, onCancel }) {
  const [value, setValue] = useState(start);
  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <label className="sr-only" htmlFor={`via-${name}`}>Via di {name}</label>
      <input
        id={`via-${name}`}
        className="campo piccolo"
        value={value}
        autoFocus
        autoComplete="off"
        autoCapitalize="words"
        placeholder="Via e numero, città"
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="mt-1.5 flex gap-4 text-[0.88rem]">
        <button type="submit" className="link">Salva</button>
        <button type="button" className="link text-tenue" onClick={onCancel}>Annulla</button>
      </div>
    </form>
  );
}

export function RestaurantList({ restaurants, onOpen, onStreet }) {
  const [editing, setEditing] = useState(null);
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
          <SourceLinks items={r.items} onOpen={onOpen} />
          <MapsLink name={r.name} where={r.address} />
          {onStreet && editing === r.key ? (
            <StreetForm
              name={r.name}
              start={r.manual || hasStreet(r.address) ? r.address : ""}
              onCancel={() => setEditing(null)}
              onSave={(v) => {
                setEditing(null);
                onStreet(r.name, v);
              }}
            />
          ) : (
            onStreet && (
              <button type="button" className="link mt-0.5 text-[0.85rem] text-tenue" onClick={() => setEditing(r.key)}>
                {hasStreet(r.address) ? "Modifica la via" : "Scrivi la via"}
              </button>
            )
          )}
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
            <SourceLinks items={e.items} onOpen={onOpen} />
            {e.place && <MapsLink name={e.name} where={e.place} plain />}
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
