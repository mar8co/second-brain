// Home: campo unico per cercare o chiedere, aggiunta rapida, recenti e categorie.
import { useState } from "react";
import { ClipboardPaste, MessageCircleQuestion, Plus, Search } from "lucide-react";
import { Page } from "../components/Layout.jsx";
import { ItemList } from "../components/ItemCard.jsx";
import { EmptyState, ErrorBox, Spinner } from "../components/ui.jsx";
import { countBy } from "../lib/search.js";
import { extractUrl } from "../lib/detect.js";
import { looksLikeQuestion } from "../lib/format.js";

export default function Home({ archive, navigate, openItem, syncMode }) {
  const [q, setQ] = useState("");
  const { items, loading, error, reload } = archive;
  const cats = countBy(items, "categories");

  const submit = (mode) => {
    const text = q.trim();
    if (!text) return;
    const target = mode || (looksLikeQuestion(text) ? "ask" : "search");
    navigate(target === "ask" ? `/chiedi?q=${encodeURIComponent(text)}` : `/archivio?q=${encodeURIComponent(text)}`);
  };

  const pasteLink = async () => {
    // Su iOS la lettura degli appunti mostra il fumetto "Incolla": serve il tocco.
    try {
      const t = await navigator.clipboard.readText();
      const url = extractUrl(t);
      navigate(url ? `/aggiungi?url=${encodeURIComponent(url)}` : `/aggiungi?text=${encodeURIComponent(t || "")}`);
    } catch {
      navigate("/aggiungi");
    }
  };

  return (
    <Page>
      <div className="pt-safe" />
      <h1 className="font-serif text-[28px] font-semibold tracking-tight">Second Brain</h1>
      <p className="text-muted">Salva in un attimo, ritrova con una domanda.</p>
      {!syncMode && (
        <p className="mt-3 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm">
          <strong>Modalità locale:</strong> i dati restano solo in questo browser, senza sincronizzazione né backup.
        </p>
      )}

      <form
        role="search"
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="home-q" className="sr-only">Cerca o fai una domanda</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id="home-q"
            type="search"
            className="input pl-11"
            placeholder="Cerca o chiedi: “che ristorante avevo salvato a Roma?”"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className="btn-ghost" onClick={() => submit("search")} disabled={!q.trim()}>
            <Search className="h-4 w-4" aria-hidden="true" /> Cerca
          </button>
          <button type="button" className="btn-ghost" onClick={() => submit("ask")} disabled={!q.trim()}>
            <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" /> Chiedi
          </button>
        </div>
      </form>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="btn-primary min-h-[52px]" onClick={() => navigate("/aggiungi")}>
          <Plus className="h-5 w-5" aria-hidden="true" /> Aggiungi
        </button>
        <button type="button" className="btn-ghost min-h-[52px] bg-surface" onClick={pasteLink}>
          <ClipboardPaste className="h-5 w-5" aria-hidden="true" /> Incolla link
        </button>
      </div>

      {error && (
        <div className="mt-6">
          <ErrorBox onRetry={reload}>{error}</ErrorBox>
        </div>
      )}

      {loading ? (
        <Spinner label="Carico l'archivio…" />
      ) : items.length === 0 && !error ? (
        <EmptyState title="L'archivio è vuoto" action={<button className="btn-primary" onClick={() => navigate("/aggiungi")}>Salva il primo elemento</button>}>
          Incolla un link, un Reel, un posto di Maps o scrivi una nota: lo ritroverai qui.
        </EmptyState>
      ) : (
        <>
          {cats.length > 0 && (
            <section className="mt-7" aria-labelledby="h-cat">
              <h2 id="h-cat" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Categorie</h2>
              <ul className="flex flex-wrap gap-1.5">
                {cats.slice(0, 16).map(([c, n]) => (
                  <li key={c}>
                    <a
                      className="chip"
                      href={`/archivio?category=${encodeURIComponent(c)}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/archivio?category=${encodeURIComponent(c)}`);
                      }}
                    >
                      {c} <span className="text-muted">{n}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="mt-7" aria-labelledby="h-rec">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 id="h-rec" className="text-sm font-semibold uppercase tracking-wide text-muted">Recenti</h2>
              <a
                href="/archivio"
                className="text-sm font-medium text-accent"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/archivio");
                }}
              >
                Vedi tutto ({items.length})
              </a>
            </div>
            <ItemList items={items.slice(0, 8)} onOpen={openItem} />
          </section>
        </>
      )}
    </Page>
  );
}
