// Chat: la schermata principale. I contenuti salvati scorrono come messaggi
// (i più recenti in basso, come su WhatsApp); dal campo in basso si fanno
// domande sull'archivio e la risposta arriva come messaggio, con le fonti.
// Se nel campo si incolla un link, viene salvato come nuovo contenuto.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Loader2, Settings } from "lucide-react";
import { TopBar } from "../components/Layout.jsx";
import { AiBadge, ErrorBox, StatusBadge, TypeIcon } from "../components/ui.jsx";
import { askArchive } from "../lib/ask.js";
import { countBy } from "../lib/search.js";
import { displayHost, detectType, extractUrl } from "../lib/detect.js";
import { displayTitle } from "../lib/item.js";
import { typeLabel } from "../lib/format.js";

const LOG_KEY = "sb-chat-v1";
const MAX_LOG = 60;

function loadLog() {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    return Array.isArray(v) ? v.filter((m) => m && m.q && m.at) : [];
  } catch {
    return [];
  }
}

function saveLog(log) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-MAX_LOG)));
  } catch {
    /* archiviazione locale non disponibile: la cronologia resta in memoria */
  }
}

const dayKey = (iso) => new Date(iso).toDateString();

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Oggi";
  if (d.toDateString() === yesterday.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const timeOf = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export default function Chat({ archive, query, navigate, openItem, toast, ai, syncMode }) {
  const { items, loading, error, reload } = archive;
  const [log, setLog] = useState(loadLog);
  const [text, setText] = useState("");
  const [cat, setCat] = useState(query.get("categoria") || "");
  const endRef = useRef(null);
  const autoAsked = useRef(false);

  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const cats = useMemo(() => countBy(items, "categories"), [items]);

  // Contenuti e domande in un'unica sequenza cronologica.
  const timeline = useMemo(() => {
    const shown = cat ? items.filter((it) => (it.categories || []).includes(cat)) : items;
    const entries = [
      ...shown.map((it) => ({ kind: "item", at: it.created_at, key: `i-${it.id}`, item: it })),
      ...(cat ? [] : log.map((m) => ({ kind: "qa", at: m.at, key: `q-${m.id}`, msg: m }))),
    ];
    entries.sort((a, b) => new Date(a.at) - new Date(b.at));
    // Separatore di giorno sul primo messaggio di ogni giornata.
    return entries.map((e, i) => ({ ...e, newDay: i === 0 || dayKey(e.at) !== dayKey(entries[i - 1].at) }));
  }, [items, log, cat]);

  // Si parte dal fondo, come in una chat, e si scende a ogni nuovo messaggio.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [timeline.length, loading]);

  const updateLog = (fn) =>
    setLog((cur) => {
      const next = fn(cur);
      saveLog(next);
      return next;
    });

  const ask = async (question) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    updateLog((cur) => [...cur, { id, at: new Date().toISOString(), q: question, pending: true }]);
    const result = await askArchive(items, question, { ai });
    updateLog((cur) => cur.map((m) => (m.id === id ? { ...m, pending: false, result } : m)));
  };

  // Domanda arrivata da un link (/?q=…): una sola volta, ad archivio caricato.
  useEffect(() => {
    const q = query.get("q");
    if (autoAsked.current || loading || ai === null || !q) return;
    autoAsked.current = true;
    navigate("/", { replace: true });
    ask(q);
  }, [loading, ai]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    setCat("");
    const url = extractUrl(t);
    // Un link incollato da solo (con eventuale nota) diventa un nuovo contenuto.
    if (url && t.replace(url, "").trim().length < 200 && !/\?\s*$/.test(t)) {
      const note = t.replace(url, "").trim() || null;
      try {
        await archive.add({ url, note, type: detectType(url), status: "processing", categories: [], tags: [] });
        toast("Salvato nell'archivio");
      } catch (err) {
        toast(err.message || "Salvataggio non riuscito");
      }
      return;
    }
    ask(t);
  };

  const clearLog = () => {
    if (!window.confirm("Cancellare le domande e le risposte dalla chat? I contenuti salvati restano.")) return;
    updateLog(() => []);
  };

  return (
    <>
      <TopBar
        title="Second Brain"
        right={
          <>
            {log.length > 0 && (
              <button type="button" className="text-sm font-medium text-muted" onClick={clearLog}>
                Pulisci
              </button>
            )}
            <button type="button" className="btn -mr-2 px-2 text-ink" aria-label="Impostazioni" onClick={() => navigate("/impostazioni")}>
            <Settings className="h-6 w-6" aria-hidden="true" />
          </button>
          </>
        }
      />

      {cats.length > 0 && (
        <nav aria-label="Filtra per categoria" className="sticky top-[calc(3rem+max(env(safe-area-inset-top),0.75rem))] z-10 border-b border-line/60 bg-bg/90 backdrop-blur">
          <ul className="no-scrollbar mx-auto flex max-w-2xl gap-1.5 overflow-x-auto px-3 py-2">
            <li>
              <button type="button" className={cat ? "chip" : "chip-on"} aria-pressed={!cat} onClick={() => setCat("")}>Tutto</button>
            </li>
            {cats.map(([c, n]) => (
              <li key={c}>
                <button type="button" className={`${cat === c ? "chip-on" : "chip"} whitespace-nowrap`} aria-pressed={cat === c} onClick={() => setCat(cat === c ? "" : c)}>
                  {c} <span className={cat === c ? "" : "text-muted"}>{n}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <main className="mx-auto max-w-2xl px-3 pb-[calc(9.5rem+env(safe-area-inset-bottom))] pt-3" aria-label="Chat">
        {!syncMode && (
          <p className="mb-3 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm">
            <strong>Modalità locale:</strong> i dati restano solo in questo browser, senza sincronizzazione né backup.
          </p>
        )}
        {error && <ErrorBox onRetry={reload}>{error}</ErrorBox>}
        {loading ? (
          <p role="status" className="flex items-center justify-center gap-2 py-10 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Carico i tuoi contenuti…
          </p>
        ) : timeline.length === 0 ? (
          <div className="px-4 py-16 text-center text-muted">
            <p className="text-lg font-semibold text-ink">{cat ? "Nessun contenuto in questa categoria" : "La chat è vuota"}</p>
            {!cat && <p className="mt-1.5">Condividi un link con il Comando Rapido "Second Brain", oppure incollalo qui sotto. Poi chiedimi qualsiasi cosa.</p>}
          </div>
        ) : (
          <ol className="space-y-2">
            {timeline.map((e) => {
              return (
                <li key={e.key}>
                  {e.newDay && (
                    <p className="my-3 text-center">
                      <span className="rounded-full bg-sunken px-3 py-1 text-xs font-medium text-muted">{dayLabel(e.at)}</span>
                    </p>
                  )}
                  {e.kind === "item" ? (
                    <ItemBubble item={e.item} onOpen={openItem} />
                  ) : (
                    <QaBubbles msg={e.msg} byId={byId} onOpen={openItem} />
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
      </main>

      <form
        onSubmit={send}
        className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 border-t border-line/60 bg-bg/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2 px-3 py-2">
          <label htmlFor="chat-q" className="sr-only">Chiedi o cerca nei tuoi contenuti</label>
          <textarea
            id="chat-q"
            rows={1}
            className="input max-h-32 min-h-[44px] resize-none py-2.5"
            placeholder="Chiedi qualcosa sui tuoi contenuti…"
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            enterKeyHint="send"
          />
          <button type="submit" className="btn-primary h-11 w-11 shrink-0 rounded-full px-0" disabled={!text.trim()} aria-label="Invia">
            <ArrowUp className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </form>
    </>
  );
}

// Contenuto salvato: "messaggio inviato" (a destra), con anteprima.
function ItemBubble({ item, onOpen }) {
  const title = displayTitle(item);
  const site = item.site_name || (item.url ? displayHost(item.url) : item.file_name ? "File" : typeLabel(item.type));
  const source = item.author ? `${site} · ${item.author}` : site;
  const summary = item.ai?.summary || item.description || item.note || "";
  return (
    <div className="flex justify-end">
      <a
        href={`/elemento/${item.id}`}
        onClick={(ev) => {
          if (ev.metaKey || ev.ctrlKey) return;
          ev.preventDefault();
          onOpen(item);
        }}
        className="block w-[85%] max-w-md overflow-hidden rounded-2xl rounded-br-md border border-accent/20 bg-accent-soft text-ink shadow-sm active:opacity-90"
      >
        {item.image_url && (
          <img src={item.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-36 w-full object-cover" onError={(ev) => (ev.currentTarget.style.display = "none")} />
        )}
        <div className="p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <TypeIcon type={item.type} className="h-3.5 w-3.5" />
            <span className="truncate">{source}</span>
          </p>
          <p className="mt-0.5 line-clamp-2 font-semibold leading-snug">{title}</p>
          {summary && summary !== title && <p className="mt-0.5 line-clamp-2 text-sm text-ink/80">{summary}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {(item.categories || []).slice(0, 3).map((c) => (
              <span key={c} className="rounded-full bg-surface/80 px-2 py-0.5 text-xs">{c}</span>
            ))}
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
              {item.status !== "analyzed" && <StatusBadge status={item.status} />}
              <time dateTime={item.created_at}>{timeOf(item.created_at)}</time>
            </span>
          </div>
        </div>
      </a>
    </div>
  );
}

// Domanda (a destra) e risposta di Second Brain (a sinistra), con le fonti.
function QaBubbles({ msg, byId, onOpen }) {
  const r = msg.result;
  const sources = (r?.sources || []).map((id) => byId.get(id)).filter(Boolean);
  const maybe = (r?.candidates || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 5);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-accent-ink">
          {msg.q}
          <time className="ml-2 align-bottom text-[11px] opacity-70" dateTime={msg.at}>{timeOf(msg.at)}</time>
        </p>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5">
          {msg.pending || !r ? (
            <p role="status" className="flex items-center gap-2 text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cerco nei tuoi contenuti…
            </p>
          ) : r.kind === "answer" ? (
            <>
              <AiBadge>Risposta dai tuoi contenuti</AiBadge>
              <p className="mt-1.5 whitespace-pre-wrap">{r.answer}</p>
            </>
          ) : r.kind === "none" ? (
            <p>Nei tuoi contenuti non trovo nulla su questo. Prova con altre parole.</p>
          ) : r.kind === "insufficient" ? (
            <p>I tuoi contenuti non bastano per rispondere.{r.answer ? ` ${r.answer}` : ""}</p>
          ) : r.kind === "error" ? (
            <p>Risposta AI non disponibile ({r.error}).{maybe.length ? " Ecco i contenuti più vicini:" : " Riprova tra poco."}</p>
          ) : (
            <p>Ecco i contenuti più vicini alla tua domanda:</p>
          )}
          {r && !msg.pending && (r.kind === "answer" || r.kind === "insufficient") && r.total > r.consulted && (
            <p className="mt-1.5 text-xs text-muted">Ho consultato {r.consulted} contenuti su {r.total}: prima quelli con le parole della domanda, poi i più recenti.</p>
          )}
          {r && !msg.pending && (
            <SourceList
              label={r.kind === "answer" ? "Fonti" : null}
              items={r.kind === "answer" ? sources : r.kind === "none" ? [] : maybe}
              onOpen={onOpen}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SourceList({ label, items, onOpen }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 border-t border-line pt-2">
      {label && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{label}</p>}
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`/elemento/${it.id}`}
              onClick={(ev) => {
                ev.preventDefault();
                onOpen(it);
              }}
              className="flex items-center gap-2 rounded-lg py-1 text-sm text-accent underline-offset-2 hover:underline"
            >
              <TypeIcon type={it.type} className="h-4 w-4 shrink-0" />
              <span className="line-clamp-1">{displayTitle(it)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
