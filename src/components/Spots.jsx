// Elenchi dei box Ristoranti ed Eventi: nome e dati importanti, e sotto il link
// al Reel, al post o alla pagina da cui vengono.
import { useEffect, useState } from "react";
import { Check, CalendarPlus, ChefHat, Coffee, Ellipsis, IceCreamCone, MapPin, Pizza, Sandwich, Soup, Utensils, Wine, X } from "lucide-react";
import { EmptyState } from "./ui.jsx";
import { displayHost } from "../lib/detect.js";
import { TIPI_LOCALE, formatEventDate, gruppiLocali, hasStreet, mapsUrl } from "../lib/spots.js";
import { buildIcs } from "../lib/ics.js";
import { SwipeElimina, Thumb } from "./ItemCard.jsx";

// Link all'originale (si apre fuori dall'app) e alla scheda nell'app.
// Tocco sulla card (non su link, pulsanti o campi): apre direttamente la scheda.
const apriCard = (items, onOpen) => (e) => {
  if (e.target.closest("a, button, input, textarea, select, [role=menu]") || window.getSelection?.()?.toString()) return;
  if (items[0]) onOpen(items[0]);
};

function SourceLinks({ items, onOpen }) {
  return (
    <ul className="mt-1.5 space-y-0.5 text-[0.88rem] font-bold">
      {items.map((it) => (
        <li key={it.id} className="flex flex-wrap items-center gap-x-3">
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
function MapsLink({ name, where, plain = false, isStreet = false, pin = false }) {
  const street = isStreet || hasStreet(where);
  return (
    <>
      {plain && where && !street && <p className="micro mt-0.5 text-[0.85rem]">{where}</p>}
      <a href={mapsUrl(name, where)} target="_blank" rel="noopener noreferrer" className="micro mt-0.5 block text-[0.85rem] underline underline-offset-[3px]">
        {pin && <MapPin className="mr-1 inline h-[0.95em] w-[0.95em] align-[-0.12em]" strokeWidth={2.6} aria-hidden="true" />}
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

// Riga con swipe verso sinistra per eliminare (se c'è onDelete).
function Riga({ onDelete, children }) {
  return onDelete ? <SwipeElimina onDelete={onDelete}>{children}</SwipeElimina> : children;
}

const ICONA_TIPO = { trattoria: Utensils, pizzeria: Pizza, bar: Coffee, street: Sandwich, vino: Wine, dolci: IceCreamCone, mondo: Soup, ristorante: ChefHat };

// Cerchio colorato con l'icona del tipo di locale.
function IconaTipo({ tipo, size = "h-10 w-10", icon = "h-[19px] w-[19px]" }) {
  const t = TIPI_LOCALE[tipo] || TIPI_LOCALE.ristorante;
  const Icona = ICONA_TIPO[tipo] || ChefHat;
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${size}`} style={{ background: t.colore, color: t.chiaro ? "#ffffff" : "#0a0a0a", boxShadow: "inset 0 0 0 1.5px #0a0a0a" }} aria-hidden="true">
      <Icona className={icon} strokeWidth={2.4} />
    </span>
  );
}

// Box Ristoranti: i locali divisi per zona (quartiere, altrimenti città) o per
// tipo. Ogni riga: icona del tipo, nome, tipo o zona, via con Maps; i tre
// puntini per le vie e per eliminare. Tocco sulla riga: la scheda.
// gruppo: "zona" | "tipo"; tipo: filtro per tipo (solo per zona).
export function RestaurantList({ restaurants, onOpen, onStreet, onDelete, gruppo = "zona", tipo = "", onTipo }) {
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
  const perTipo = gruppo === "tipo";
  const conta = {};
  for (const r of restaurants) conta[r.tipo] = (conta[r.tipo] || 0) + 1;
  const filtro = !perTipo && conta[tipo] ? tipo : "";
  const gruppi = gruppiLocali(filtro ? restaurants.filter((r) => r.tipo === filtro) : restaurants, gruppo);
  const tipiPresenti = Object.keys(TIPI_LOCALE).filter((k) => conta[k]);

  const riga = (r) => (
    <li key={r.key} data-scheda-locale className={`relative ${menu === r.key ? "z-[60]" : ""}`}>
      <Riga onDelete={onDelete ? () => onDelete(r.name) : null}>
        <div className="flex cursor-pointer gap-3 bg-[var(--sfondo)] py-3" onClick={apriCard(r.items, onOpen)}>
          <IconaTipo tipo={r.tipo} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className={NAME}>{r.name}</p>
              {onStreet && editing?.key !== r.key && (
                <span className="relative shrink-0">
                  <button
                    type="button"
                    className="-my-1 -mr-1 grid h-7 w-8 place-items-center"
                    aria-label={`Indirizzi di ${r.name}`}
                    aria-haspopup="menu"
                    aria-expanded={menu === r.key}
                    onClick={() => setMenu(menu === r.key ? null : r.key)}
                  >
                    <Ellipsis className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
                  </button>
                  {menu === r.key && (
                    <div role="menu" aria-label={`Indirizzi di ${r.name}`} className="absolute right-0 top-full z-[60] mt-1.5 min-w-[10.5rem] overflow-hidden rounded-2xl border-[1.5px] border-inchiostro bg-[var(--sfondo)]">
                      {r.streets.length > 0 && (
                        <button type="button" role="menuitem" className="block w-full border-b border-riga px-4 py-3 text-left text-[0.95rem] font-extrabold tracking-[-0.02em]" onClick={() => choose(r, "modifica")}>
                          Modifica via
                        </button>
                      )}
                      <button type="button" role="menuitem" className={`block w-full px-4 py-3 text-left text-[0.95rem] font-extrabold tracking-[-0.02em] ${onDelete ? "border-b border-riga" : ""}`} onClick={() => choose(r, "aggiungi")}>
                        Aggiungi via
                      </button>
                      {onDelete && (
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-4 py-3 text-left text-[0.95rem] font-extrabold tracking-[-0.02em] text-[#e02a0d]"
                          onClick={() => {
                            setMenu(null);
                            onDelete(r.name);
                          }}
                        >
                          Elimina
                        </button>
                      )}
                    </div>
                  )}
                </span>
              )}
            </div>
            <p className="micro mt-0.5 font-semibold" data-tipo-locale>{perTipo ? r.zona || r.citta || "Zona non indicata" : (TIPI_LOCALE[r.tipo] || TIPI_LOCALE.ristorante).label}</p>
            {r.streets.length ? r.streets.map((a) => <MapsLink key={a} name={r.name} where={a} isStreet pin />) : <MapsLink name={r.name} where={r.address} pin />}
            {onStreet && editing?.key === r.key && (
              <AddressForm
                name={r.name}
                key={editing.mode}
                start={editing.mode === "aggiungi" ? [...r.streets, ""] : r.streets.length ? r.streets : [""]}
                onCancel={() => setEditing(null)}
                onSave={(v) => {
                  setEditing(null);
                  onStreet(r.name, v);
                }}
              />
            )}
          </div>
        </div>
      </Riga>
    </li>
  );

  return (
    <>
      {menu && <div className="fixed inset-0 z-50" aria-hidden="true" data-chiudi-menu onClick={() => setMenu(null)} />}
      {!perTipo && tipiPresenti.length > 1 && onTipo && (
        <ul className="fila-chip mt-3.5" aria-label="Tipo di locale">
          <li className="shrink-0">
            <button type="button" className={`pillola${filtro ? "" : " attiva"}`} aria-pressed={!filtro} onClick={() => onTipo("")}>
              Tutti <span className="num opacity-60">{restaurants.length}</span>
            </button>
          </li>
          {tipiPresenti.map((k) => {
            const Icona = ICONA_TIPO[k];
            return (
              <li key={k} className="shrink-0">
                <button type="button" className={`pillola${filtro === k ? " attiva" : ""}`} aria-pressed={filtro === k} onClick={() => onTipo(filtro === k ? "" : k)}>
                  <Icona className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" />
                  {TIPI_LOCALE[k].label} <span className="num opacity-60">{conta[k]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {gruppi.map((g) => (
        <section key={g.key} aria-label={g.label} data-gruppo-locali>
          <h3 className="mt-5 flex items-baseline justify-between gap-3 border-b-[1.5px] border-inchiostro pb-1.5">
            <span className="min-w-0 text-[1.65rem] font-extrabold leading-none tracking-[-0.05em]">{g.label}</span>
            <span className="micro num shrink-0 font-bold">{g.list.length === 1 ? "1 locale" : `${g.list.length} locali`}</span>
          </h3>
          {g.controllare && <p className="micro mt-1.5 text-[0.85rem]">Non ho trovato la via di questi locali. Tocca i tre puntini e poi Aggiungi via.</p>}
          <ul className="righe">{g.list.map(riga)}</ul>
        </section>
      ))}
    </>
  );
}

// Dentellatura del biglietto: dentini gialli (come il talloncino) verso destra.
const ZIGZAG = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="9" height="12"><polygon points="0,0 9,6 0,12" fill="#ffd60a"/></svg>')}")`;

const CAL_KEY = "sb-calendario";
function readCal() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CAL_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function EventRows({ events, onOpen, onDelete }) {
  const [inCal, setInCal] = useState(readCal);
  const addToCal = (e) => {
    downloadIcs([e], "second-brain.ics");
    const next = new Set(inCal).add(e.key);
    setInCal(next);
    try {
      localStorage.setItem(CAL_KEY, JSON.stringify([...next]));
    } catch {
      // Senza memoria del telefono il segno vale solo finché la pagina è aperta.
    }
  };
  return (
    <ul className="mt-3.5 space-y-3">
      {events.map((e) => {
        const [day, ...rest] = (e.date ? formatEventDate(e.date, e.end_date) : "—").split(" ");
        const cover = e.items.find((it) => it.image_url || it.file_path) || e.items[0];
        const aggiunto = inCal.has(e.key);
        return (
          <li key={e.key} data-biglietto className="overflow-hidden rounded-2xl border-[1.5px] border-inchiostro">
            <Riga onDelete={onDelete ? () => onDelete(e.key) : undefined}>
            <div className="flex cursor-pointer" onClick={apriCard(e.items, onOpen)}>
            <div className="flex w-[4.6rem] shrink-0 flex-col items-center justify-center self-stretch bg-[var(--giallo)] px-1 py-3 text-center text-[#0a0a0a]">
              <b className="num text-[0.95rem] font-extrabold leading-tight">{day}</b>
              <span className="num text-[0.8rem] font-bold leading-tight">{rest.join(" ")}</span>
            </div>
            <div aria-hidden="true" className="w-[9px] shrink-0 self-stretch" style={{ backgroundImage: ZIGZAG, backgroundRepeat: "repeat-y", backgroundSize: "9px 12px" }} />
            <div className="min-w-0 flex-1 self-center py-3 pl-4">
              <p className={NAME}>{e.name}</p>
              <SourceLinks items={e.items} onOpen={onOpen} />
              {e.place && <MapsLink name={e.name} where={e.place} plain />}
              {e.date && (
                <button
                  type="button"
                  disabled={aggiunto}
                  className={`pillola mt-2 !min-h-[34px] !px-3 !text-[0.8rem] ${aggiunto ? "!bg-[#e4e2dc] !text-[#8a8780] !border-[#e4e2dc]" : ""}`}
                  onClick={() => addToCal(e)}
                >
                  {aggiunto ? <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" /> : <CalendarPlus className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />}
                  {aggiunto ? "Aggiunto al calendario" : "Aggiungi al calendario"}
                </button>
              )}
            </div>
            {cover && (cover.image_url || cover.file_path) && (
              <div className="shrink-0 self-center py-3 pl-2 pr-3">
                <Thumb item={cover} size="h-16 w-16" rounded="rounded-lg" />
              </div>
            )}
            {!(cover && (cover.image_url || cover.file_path)) && <span className="w-3 shrink-0" aria-hidden="true" />}
            </div>
            </Riga>
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

export function EventList({ events, onOpen, onDelete }) {
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
      {upcoming.length > 0 && <EventRows events={upcoming} onOpen={onOpen} onDelete={onDelete} />}
      {undated.length > 0 && (
        <>
          <h3 className="sezione">Data non indicata</h3>
          <EventRows events={undated} onOpen={onOpen} onDelete={onDelete} />
        </>
      )}
      {past.length > 0 && (
        <div className="opacity-50" data-passati>
          <h3 className="sezione">Passati</h3>
          <EventRows events={past} onOpen={onOpen} onDelete={onDelete} />
        </div>
      )}
    </>
  );
}
