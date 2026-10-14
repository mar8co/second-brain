// Archivio: ricerca testuale istantanea + filtri per tipo, categoria, tag, data.
// Lo stato di ricerca e filtri sta nell'URL, così "Indietro" lo ripristina.
import { useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Search, Settings, SlidersHorizontal, X } from "lucide-react";
import { Page, TopBar } from "../components/Layout.jsx";
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
      <TopBar
        title="Archivio"
        right={
          <button type="button" className="btn -mr-2 px-2 text-ink" aria-label="Impostazioni" onClick={() => navigate("/impostazioni")}>
            <Settings className="h-6 w-6" aria-hidden="true" />
          </button>
        }
      />
      <Page>
        <div role="search">
          <label htmlFor="arch-q" className="sr-only">Cerca nell'archivio</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              id="arch-q"
              type="search"
              className="input pl-11"
              placeholder="Cerca per parole, tag, sito…"
              value={q}
              onChange={(e) => setParam({ q: e.target.value })}
              enterKeyHint="search"
            />
          </div>
        </div>

        {cats.length > 0 && (
          <ul className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Categorie">
            <li className="shrink-0">
              <button type="button" className={filters.category ? "chip" : "chip-on"} aria-pressed={!filters.category} onClick={() => setParam({ category: "" })}>
                Tutte
              </button>
            </li>
            {cats.map(([c, n]) => (
              <li key={c} className="shrink-0">
                <button type="button" className={filters.category === c ? "chip-on" : "chip"} aria-pressed={filters.category === c} onClick={() => setParam({ category: filters.category === c ? "" : c })}>
                  {c} <span className="opacity-70">{n}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost min-h-[38px] px-3 text-sm"
            aria-expanded={open}
            aria-controls="filters"
            onClick={() => setOpen((o) => !o)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filtri{active.length ? ` (${active.length})` : ""}
          </button>
          {ai && (
            <button
              type="button"
              className="btn-ghost min-h-[38px] px-3 text-sm"
              disabled={Boolean(reanalysis) || reanalyzable.length === 0}
              onClick={async () => {
                const r = await reanalyzeAll();
                if (!r) return;
                if (r.stopped === "limit") toast(`Fermo: limite gratuito dell'AI raggiunto (${r.done} su ${r.total}). Riprova più tardi.`);
                else if (r.failed) toast(`Rianalizzati ${r.done - r.failed} su ${r.total}: ${r.failed} non riusciti, riprova più tardi.`);
                else toast(`Rianalizzati ${r.done} elementi`);
              }}
            >
              {reanalysis ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              {reanalysis ? `Rianalizzo ${reanalysis.done}/${reanalysis.total}…` : `Rianalizza${reanalyzable.length ? ` (${reanalyzable.length})` : ""}`}
            </button>
          )}
          <button type="button" className="btn-ghost ml-auto h-[38px] min-h-[38px] w-[38px] shrink-0 px-0" aria-label="Aggiungi manualmente" onClick={() => navigate("/aggiungi")}>
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {active.length > 0 && (
          <p className="mt-1.5">
            <button type="button" className="text-sm font-medium text-accent" onClick={() => setParam(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])))}>
              Azzera filtri
            </button>
          </p>
        )}

        {open && (
          <div id="filters" className="card mt-2 grid grid-cols-2 gap-3 p-3.5">
            <Select label="Tipo" value={filters.type} onChange={(v) => setParam({ type: v })}
              options={Object.entries(TYPES).map(([k, t]) => [k, t.label])} />
            <Select label="Stato" value={filters.status} onChange={(v) => setParam({ status: v })}
              options={Object.entries(STATUSES).map(([k, s]) => [k, s.label])} />
            <Select label="Categoria" value={filters.category} onChange={(v) => setParam({ category: v })}
              options={cats.map(([c, n]) => [c, `${c} (${n})`])} />
            <Select label="Tag" value={filters.tag} onChange={(v) => setParam({ tag: v })}
              options={tags.map(([c, n]) => [c, `${c} (${n})`])} />
            <Select label="Autore" value={filters.author} onChange={(v) => setParam({ author: v })}
              options={authors.map(([c, n]) => [c, `${c} (${n})`])} />
            <Select label="Sito" value={filters.site} onChange={(v) => setParam({ site: v })}
              options={sites.map(([c, n]) => [c, `${c} (${n})`])} />
            <div className="min-w-0">
              <label htmlFor="f-from" className="label">Dal</label>
              <input id="f-from" type="date" className="input min-w-0 max-w-full py-2" value={filters.from} onChange={(e) => setParam({ from: e.target.value })} />
            </div>
            <div className="min-w-0">
              <label htmlFor="f-to" className="label">Al</label>
              <input id="f-to" type="date" className="input min-w-0 max-w-full py-2" value={filters.to} onChange={(e) => setParam({ to: e.target.value })} />
            </div>
          </div>
        )}

        {active.length > 0 && !open && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Filtri attivi">
            {active.map((k) => (
              <li key={k}>
                <button type="button" className="chip-on" onClick={() => setParam({ [k]: "" })} aria-label={`Rimuovi filtro ${filters[k]}`}>
                  {k === "type" ? TYPES[filters[k]]?.label : k === "status" ? STATUSES[filters[k]]?.label : filters[k]}
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <div className="mt-4"><ErrorBox onRetry={reload}>{error}</ErrorBox></div>}

        <div className="mt-4">
          {loading ? (
            <Spinner />
          ) : results.length === 0 ? (
            items.length === 0 ? (
              <EmptyState title="Ancora niente qui">
                Quando salvi qualcosa, lo trovi in questo elenco.
              </EmptyState>
            ) : (
              <EmptyState icon={Search} title="Nessun risultato">
                Prova con meno parole o togli qualche filtro.
                {q && (
                  <>
                    {" "}Oppure{" "}
                    <a className="font-medium text-accent underline" href={`/?q=${encodeURIComponent(q)}`} onClick={(e) => { e.preventDefault(); navigate(`/?q=${encodeURIComponent(q)}`); }}>
                      fai una domanda
                    </a>
                    .
                  </>
                )}
              </EmptyState>
            )
          ) : (
            <>
              <p className="mb-2 text-sm text-muted" aria-live="polite">
                {results.length === 1 ? "1 elemento" : `${results.length} elementi`}
              </p>
              <ItemList items={results} onOpen={openItem} />
            </>
          )}
        </div>
      </Page>
    </>
  );
}

function Select({ label, value, onChange, options }) {
  const id = `f-${label.toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} className="input py-2" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tutti</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}
