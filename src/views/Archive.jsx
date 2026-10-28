// Archivio: ricerca testuale istantanea + filtri per tipo, periodo, sito, autore, categoria.
// Lo stato di ricerca e filtri sta nell'URL, così "Indietro" lo ripristina.
import { setGalleria } from "../lib/galleria.js";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ArrowUpDown, FileText, Images, LayoutGrid, List, Settings, SlidersHorizontal, Utensils } from "lucide-react";
import { Page } from "../components/Layout.jsx";
import Calendario from "../components/Calendario.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { BOX_FIXED, PAGE, categoryColor } from "../lib/colors.js";
import { moveBox, orderBoxes, readOrder, saveOrder } from "../lib/boxorder.js";
import { ItemGrid, ItemList } from "../components/ItemCard.jsx";
import CategoryBoxes from "../components/CategoryBoxes.jsx";
import { EventList, RestaurantList } from "../components/Spots.jsx";
import Gallery from "../components/Gallery.jsx";
import { docsOf, eventsOf, hideEventPatches, hideRestaurantPatches, manualStreetPatches, notesOf, photosOf, restaurantsOf } from "../lib/spots.js";
import { useStreets } from "../hooks/useStreets.js";
import { EmptyState, ErrorBox, Spinner } from "../components/ui.jsx";
import { countBy, countValues, groupByCategory, searchItems, sortItems } from "../lib/search.js";
import { TYPES } from "../lib/constants.js";
import { formatRange } from "../lib/calendar.js";

const SEZIONI = ["ristoranti", "eventi", "foto", "file"];
const FILTER_KEYS = ["type", "category", "author", "site", "from", "to", "preferiti"];
const ORDINI = ["vecchi", "nome"]; // il predefinito ("recenti", data di archiviazione) è senza parametro

// Vista scelta (box o lista), ricordata su questo telefono. Di partenza: box.
const VISTA_KEY = "sb-vista";
function readVista() {
  try {
    return localStorage.getItem(VISTA_KEY) === "lista" ? "lista" : "box";
  } catch {
    return "box";
  }
}

