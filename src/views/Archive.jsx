// Archivio: ricerca testuale istantanea + filtri per tipo, periodo, sito, autore, categoria.
// Lo stato di ricerca e filtri sta nell'URL, così "Indietro" lo ripristina.
import { useMemo, useState } from "react";
import { ChevronLeft, LayoutGrid, List, Plus, RotateCw, Settings, SlidersHorizontal } from "lucide-react";
import { Page, Testata } from "../components/Layout.jsx";
import Calendario from "../components/Calendario.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { PAGE } from "../lib/colors.js";
import { ItemGrid, ItemList } from "../components/ItemCard.jsx";
import CategoryBoxes from "../components/CategoryBoxes.jsx";
import { EmptyState, ErrorBox, Spinner } from "../components/ui.jsx";
import { countBy, countValues, groupByCategory, searchItems } from "../lib/search.js";
import { TYPES } from "../lib/constants.js";
import { formatRange } from "../lib/calendar.js";

const FILTER_KEYS = ["type", "category", "author", "site", "from", "to"];

// Vista scelta (box o lista), ricordata su questo telefono. Di partenza: box.
const VISTA_KEY = "sb-vista";
function readVista() {
  try {
    return localStorage.getItem(VISTA_KEY) === "lista" ? "lista" : "box";
  } catch {
    return "box";
  }
}

export default function Archive({ archive, query, navigate, openItem, toast, ai }) {
  const { items, loading, error, reload, reanalysis, reanalyzable, reanalyzeAll } = archive;
  const q = query.get("q") || "";
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, query.get(k) || ""]));
  const active = FILTER_KEYS.filter((k) => filters[k]);
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
  usePageColor(PAGE.archive);

  const setParam = (patch) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    const s = p.toString();
    navigate(`/archivio${s ? `?${s}` : ""}`, { replace: true });
  };

  const results = useMemo(() => searchItems(items, q, filters), [items, q, filters.type, filters.category, filters.author, filters.site, filters.from, filters.to]); // eslint-disable-line react-hooks/exhaustive-deps
  // Per i box: i risultati di ricerca e filtri, ma senza il filtro Categoria.
  const matches = useMemo(() => searchItems(items, q, { ...filters, category: "" }), [items, q, filters.type, filters.author, filters.site, filters.from, filters.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const boxes = useMemo(() => groupByCategory(matches), [matches]);
  const cats = useMemo(() => countBy(items, "categories"), [items]);
  const authors = useMemo(() => countValues(items, "author"), [items]);
  const sites = useMemo(() => countValues(items, "site_name"), [items]);
  const clearAll = () => setParam(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])));
  // Filtri attivi come pillole da togliere; Dal e Al insieme, come periodo.
  const chips = [
    ...shown.filter((k) => k !== "from" && k !== "to").map((k) => ({ key: k, label: k === "type" ? TYPES[filters[k]]?.label || filters[k] : filters[k], clear: { [k]: "" } })),
    ...(filters.from || filters.to ? [{ key: "periodo", label: formatRange(filters.from, filters.to), clear: { from: "", to: "" } }] : []),
  ];
  const reanalyze = async () => {
    const r = await reanalyzeAll();
    if (!r) return;
    if (r.stopped === "limit") toast(`Fermo: limite gratuito dell'AI raggiunto (${r.done} su ${r.total})`);
    else if (r.failed) toast(`Rianalizzati ${r.done - r.failed} su ${r.total}, ${r.failed} da riprovare`);
    else toast(r.done === 1 ? "1 elemento rianalizzato" : `${r.done} elementi rianalizzati`);
  };

  return (
    <>
      <Page>
        <Testata
          right={
            <button type="button" className="tondo" aria-label="Impostazioni" onClick={() => navigate("/impostazioni")}>
              <Settings className="h-[18px] w-[18px]" strokeWidth={2.6} aria-hidden="true" />
            </button>
          }
        />
        <h1 className="gigante">Archivio</h1>

        <div role="search">
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

        <div className="barra-azioni mt-3">
          <button
            type="button"
            className="pillola"
            disabled={!ai || Boolean(reanalysis) || reanalyzable.length === 0}
            onClick={reanalyze}
          >
            <RotateCw className={`h-4 w-4${reanalysis ? " gira" : ""}`} strokeWidth={2.6} aria-hidden="true" />
            {reanalysis ? <span className="num">{reanalysis.done}/{reanalysis.total}</span> : "Rianalizza"}
            {!reanalysis && ai && reanalyzable.length > 0 && <span className="conta num">{reanalyzable.length}</span>}
          </button>
          <button type="button" className="pillola" onClick={() => navigate("/aggiungi")}>
            <Plus className="h-4 w-4" strokeWidth={2.8} aria-hidden="true" />
            Aggiungi
          </button>
          <button type="button" className={`pillola${open ? " attiva" : ""}`} aria-expanded={open} aria-controls="filters" onClick={() => setOpen((o) => !o)}>
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
            Filtri
            {chips.length > 0 && <span className="conta num">{chips.length}</span>}
          </button>
        </div>

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
            {vista === "box" && filters.category && <p className="grande mt-5 break-words">{filters.category}</p>}
            <h2 className={`sezione${vista === "box" && filters.category ? " !mt-3" : ""}`}>
              <span className="flex min-w-0 items-center gap-2">
                {vista === "box" && filters.category && (
                  <button type="button" className="pillola" onClick={() => setParam({ category: "" })}>
                    <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.8} aria-hidden="true" />
                    Categorie
                  </button>
                )}
                <span aria-live="polite" className="num truncate">
                  {vista === "box" && !filters.category
                    ? boxes.length === 1 ? "1 categoria" : `${boxes.length} categorie`
                    : results.length === 1 ? "1 elemento" : `${results.length} elementi`}
                </span>
              </span>
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
            </h2>
            {vista === "lista" ? (
              <ItemList items={results} onOpen={openItem} />
            ) : filters.category ? (
              <ItemGrid items={results} onOpen={openItem} />
            ) : (
              <CategoryBoxes boxes={boxes} onOpen={(c) => setParam({ category: c })} />
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
function Scelta({ label, value, onChange, options }) {
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
        <span className="truncate font-bold tracking-[-0.02em]">{value ? labelOf(value) : "Tutti"}</span>
        <span aria-hidden="true" className="font-bold">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id={`${id}-scelte`} role="listbox" aria-label={label} className="flex flex-wrap gap-1.5 pb-3">
          {[["", "Tutti"], ...options].map(([k, l]) => (
            <button
              key={k || "tutti"}
              type="button"
              role="option"
              aria-selected={value === k}
              className={`pillola${value === k ? " attiva" : ""}`}
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
