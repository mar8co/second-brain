// Elenchi dei box Ristoranti ed Eventi: nome e dati importanti, e sotto il link
// al Reel, al post o alla pagina da cui vengono.
import { useEffect, useState } from "react";
import { CalendarPlus, Ellipsis, X } from "lucide-react";
import { EmptyState } from "./ui.jsx";
import { displayHost } from "../lib/detect.js";
import { formatEventDate, hasStreet, mapsUrl } from "../lib/spots.js";
import { buildIcs } from "../lib/ics.js";
import { Thumb } from "./ItemCard.jsx";

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
function MapsLink({ name, where, plain = false, isStreet = false }) {
  const street = isStreet || hasStreet(where);
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

// Indirizzi del locale (anche più sedi): un campo per sede, con Aggiungi sede,
// Salva e Annulla. Nessun indirizzo salvato = si toglie tutto e il locale torna
// a essere cercato.
function AddressForm({ name, start, onSave, onCancel }) {
  const [rows, setRows] = useState(start.length ? start : [""]);
  const set = (i, v) => setRows((r) => r.map((x, j) => (j === i ? v : x)));
  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(rows);
      }}
    >
      {rows.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`via-${name}-${i}`}>Indirizzo {i + 1} di {name}</label>
          <input
            id={`via-${name}-${i}`}
            className="campo piccolo min-w-0 flex-1"
            value={v}
            autoFocus={i === rows.length - 1}
            autoComplete="off"
            autoCapitalize="words"
            placeholder="Via e numero, città"
            onChange={(e) => set(i, e.target.value)}
          />
          <button type="button" className="tondo shrink-0" aria-label={`Togli l'indirizzo ${i + 1} di ${name}`} onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [""]))}>
            <X className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button type="button" className="link mt-1 text-[0.88rem]" onClick={() => setRows((r) => [...r, ""])}>
        + Aggiungi un'altra sede
      </button>
      <div className="flex gap-4 text-[0.88rem]">
        <button type="submit" className="link">Salva</button>
        <button type="button" className="link text-tenue" onClick={onCancel}>Annulla</button>
      </div>
    </form>
  );
}

export function RestaurantList({ restaurants, onOpen, onStreet }) {
  // menu: locale con il menu dei puntini aperto; editing: locale in modifica e come
  // ({ key, mode: "modifica" | "aggiungi" }).
  const [menu, setMenu] = useState(null);
  const [editing, setEditing] = useState(null);

  // Il menu si chiude con Esc; toccando fuori lo chiude lo strato trasparente
  // qui sotto, che assorbe il tocco (i link sotto non si attivano).
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => e.key === "Escape" && setMenu(null);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menu]);

  if (!restaurants.length) {
    return (
      <EmptyState title="Ancora nessun ristorante">
        Qui compaiono i ristoranti, i bar e i locali citati nei contenuti che salvi, come quelli di un Reel. Li trova l'AI quando legge un contenuto.
      </EmptyState>
    );
  }
  const choose = (r, mode) => {
    setMenu(null);
    setEditing({ key: r.key, mode });
  };
  return (
    <>
      {menu && <div className="fixed inset-0 z-50" aria-hidden="true" data-chiudi-menu onClick={() => setMenu(null)} />}
    <ul className="righe">
      {restaurants.map((r) => (
        <li key={r.key} className="py-3.5">
          <div className="flex items-start justify-between gap-3">
            <p className={NAME}>{r.name}</p>
            {onStreet && (
              <div className={`relative ${menu === r.key ? "z-[60]" : ""} -mb-3 -mr-2 -mt-2.5 shrink-0`}>
                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center"
                  aria-label={`Indirizzi di ${r.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menu === r.key}
                  onClick={() => setMenu(menu === r.key ? null : r.key)}
                >
                  <Ellipsis className="h-7 w-7" strokeWidth={2.6} aria-hidden="true" />
                </button>
                {menu === r.key && (
                  <div role="menu" aria-label={`Indirizzi di ${r.name}`} className="absolute right-2 top-10 z-[60] min-w-[10.5rem] overflow-hidden rounded-2xl border-[1.5px] border-inchiostro bg-[var(--sfondo)] shadow-none">
                    {r.streets.length > 0 && (
                      <button type="button" role="menuitem" className="block w-full border-b border-riga px-4 py-3 text-left text-[0.95rem] font-extrabold tracking-[-0.02em]" onClick={() => choose(r, "modifica")}>
                        Modifica via
                      </button>
                    )}
                    <button type="button" role="menuitem" className="block w-full px-4 py-3 text-left text-[0.95rem] font-extrabold tracking-[-0.02em]" onClick={() => choose(r, "aggiungi")}>
                      Aggiungi via
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <SourceLinks items={r.items} onOpen={onOpen} />
          {r.streets.length ? r.streets.map((a) => <MapsLink key={a} name={r.name} where={a} isStreet />) : <MapsLink name={r.name} where={r.address} />}
          {onStreet && editing?.key === r.key && (
            <AddressForm
              key={editing.mode}
              name={r.name}
              start={editing.mode === "aggiungi" ? [...r.streets, ""] : r.streets}
              onCancel={() => setEditing(null)}
              onSave={(v) => {
                setEditing(null);
                onStreet(r.name, v);
              }}
            />
          )}
        </li>
      ))}
    </ul>
    </>
  );
}

// Dentellatura del biglietto: dentini gialli (come il talloncino) verso destra.
const ZIGZAG = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="9" height="12"><polygon points="0,0 9,6 0,12" fill="#ffd60a"/></svg>')}")`;

function EventRows({ events, onOpen }) {
  return (
    <ul className="mt-3.5 space-y-3">
      {events.map((e) => {
        const [day, ...rest] = (e.date ? formatEventDate(e.date, e.end_date) : "—").split(" ");
        const cover = e.items.find((it) => it.image_url || it.file_path) || e.items[0];
        return (
          <li key={e.key} data-biglietto className="flex overflow-hidden rounded-2xl border-[1.5px] border-inchiostro">
            <div className="flex w-[4.6rem] shrink-0 flex-col items-center justify-center self-stretch bg-[var(--giallo)] px-1 py-3 text-center text-[#0a0a0a]">
              <b className="num text-[0.95rem] font-extrabold leading-tight">{day}</b>
              <span className="num text-[0.8rem] font-bold leading-tight">{rest.join(" ")}</span>
            </div>
            <div aria-hidden="true" className="w-[9px] shrink-0 self-stretch" style={{ backgroundImage: ZIGZAG, backgroundRepeat: "repeat-y", backgroundSize: "9px 12px" }} />
            <div className="min-w-0 flex-1 py-3 pl-2">
              <p className={NAME}>{e.name}</p>
              <SourceLinks items={e.items} onOpen={onOpen} />
              {e.place && <MapsLink name={e.name} where={e.place} plain />}
              {e.date && (
                <button type="button" className="pillola mt-2 !min-h-[34px] !px-3 !text-[0.8rem]" onClick={() => downloadIcs([e], "second-brain.ics")}>
                  <CalendarPlus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
                  Aggiungi al calendario
                </button>
              )}
            </div>
            {cover && (cover.image_url || cover.file_path) && (
              <div className="shrink-0 py-3 pl-2 pr-3">
                <Thumb item={cover} size="h-16 w-16" rounded="rounded-lg" />
              </div>
            )}
            {!(cover && (cover.image_url || cover.file_path)) && <span className="w-3 shrink-0" aria-hidden="true" />}
          </li>
        );
      })}
    </ul>
  );
}

function downloadIcs(all, file = "second-brain.ics") {
  const blob = new Blob([buildIcs(all)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
