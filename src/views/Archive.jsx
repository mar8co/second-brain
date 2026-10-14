// Archivio: ricerca testuale istantanea + filtri per tipo, categoria, tag, data.
// Lo stato di ricerca e filtri sta nell'URL, così "Indietro" lo ripristina.
import { useMemo, useState } from "react";
import { Settings } from "lucide-react";
import { Page, Testata } from "../components/Layout.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { PAGE } from "../lib/colors.js";
import { ItemList } from "../components/ItemCard.jsx";
import { EmptyState, ErrorBox, Spinner } from "../components/ui.jsx";
import { countBy, countValues, searchItems } from "../lib/search.js";
import { STATUSES, TYPES } from "../lib/constants.js";

const FILTER_KEYS = ["type", "category", "tag", "status", "author", "site", "from", "to"];

export default function Archive({ archive, query, navigate, openItem, toast, ai }) {
  const { items, loading, error, reload, reanalysis, reanalyzable, reanalyzeAll } = archive;
  const q = query.get("q") || "";
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, query.get(k) || ""]));
  const active = FILTER_KEYS.filter((k) => filters[k]);
  const [open, setOpen] = useState(active.length > 0);
  usePageColor(PAGE.archive);

  const setParam = (patch) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    const s = p.toString();
    navigate(`/archivio${s ? `?${s}` : ""}`, { replace: true });
  };

  const results = useMemo(() => searchItems(items, q, filters), [items, q, filters.type, filters.category, filters.tag, filters.status, filters.author, filters.site, filters.from, filters.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => countBy(items, "categories"), [items]);
  const tags = useMemo(() => countBy(items, "tags"), [items]);
  const authors = useMemo(() => countValues(items, "author"), [items]);
  const sites = useMemo(() => countValues(items, "site_name"), [items]);

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

        {cats.length > 0 && (
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

        <div className="mt-2.5 flex items-center gap-2">
          <button type="button" className={`pillola${open ? " attiva" : ""}`} aria-expanded={open} aria-controls="filters" onClick={() => setOpen((o) => !o)}>
            Filtri{active.length ? <span className="num"> · {active.length}</span> : ""}
          </button>
          {ai && (
            <button
              type="button"
              className="pillola"
              disabled={Boolean(reanalysis) || reanalyzable.length === 0}
              onClick={async () => {
                const r = await reanalyzeAll();
                if (!r) return;
                if (r.stopped === "limit") toast(`Fermo: limite gratuito dell'AI raggiunto (${r.done} su ${r.total})`);
                else if (r.failed) toast(`Rianalizzati ${r.done - r.failed} su ${r.total}, ${r.failed} da riprovare`);
                else toast(r.done === 1 ? "1 elemento rianalizzato" : `${r.done} elementi rianalizzati`);
              }}
            >
              {reanalysis ? <span className="num">Rianalizzo {reanalysis.done}/{reanalysis.total}…</span> : <>Rianalizza{reanalyzable.length ? <span className="num"> · {reanalyzable.length}</span> : ""}</>}
            </button>
          )}
          <button type="button" className="tondo ml-auto text-[1.45rem]" aria-label="Aggiungi manualmente" onClick={() => navigate("/aggiungi")}>
            <span aria-hidden="true" className="-mt-0.5">+</span>
          </button>
        </div>

        {open && (
          <div id="filters" className="mt-4 border-t-[1.5px] border-inchiostro">
            <Scelta label="Tipo" value={filters.type} onChange={(v) => setParam({ type: v })}
              options={Object.entries(TYPES).map(([k, t]) => [k, t.label])} />
            <Scelta label="Stato" value={filters.status} onChange={(v) => setParam({ status: v })}
              options={Object.entries(STATUSES).map(([k, s]) => [k, s.label])} />
            <Scelta label="Categoria" value={filters.category} onChange={(v) => setParam({ category: v })} options={cats} />
            <Scelta label="Tag" value={filters.tag} onChange={(v) => setParam({ tag: v })} options={tags} />
            <Scelta label="Autore" value={filters.author} onChange={(v) => setParam({ author: v })} options={authors} />
            <Scelta label="Sito" value={filters.site} onChange={(v) => setParam({ site: v })} options={sites} />
            <div className="grid grid-cols-2 gap-4 border-b-[1.5px] border-inchiostro py-2.5">
              <div className="min-w-0">
                <label htmlFor="f-from" className="etichetta">Dal</label>
                <input id="f-from" type="date" className="campo piccolo min-w-0 max-w-full" value={filters.from} onChange={(e) => setParam({ from: e.target.value })} />
              </div>
              <div className="min-w-0">
                <label htmlFor="f-to" className="etichetta">Al</label>
                <input id="f-to" type="date" className="campo piccolo min-w-0 max-w-full" value={filters.to} onChange={(e) => setParam({ to: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {active.length > 0 && !open && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Filtri attivi">
            {active.map((k) => (
              <li key={k}>
                <button type="button" className="pillola attiva" onClick={() => setParam({ [k]: "" })} aria-label={`Rimuovi filtro ${filters[k]}`}>
                  {k === "type" ? TYPES[filters[k]]?.label : k === "status" ? STATUSES[filters[k]]?.label : filters[k]}
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
            <h2 className="sezione">
              <span aria-live="polite" className="num">{results.length === 1 ? "1 elemento" : `${results.length} elementi`}</span>
              {active.length > 0 && (
                <button type="button" className="link rosso min-h-0 p-0 text-[0.78rem]" onClick={() => setParam(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])))}>
                  Azzera filtri
                </button>
              )}
            </h2>
            <ItemList items={results} onOpen={openItem} />
          </>
        )}
        {!loading && results.length === 0 && active.length > 0 && (
          <button type="button" className="link rosso mt-2" onClick={() => setParam(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])))}>
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