export default function Archive({ archive, store, toast, query, navigate, openItem }) {
  const { items, loading, error, reload } = archive;
  const q = query.get("q") || "";
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, query.get(k) || ""]));
  const active = FILTER_KEYS.filter((k) => filters[k]);
  const ordine = ORDINI.includes(query.get("ordine")) ? query.get("ordine") : "recenti";
  // Box Ristoranti: divisi per zona (predefinito) o per tipo, e filtro per tipo.
  const gruppo = query.get("gruppo") === "tipo" ? "tipo" : "zona";
  const tipoLocale = query.get("tipo") || "";
  const [vista, setVistaState] = useState(readVista);
  const setVista = (v) => {
    setVistaState(v);
    try {
      localStorage.setItem(VISTA_KEY, v);
    } catch {
      /* senza memoria del browser resta solo per questa visita */
    }
  };
  // A box la categoria si sceglie dal box: non conta come filtro da mostrare.
  const shown = active.filter((k) => !(vista === "box" && k === "category"));
  const [open, setOpen] = useState(shown.length > 0);
  // Box fissi Ristoranti ed Eventi (solo a box): quale è aperto.
  const sezioneParam = query.get("sezione");
  const sezione = vista === "box" && SEZIONI.includes(sezioneParam) ? sezioneParam : "";
  usePageColor(PAGE.archive);
  // Aperto il box Ristoranti, si cerca la via dei locali che hanno solo la città.
  useStreets(archive, sezione === "ristoranti");

  // Via di un locale scritta a mano nel box Ristoranti: si salva in ogni
  // contenuto che lo cita.
  const saveStreet = async (name, street) => {
    try {
      for (const { id, patch } of manualStreetPatches(archive.items, name, street)) await archive.update(id, patch);
    } catch {
      // Non salvata (rete o accesso): la riga resta com'era e si può riprovare.
    }
  };

  // Elimina un locale dalla lista Ristoranti (i contenuti restano salvati),
  // con "Annulla" per qualche secondo.
  const deleteRestaurant = async (name) => {
    const apply = async (hidden) => {
      try {
        for (const { id, patch } of hideRestaurantPatches(archive.items, name, hidden)) await archive.update(id, patch);
      } catch {
        // Non salvato (rete o accesso): la riga resta com'era e si può riprovare.
      }
    };
    await apply(true);
    toast("Ristorante eliminato", { action: { label: "Annulla", run: () => apply(false) } });
  };

  const deleteEvent = async (key) => {
    const apply = async (hidden) => {
      try {
        for (const { id, patch } of hideEventPatches(archive.items, key, hidden)) await archive.update(id, patch);
      } catch {
        // Non salvato: la riga resta com'era.
      }
    };
    await apply(true);
    toast("Evento eliminato", { action: { label: "Annulla", run: () => apply(false) } });
  };

  const setParam = (patch) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    const s = p.toString();
    navigate(`/archivio${s ? `?${s}` : ""}`, { replace: true });
  };

  // Entrare in un box (categoria, Ristoranti, Eventi) aggiunge una pagina alla
  // cronologia: lo swipe indietro dell'iPhone torna alle categorie, non esce
  // dall'Archivio. "Categorie" fa lo stesso passo indietro.
  const openBox = (patch) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    const qs = p.toString();
    navigate(`/archivio${qs ? `?${qs}` : ""}`, { state: { box: true } });
  };
  const closeBox = (patch) => (window.history.state?.box ? window.history.back() : setParam(patch));

  // Ricorda l'elenco visibile: la scheda aperta si scorre con lo swipe.
  const apri = (list, colore = null) => (it, ids) => {
    setGalleria(ids || list.map((x) => x.id), colore);
    openItem(it);
  };
  const nomiCat = [...new Set(items.flatMap((it) => it.categories || []))].sort((a, b) => a.localeCompare(b, "it"));
  const results = useMemo(() => { const r = searchItems(items, q, filters); return q ? r : sortItems(r, ordine); }, [items, q, ordine, filters.type, filters.category, filters.author, filters.site, filters.from, filters.to, filters.preferiti]); // eslint-disable-line react-hooks/exhaustive-deps
  // Per i box: i risultati di ricerca e filtri, ma senza il filtro Categoria.
  const matches = useMemo(() => searchItems(items, q, { ...filters, category: "" }), [items, q, filters.type, filters.author, filters.site, filters.from, filters.to, filters.preferiti]); // eslint-disable-line react-hooks/exhaustive-deps
  const boxes = useMemo(() => groupByCategory(matches), [matches]);
  const restaurants = useMemo(() => restaurantsOf(matches, ordine), [matches, ordine]);
  const events = useMemo(() => eventsOf(matches), [matches]);
  const photos = useMemo(() => photosOf(matches), [matches]);
  const docs = useMemo(() => docsOf(matches), [matches]);
  const notes = useMemo(() => notesOf(matches), [matches]);
  const eventsTotal = events.upcoming.length + events.undated.length + events.past.length;
  const plural = (n, uno, molti) => (n === 1 ? `1 ${uno}` : `${n} ${molti}`);
  const fissi = [
    { id: "ristoranti", name: "Ristoranti", Icon: Utensils, items: restaurants, sub: restaurants.length ? plural(restaurants.length, "locale", "locali") : "Ancora nessuno" },
    { id: "eventi", name: "Eventi", Icon: CalendarDays, items: [], sub: !eventsTotal ? "Ancora nessuno" : events.upcoming.length ? `${events.upcoming.length} in arrivo` : plural(eventsTotal, "evento", "eventi") },
    { id: "foto", name: "Foto e video", Icon: Images, items: photos, sub: photos.length ? plural(photos.length, "file", "file") : "Ancora nessuno" },
    { id: "file", name: "File e note", Icon: FileText, items: [...docs, ...notes], sub: docs.length + notes.length ? [docs.length ? plural(docs.length, "file", "file") : "", notes.length ? plural(notes.length, "nota", "note") : ""].filter(Boolean).join(" · ") : "Ancora nessuno" },
  ].map((t) => ({ ...t, kind: "fisso", color: BOX_FIXED[t.id] }));
  const [ordineSalvato, setOrdineSalvato] = useState(readOrder);
  const [ordina, setOrdina] = useState(false);
  const tiles = useMemo(() => {
    const nomi = [...new Set(items.flatMap((it) => it.categories || []))].sort((a, b) => a.localeCompare(b, "it"));
    const all = [...fissi, ...boxes.map(([name, its]) => ({ id: `c:${name}`, kind: "categoria", name, items: its, sub: plural(its.length, "contenuto", "contenuti"), color: categoryColor(name, nomi) }))];
    const byId = new Map(all.map((t) => [t.id, t]));
    return orderBoxes(all.map((t) => t.id), ordineSalvato).map((id) => byId.get(id));
  }, [boxes, items, restaurants, events, photos, docs, notes, ordineSalvato]); // eslint-disable-line react-hooks/exhaustive-deps
  const moveTile = (id, dir) => {
    const next = moveBox(tiles.map((t) => t.id), id, dir);
    setOrdineSalvato(next);
    saveOrder(next);
  };
  const openTile = (t) => (t.kind === "fisso" ? openBox({ sezione: t.id }) : openBox({ category: t.name }));
  const cats = useMemo(() => countBy(items, "categories"), [items]);
  const authors = useMemo(() => countValues(items, "author"), [items]);
  const sites = useMemo(() => countValues(items, "site_name"), [items]);
  // Dalla lista: swipe sulla riga e "Elimina", con "Annulla" per qualche secondo.
  const removeFromList = (item) => {
    const undo = archive.removeSoon(item);
    toast("Elemento eliminato", { action: { label: "Annulla", run: undo } });
  };
  const clearAll = () => setParam(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])));
  // Filtri attivi come pillole da togliere; Dal e Al insieme, come periodo.
  const chips = [
    ...shown.filter((k) => k !== "from" && k !== "to").map((k) => ({ key: k, label: k === "type" ? TYPES[filters[k]]?.label || filters[k] : k === "preferiti" ? "Preferiti" : filters[k], clear: { [k]: "" } })),
    ...(filters.from || filters.to ? [{ key: "periodo", label: formatRange(filters.from, filters.to), clear: { from: "", to: "" } }] : []),
  ];
  // Dentro un box il titolo della pagina è il nome del box.
  const dentro = vista === "box" && filters.category;
  const filtriBtn = (
    <button type="button" className={`pillola relative${open ? " attiva" : ""}`} aria-label={chips.length ? `Filtri, ${chips.length} attivi` : "Filtri"} aria-expanded={open} aria-controls="filters" onClick={() => setOpen((o) => !o)}>
      <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" />
      {chips.length > 0 && <span className="conta num" aria-hidden="true">{chips.length}</span>}
    </button>
  );
  const sezioneTile = fissi.find((t) => t.id === sezione);
  const titolo = sezione ? sezioneTile.name : dentro ? filters.category : "Archivio";
  const indietro = sezione ? () => closeBox({ sezione: "" }) : dentro ? () => closeBox({ category: "" }) : null;
  const conteggio = sezione
    ? sezioneTile.sub
    : vista === "box" && !filters.category
      ? boxes.length === 1 ? "1 categoria" : `${boxes.length} categorie`
      : results.length === 1 ? "1 elemento" : `${results.length} elementi`;
  return (
    <>
      <Page>
        {/* Il titolo grande sta sulla stessa riga dell'icona Impostazioni. */}
        <header className="testata !items-start !pb-0">
          <h1 className="gigante !mb-4 min-w-0 flex-1" style={{ overflowWrap: "break-word", hyphens: "manual" }}>{titolo}</h1>
          <button type="button" className="tondo mt-1" aria-label="Impostazioni" onClick={() => navigate("/impostazioni")}>
            <Settings className="h-[18px] w-[18px]" strokeWidth={2.6} aria-hidden="true" />
          </button>
        </header>

        <div role="search">
          <div className="min-w-0">
            <label htmlFor="arch-q" className="sr-only">Cerca nell'archivio</label>
            <input
              id="arch-q"
              type="search"
              className="campo"
              placeholder="Cerca per parole, tag, sito…"
              value={q}
              onChange={(e) => setParam({ q: e.target.value })}
              enterKeyHint="search"
              autoComplete="off"
            />
          </div>
        </div>

        {cats.length > 0 && vista === "lista" && (
          <ul className="fila-chip mt-3.5" aria-label="Categorie">
            <li className="shrink-0">
              <button type="button" className={`pillola${filters.category ? "" : " attiva"}`} aria-pressed={!filters.category} onClick={() => setParam({ category: "" })}>
                Tutte
              </button>
            </li>
            {cats.map(([c, n]) => (
              <li key={c} className="shrink-0">
                <button type="button" className={`pillola${filters.category === c ? " attiva" : ""}`} aria-pressed={filters.category === c} onClick={() => setParam({ category: filters.category === c ? "" : c })}>
                  {c} <span className="num opacity-60">{n}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!loading && (
          <h2 className="sezione !mt-3.5 !border-b-0 !pb-0">
            <span className="flex min-w-0 items-center gap-2">
              {indietro && (
                <button type="button" className="pillola" onClick={indietro}>
                  <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.8} aria-hidden="true" />
                  Categorie
                </button>
              )}
              {!sezione && filtriBtn}
              {!sezione && !dentro && vista === "box" && items.length > 0 && (
                <button type="button" className={`pillola${ordina ? " attiva" : ""}`} aria-pressed={ordina} onClick={() => setOrdina((o) => !o)}>
                  <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" />
                  {ordina ? "Fine" : "Ordina"}
                </button>
              )}
              <span aria-live="polite" className="sr-only">{conteggio}</span>
            </span>
            {sezione === "ristoranti" && restaurants.length > 0 && (
              <span className="gruppo-locali" role="group" aria-label="Raggruppa">
                <button type="button" aria-pressed={gruppo === "zona"} onClick={() => setParam({ gruppo: "" })}>Zona</button>
                <button type="button" aria-pressed={gruppo === "tipo"} onClick={() => setParam({ gruppo: "tipo", tipo: "" })}>Tipo</button>
              </span>
            )}
            {sezione && filtriBtn}
            {!sezione && items.length > 0 && (
              <span className="flex shrink-0 gap-1.5" role="group" aria-label="Vista">
                <button type="button" className={`pillola${vista === "box" ? " attiva" : ""}`} aria-pressed={vista === "box"} onClick={() => setVista("box")}>
                  <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" />
                  Box
                </button>
                <button type="button" className={`pillola${vista === "lista" ? " attiva" : ""}`} aria-pressed={vista === "lista"} onClick={() => setVista("lista")}>
                  <List className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden="true" />
                  Lista
                </button>
              </span>
            )}
          </h2>
        )}

        {open && (
          <div id="filters" className="mt-4 border-t-[1.5px] border-inchiostro">
            <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-riga">
              <span className="micro font-semibold">
                {chips.length === 0 ? "Nessun filtro attivo" : chips.length === 1 ? "1 filtro attivo" : `${chips.length} filtri attivi`}
              </span>
              <button type="button" className="link rosso text-[0.85rem]" disabled={!active.length} onClick={clearAll}>
                Azzera filtri
              </button>
            </div>
            <Scelta label="Tipo" value={filters.type} onChange={(v) => setParam({ type: v })}
              options={Object.entries(TYPES).map(([k, t]) => [k, t.label])} />
            <Periodo from={filters.from} to={filters.to} onChange={(v) => setParam(v)} />
            <Scelta label="Sito" value={filters.site} onChange={(v) => setParam({ site: v })} options={sites} />
            <Scelta label="Autore" value={filters.author} onChange={(v) => setParam({ author: v })} options={authors} />
            <Scelta label="Categoria" value={filters.category} onChange={(v) => setParam({ category: v })} options={cats} />
            <Scelta label="Preferiti" value={filters.preferiti} onChange={(v) => setParam({ preferiti: v })} options={[["1", "Solo preferiti"]]} />
            <Scelta label="Ordina per" value={ordine === "recenti" ? "" : ordine} vuoto="Più recenti" onChange={(v) => setParam({ ordine: v })} options={[["vecchi", "Meno recenti"], ["nome", "Nome A–Z"]]} />
          </div>
        )}

        {chips.length > 0 && !open && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Filtri attivi">
            {chips.map((c) => (
              <li key={c.key}>
                <button type="button" className="pillola attiva" onClick={() => setParam(c.clear)} aria-label={`Rimuovi filtro ${c.label}`}>
                  {c.label}
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <div className="mt-4"><ErrorBox onRetry={reload}>{error}</ErrorBox></div>}

        {loading ? (
          <Spinner />
        ) : sezione ? (
          <>
            {sezione === "ristoranti" ? (
              <RestaurantList restaurants={restaurants} onOpen={apri(restaurants.flatMap((r) => r.items), BOX_FIXED.ristoranti)} onStreet={saveStreet} onDelete={deleteRestaurant} gruppo={gruppo} tipo={tipoLocale} onTipo={(t) => setParam({ tipo: t })} />
            ) : sezione === "foto" || sezione === "file" ? (
              <FotoBox items={sezione === "foto" ? photos : docs} notes={sezione === "file" ? notes : null} store={store} onOpen={apri(sezione === "foto" ? photos : [...docs, ...notes], sezione === "foto" ? BOX_FIXED.foto : BOX_FIXED.file)} vuoto={sezione === "foto" ? "Ancora nessuna foto o video" : "Ancora nessun file o nota"} />
            ) : (
              <EventList events={events} onOpen={apri([...events.upcoming, ...events.undated, ...events.past].flatMap((e) => e.items), BOX_FIXED.eventi)} onDelete={deleteEvent} />
            )}
          </>
        ) : results.length === 0 ? (
          items.length === 0 ? (
            <EmptyState title="Ancora niente qui" action={<button type="button" className="bottone" onClick={() => navigate("/aggiungi")}>+ Aggiungi qualcosa</button>}>
              Quando salvi qualcosa, lo trovi in questo elenco.
            </EmptyState>
          ) : (
            <EmptyState title="Nessun risultato">
              Prova con meno parole o togli qualche filtro.
              {q && (
                <>
                  {" "}Oppure{" "}
                  <a className="font-bold text-inchiostro underline underline-offset-[3px]" href={`/?q=${encodeURIComponent(q)}`} onClick={(e) => { e.preventDefault(); navigate(`/?q=${encodeURIComponent(q)}`); }}>
                    fai una domanda
                  </a>
                  .
                </>
              )}
            </EmptyState>
          )
        ) : (
          <>
            {vista === "lista" ? (
              <ItemList items={results} onOpen={apri(results, { bg: "#ffffff", fg: "#0a0a0a" })} onDelete={removeFromList} />
            ) : filters.category ? (
              <ItemGrid items={results} onOpen={apri(results, categoryColor(filters.category, nomiCat))} />
            ) : (
              <CategoryBoxes tiles={tiles} onOpen={openTile} ordina={ordina} onMove={moveTile} />
            )}
          </>
        )}
        {!loading && results.length === 0 && active.length > 0 && !open && (
          <button type="button" className="link rosso mt-2" onClick={clearAll}>
            Azzera filtri
          </button>
        )}
      </Page>
    </>
  );
}

// Scelta dentro l'app al posto del menu a tendina del sistema: una riga con
// etichetta e valore; toccandola si aprono le pillole delle scelte.
function Scelta({ label, value, onChange, options, vuoto = "Tutti" }) {
  const [open, setOpen] = useState(false);
  const id = `f-${label.toLowerCase()}`;
  // options: [valore, etichetta] oppure [valore, conteggio]
  const labelOf = (v) => {
    const o = options.find(([k]) => k === v);
    return o ? (typeof o[1] === "number" ? o[0] : o[1]) : v;
  };
  if (!options.length) return null;
  return (
    <div className="border-b border-riga">
      <button
        type="button"
        id={id}
        className="grid w-full grid-cols-[6.2em_1fr_auto] items-center gap-2.5 py-3 text-left"
        aria-expanded={open}
        aria-controls={`${id}-scelte`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="micro font-semibold">{label}</span>
        <span className="truncate font-bold tracking-[-0.02em]">{value ? labelOf(value) : vuoto}</span>
        <span aria-hidden="true" className="font-bold">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id={`${id}-scelte`} role="listbox" aria-label={label} className="flex flex-wrap gap-1.5 pb-3">
          {[["", vuoto], ...options].map(([k, l]) => (
            <button
              key={k || "tutti"}
              type="button"
              role="option"
              aria-selected={value === k}
              className={`pillola scelta${value === k ? " attiva" : ""}`}
              onClick={() => {
                onChange(k);
                setOpen(false);
              }}
            >
              {typeof l === "number" ? <>{k} <span className="num opacity-60">{l}</span></> : l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Periodo: una riga come le altre; si apre sul calendario dell'app, dove si
// toccano il primo e l'ultimo giorno.
function Periodo({ from, to, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-riga">
      <button
        type="button"
        id="f-periodo"
        className="grid w-full grid-cols-[6.2em_1fr_auto] items-center gap-2.5 py-3 text-left"
        aria-expanded={open}
        aria-controls="f-periodo-cal"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="micro font-semibold">Periodo</span>
        <span className="truncate font-bold tracking-[-0.02em]">{from || to ? formatRange(from, to) : "Sempre"}</span>
        <span aria-hidden="true" className="font-bold">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id="f-periodo-cal">
          <Calendario from={from} to={to} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// Box Foto e video / File: i file caricati dalla Chat, con le categorie dell'AI come filtro rapido.
function FotoBox({ items, notes, store, onOpen, vuoto }) {
  const [cat, setCat] = useState("");
  const cats = countBy(items, "categories");
  const list = cat ? items.filter((it) => (it.categories || []).includes(cat)) : items;
  if (!items.length && !notes?.length) {
    return (
      <EmptyState title={vuoto}>Dal tondo + nella Chat salvi foto, video, documenti e note: li trovi tutti qui.</EmptyState>
    );
  }
  return (
    <>
      {cats.length > 1 && (
        <ul className="fila-chip mt-3.5" aria-label="Categorie dei file">
          <li className="shrink-0">
            <button type="button" className={`pillola${cat ? "" : " attiva"}`} aria-pressed={!cat} onClick={() => setCat("")}>Tutte</button>
          </li>
          {cats.map(([c, n]) => (
            <li key={c} className="shrink-0">
              <button type="button" className={`pillola${cat === c ? " attiva" : ""}`} aria-pressed={cat === c} onClick={() => setCat(cat === c ? "" : c)}>
                {c} <span className="num opacity-60">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && <Gallery items={list} store={store} onOpen={onOpen} />}
      {notes?.length > 0 && (
        <>
          <h3 className="sezione">Note</h3>
          <ItemList items={notes} onOpen={onOpen} />
        </>
      )}
    </>
  );
}
