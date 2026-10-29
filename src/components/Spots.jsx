// Elenchi dei box Ristoranti ed Eventi: nome e dati importanti, e sotto il link
// al Reel, al post o alla pagina da cui vengono.
import { useEffect, useState } from "react";
import { ArrowUpDown, Check, CalendarPlus, ChefHat, ClipboardPaste, Coffee, IceCreamCone, MapPin, Pizza, Sandwich, Soup, Utensils, Wine, X } from "lucide-react";
import { EmptyState } from "./ui.jsx";
import { displayHost } from "../lib/detect.js";
import { formatVia } from "../lib/indirizzi.js";
import { ORDINI_LOCALI, SENZA_ZONA, TIPI_LOCALE, filtraRighe, formatEventDate, gruppiLocali, hasStreet, isEstero, linkIn, mapsUrl, righeLocali } from "../lib/spots.js";
import { buildIcs } from "../lib/ics.js";
import { SwipeElimina, Thumb } from "./ItemCard.jsx";
import { Foglio } from "./Foglio.jsx";

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
function MapsLink({ name, where: raw, plain = false, isStreet = false, pin = false }) {
  const where = formatVia(raw);
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
function AddressForm({ name, start, onSave, onCancel, onLink }) {
  const [rows, setRows] = useState(start.length ? start.map(formatVia) : [""]);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const puoIncollare = Boolean(onLink && typeof navigator !== "undefined" && navigator.clipboard?.readText);
  const set = (i, v) => setRows((r) => r.map((x, j) => (j === i ? v : x)));
  // Un campo con un link (di Google Maps, anche copiato col testo della
  // condivisione) si trasforma nella via letta da quel link.
  const salva = async (rows) => {
    const links = onLink ? rows.map((v, i) => [linkIn(v), i]).filter(([u]) => u) : [];
    if (!links.length) return onSave(rows);
    setBusy(true);
    setErrore("");
    const next = [...rows];
    let mancano = 0;
    for (const [u, i] of links) {
      const via = await onLink(u).catch(() => "");
      if (via) next[i] = via;
      else mancano++;
    }
    setRows(next);
    setBusy(false);
    if (mancano) setErrore("Non sono riuscito a leggere la via da questo link. Scrivila a mano o prova un altro link.");
    else onSave(next);
  };
  // Incolla dagli appunti nel primo campo vuoto (o in una sede nuova); con un
  // link di Maps la via si legge subito.
  const incolla = async (i) => {
    let testo = "";
    try {
      testo = (await navigator.clipboard.readText()).trim();
    } catch {
      testo = "";
    }
    if (!testo) {
      setErrore("Non riesco a leggere quello che hai copiato: tieni premuto nel campo e scegli Incolla.");
      return;
    }
    const next = rows.map((x, j) => (j === i ? testo : x));
    setRows(next);
    setErrore("");
    if (linkIn(testo)) salva(next);
  };
  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) salva(rows);
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
            placeholder={onLink ? "Via e numero, città, o link di Maps" : "Via e numero, città"}
            onChange={(e) => set(i, e.target.value)}
          />
          {!v.trim() && puoIncollare ? (
            <button type="button" className="tondo shrink-0" disabled={busy} aria-label={`Incolla link di Maps nell'indirizzo ${i + 1} di ${name}`} onClick={() => incolla(i)}>
              <ClipboardPaste className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="tondo shrink-0" aria-label={`Togli l'indirizzo ${i + 1} di ${name}`} onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [""]))}>
              <X className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.88rem]">
        <button type="button" className="link" onClick={() => setRows((r) => [...r, ""])}>
          + Aggiungi un'altra sede
        </button>
      </div>
      <p aria-live="polite" className={`micro text-[0.85rem] ${busy || errore ? "mt-1" : "sr-only"}`}>
        {busy ? "Leggo la via dal link di Maps…" : errore}
      </p>
      <div className="flex gap-4 text-[0.88rem]">
        <button type="submit" className="link" disabled={busy}>Salva</button>
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
// Pill accanto ai Filtri: come dividere la lista dei Ristoranti (per nome,
// tipo, quartiere o città). Tocco fuori o Esc chiudono il menu.
export function OrdinaLocali({ value, onChange }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const scelta = ORDINI_LOCALI.find(([k]) => k === value) || ORDINI_LOCALI[2];
  return (
    <span className="relative">
      {open && <div className="fixed inset-0 z-50" aria-hidden="true" onClick={() => setOpen(false)} />}
      <button type="button" className={`pillola${open ? " attiva" : ""}`} aria-label={`Ordina per ${scelta[1].toLowerCase()}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" />
        {scelta[1]}
      </button>
      {open && (
        <div role="menu" aria-label="Ordina per" className="absolute right-0 top-full z-[60] mt-1.5 min-w-[10.5rem] overflow-hidden rounded-2xl border-[1.5px] border-inchiostro bg-[var(--sfondo)] font-sans normal-case tracking-normal">
          <p className="micro border-b border-riga px-4 pb-1.5 pt-2.5 font-bold">Ordina per</p>
          {ORDINI_LOCALI.map(([k, label], i) => (
            <button
              key={k}
              type="button"
              role="menuitemradio"
              aria-checked={k === scelta[0]}
              className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[0.95rem] font-extrabold tracking-[-0.02em] ${i < ORDINI_LOCALI.length - 1 ? "border-b border-riga" : ""}`}
              onClick={() => {
                setOpen(false);
                onChange(k);
              }}
            >
              {label}
              {k === scelta[0] && <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// Scheda del locale (sale dal basso): tutti gli indirizzi con Maps, modifica
// degli indirizzi, il contenuto da cui viene ed Elimina.
function SchedaLocale({ r, onClose, onOpen, onStreet, onLink, onRegeo, onDelete }) {
  const [modifica, setModifica] = useState(false);
  const t = (TIPI_LOCALE[r.tipo] || TIPI_LOCALE.ristorante).label;
  const indirizzi = r.tutte?.length ? r.tutte : r.streets;
  const tc = TIPI_LOCALE[r.tipo] || TIPI_LOCALE.ristorante;
  const azione = "flex w-full items-center justify-between border-b border-riga py-3 text-left text-[1rem] font-extrabold tracking-[-0.02em]";
  // Il colore della scheda è quello del tipo di locale (come l'icona).
  return (
    <Foglio label={`Scheda di ${r.name}`} color={tc.colore} onClose={onClose}>
      <div className={tc.chiaro ? "text-white" : undefined}>
      <div className="flex items-center gap-3">
        <IconaTipo tipo={r.tipo} />
        <div className="min-w-0">
          <h2 className="text-[1.5rem] font-extrabold leading-[1.05] tracking-[-0.04em]">{r.name}</h2>
          <p className="micro mt-0.5 font-semibold">{[t, r.zona || r.citta].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <h3 className="micro mt-4 font-bold">{indirizzi.length > 1 ? "Indirizzi" : "Indirizzo"}</h3>
      {indirizzi.length ? indirizzi.map((a) => <MapsLink key={a} name={r.name} where={a} isStreet pin />) : (
        <>
          <p className="micro mt-0.5 text-[0.85rem]">Non ho trovato l'indirizzo. Scrivilo o incolla il link del locale su Google Maps.</p>
          <MapsLink name={r.name} where={r.address} pin />
        </>
      )}
      {onStreet && modifica && (
        <AddressForm
          name={r.name}
          start={indirizzi.length ? indirizzi : [""]}
          onCancel={() => setModifica(false)}
          onLink={onLink ? (url) => onLink(r, url) : undefined}
          onSave={(v) => {
            onClose();
            onStreet(r.name, v);
          }}
        />
      )}
      <div className="mt-3 border-t border-riga">
        {onStreet && !modifica && (
          <button type="button" className={azione} onClick={() => setModifica(true)}>
            {indirizzi.length ? "Modifica indirizzi" : "Aggiungi indirizzo"}
          </button>
        )}
        {onRegeo && !modifica && (
          <button
            type="button"
            className={azione}
            onClick={() => {
              onClose();
              onRegeo(r.name);
            }}
          >
            Ricerca di nuovo via e quartiere
          </button>
        )}
        {r.items.slice(0, 3).map((it, i, all) => (
          <button
            key={it.id}
            type="button"
            className={azione}
            onClick={() => {
              onClose();
              onOpen(it);
            }}
          >
            {all.length > 1 ? `Apri scheda ${i + 1}` : "Apri scheda"}
          </button>
        ))}
        {onDelete && (
          <button
            type="button"
            className={`${azione} text-[#e02a0d]`}
            onClick={() => {
              onClose();
              onDelete(r);
            }}
          >
            {r.sede ? "Elimina questa sede" : "Elimina"}
          </button>
        )}
      </div>
      </div>
    </Foglio>
  );
}

// Box Ristoranti. Per quartiere e per città: una riga per sede, nel suo gruppo
// (un locale con sedi in quartieri diversi compare in ognuno). Per tipo e per
// nome: una riga per locale con tutti i suoi indirizzi. Tocco sulla riga: la
// scheda del locale; swipe a sinistra: Elimina.
export function RestaurantList({ restaurants, onOpen, onStreet, onLink, onRegeo, onDelete, gruppo = "zona", filtri = {} }) {
  const [aperto, setAperto] = useState(null);

  if (!restaurants.length) {
    return (
      <EmptyState title="Ancora nessun ristorante">
        Qui compaiono i ristoranti, i bar e i locali citati nei contenuti che salvi, come quelli di un Reel. Li trova l'AI quando legge un contenuto.
      </EmptyState>
    );
  }
  const perSede = gruppo === "zona" || gruppo === "citta";
  const righe = filtraRighe(righeLocali(restaurants), filtri);
  const visibili = perSede
    ? righe
    : restaurants.filter((r) => righe.some((x) => x.name === r.name)).map((r) => ({ ...r, tutte: r.streets }));
  const gruppi = gruppiLocali(visibili, gruppo);
  // La scheda aperta segue i dati aggiornati del locale.
  const scheda = aperto && (visibili.find((x) => x.key === aperto) || null);

  // Sotto il nome quello che il gruppo non dice già: il tipo e/o la zona.
  const sottotitolo = (r) => {
    const t = (TIPI_LOCALE[r.tipo] || TIPI_LOCALE.ristorante).label;
    if (gruppo === "tipo") return r.zona || r.citta || SENZA_ZONA;
    if (gruppo === "citta") return [t, r.zona].filter(Boolean).join(" · ");
    if (gruppo === "nome") return [t, r.zona || r.citta].filter(Boolean).join(" · ");
    // Nel gruppo di un paese estero: anche la città.
    if (isEstero(r)) return [t, r.citta].filter(Boolean).join(" · ");
    return t;
  };

  const riga = (r) => (
    <li key={r.key} data-scheda-locale>
      <Riga onDelete={onDelete ? () => onDelete(r) : null}>
        <div
          className="flex cursor-pointer gap-3 bg-[var(--sfondo)] py-3"
          role="button"
          tabIndex={0}
          aria-label={`Apri la scheda di ${r.name}`}
          onClick={(e) => {
            if (e.target.closest("a")) return;
            setAperto(r.key);
          }}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setAperto(r.key))}
        >
          <IconaTipo tipo={r.tipo} />
          <div className="min-w-0 flex-1">
            <p className={NAME}>{r.name}</p>
            <p className="micro mt-1 font-semibold" data-tipo-locale>{sottotitolo(r)}</p>
            <div className="mt-1.5">
              {r.streets.length ? r.streets.map((a) => <MapsLink key={a} name={r.name} where={a} isStreet pin />) : <MapsLink name={r.name} where={r.address} pin />}
            </div>
          </div>
        </div>
      </Riga>
    </li>
  );

  return (
    <>
      {scheda && <SchedaLocale key={scheda.key} r={scheda} onClose={() => setAperto(null)} onOpen={onOpen} onStreet={onStreet} onLink={onLink} onRegeo={onRegeo} onDelete={onDelete} />}
      {!gruppi.length && <p className="micro mt-5">Nessun locale con questi filtri.</p>}
      {gruppi.map((g) => (
        <section key={g.key} aria-label={g.label} data-gruppo-locali>
          {g.label && <h3 className={`${perSede ? "mt-3" : "mt-5"} flex items-baseline justify-between gap-3 border-b-[1.5px] border-inchiostro pb-1.5`}>
            <span className="min-w-0 text-[1.65rem] font-extrabold leading-none tracking-[-0.05em]">{g.label}</span>
            <span className="micro num shrink-0 font-bold">{g.list.length === 1 ? "1 locale" : `${g.list.length} locali`}</span>
          </h3>}
          {g.controllare && <p className="micro mt-1.5 text-[0.85rem]">Non ho trovato l'indirizzo di questi locali. Tocca il locale, poi Aggiungi indirizzo: scrivilo o incolla il link del locale su Google Maps.</p>}
          <ul className={`righe${g.label ? "" : " mt-2"}`}>{g.list.map(riga)}</ul>
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
