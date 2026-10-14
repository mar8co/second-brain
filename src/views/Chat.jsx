// Chat: la schermata principale, una conversazione con la propria memoria
// (come NotebookLM). Si fanno domande e la risposta arriva dai contenuti
// salvati, con le fonti citate [1] [2] e il passaggio da cui viene. I
// contenuti salvati non compaiono qui: stanno in Archivio. Se nel campo si
// incolla un link, viene salvato nell'archivio.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ExternalLink, Loader2, Settings } from "lucide-react";
import { TopBar } from "../components/Layout.jsx";
import { AiBadge, ErrorBox, TypeIcon } from "../components/ui.jsx";
import { askArchive, recentTurns } from "../lib/ask.js";
import { getChatLog, updateChatLog, useChatLog } from "../lib/chatlog.js";
import { countBy } from "../lib/search.js";
import { displayHost, detectType, extractUrl } from "../lib/detect.js";
import { displayTitle } from "../lib/item.js";
import { formatDate, typeLabel } from "../lib/format.js";
import { needsDigest } from "../lib/memory.js";

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
  const log = useChatLog();
  const [text, setText] = useState("");
  const endRef = useRef(null);
  const boxRef = useRef(null);
  const autoAsked = useRef(false);

  // Il campo cresce con il testo (fino a circa 6 righe, poi scorre).
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [text]);

  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  // Domande suggerite per cominciare: dalle categorie più usate (le date le
  // capisce solo l'AI).
  const suggestions = useMemo(() => {
    const top = countBy(items, "categories").slice(0, 3).map(([c]) => `Cosa ho salvato su ${c.toLowerCase()}?`);
    return items.length ? [...(ai ? ["Cosa ho salvato questa settimana?"] : []), ...top] : [];
  }, [items, ai]);
  // Contenuti che l'AI sta ancora leggendo o rielaborando: le risposte non li comprendono del tutto.
  const pending = useMemo(() => (ai ? items.filter((it) => it.status === "processing" || needsDigest(it)).length : 0), [items, ai]);

  const conversation = useMemo(() => log.map((m, i) => ({ msg: m, newDay: i === 0 || dayKey(m.at) !== dayKey(log[i - 1].at) })), [log]);

  // Si parte dal fondo, come in una chat, e si scende a ogni nuovo messaggio.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [log, loading]);

  const ask = async (question) => {
    // I turni precedenti servono per le domande di seguito ("e quanto costa?").
    const history = recentTurns(getChatLog());
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    updateChatLog((cur) => [...cur, { id, at: new Date().toISOString(), q: question, pending: true }]);
    // La risposta arriva anche se nel frattempo si è passati a un'altra schermata.
    const result = await askArchive(items, question, { ai, history });
    updateChatLog((cur) => cur.map((m) => (m.id === id ? { ...m, pending: false, result } : m)));
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
    // Sul telefono la tastiera si chiude: si legge la risposta a schermo intero.
    if (window.matchMedia?.("(pointer: coarse)").matches) boxRef.current?.blur();
    const url = extractUrl(t);
    // Un link incollato da solo (con eventuale nota) va nell'archivio.
    if (url && t.replace(url, "").trim().length < 200 && !/\?\s*$/.test(t)) {
      const note = t.replace(url, "").trim() || null;
      try {
        await archive.add({ url, note, type: detectType(url), status: "processing", categories: [], tags: [] });
        toast("Salvato nell'archivio: lo leggo e lo aggiungo alla memoria");
      } catch (err) {
        toast(err.message || "Salvataggio non riuscito");
      }
      return;
    }
    ask(t);
  };

  const clearLog = () => {
    if (!window.confirm("Iniziare una nuova conversazione? Domande e risposte spariscono dalla chat; i contenuti salvati restano.")) return;
    updateChatLog(() => []);
  };

  return (
    <>
      <TopBar
        title="Second Brain"
        right={
          <>
            {log.length > 0 && (
              <button type="button" className="text-sm font-medium text-muted" onClick={clearLog}>
                Nuova chat
              </button>
            )}
            <button type="button" className="btn -mr-2 px-2 text-ink" aria-label="Impostazioni" onClick={() => navigate("/impostazioni")}>
              <Settings className="h-6 w-6" aria-hidden="true" />
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-2xl px-3 pb-[calc(9.5rem+env(safe-area-inset-bottom))] pt-3" aria-label="Chat">
        {!syncMode && (
          <p className="mb-3 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm">
            <strong>Modalità locale:</strong> i dati restano solo in questo browser, senza sincronizzazione né backup.
          </p>
        )}
        {error && <ErrorBox onRetry={reload}>{error}</ErrorBox>}
        {!loading && items.length > 0 && (
          <p className="mb-2 text-center text-xs text-muted" role="status">
            Memoria: {items.length} {items.length === 1 ? "contenuto" : "contenuti"}
            {pending > 0 && ` · ${pending} ancora da elaborare`}
          </p>
        )}
        {loading ? (
          <p role="status" className="flex items-center justify-center gap-2 py-10 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Carico la tua memoria…
          </p>
        ) : log.length === 0 ? (
          <div className="px-4 py-14 text-center text-muted">
            <p className="text-lg font-semibold text-ink">Chiedimi qualsiasi cosa</p>
            <p className="mt-1.5">
              {items.length
                ? "Rispondo solo con i contenuti che hai salvato: Reel, TikTok, video, caroselli, immagini, siti e note. Ti indico sempre le fonti."
                : 'Salva qualcosa con il Comando Rapido "Second Brain" o incolla qui un link: lo leggo, lo trascrivo e lo aggiungo alla tua memoria.'}
            </p>
            {suggestions.length > 0 && (
              <ul className="mt-5 flex flex-col items-center gap-2">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button type="button" className="chip" onClick={() => ask(s)}>{s}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <ol className="space-y-3">
            {conversation.map(({ msg, newDay }) => (
              <li key={msg.id}>
                {newDay && (
                  <p className="my-3 text-center">
                    <span className="rounded-full bg-sunken px-3 py-1 text-xs font-medium text-muted">{dayLabel(msg.at)}</span>
                  </p>
                )}
                <QaBubbles msg={msg} byId={byId} archiveOk={!error} onOpen={openItem} />
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </main>

      {/* Mentre si scrive, sul telefono la barra Chat / Archivio si nasconde e il
          campo resta subito sopra la tastiera (vedi .chat-composer in index.css). */}
      <form
        onSubmit={send}
        className="chat-composer fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 border-t border-line/60 bg-bg/95 backdrop-blur"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2 px-3 py-2">
          <label htmlFor="chat-q" className="sr-only">Chiedi alla tua memoria</label>
          <textarea
            ref={boxRef}
            id="chat-q"
            rows={1}
            className="input max-h-40 min-h-[44px] resize-none overflow-y-auto py-2.5"
            placeholder="Chiedi alla tua memoria…"
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            enterKeyHint="send"
          />
          {/* Il tocco sul tasto non toglie il cursore dal campo: niente salto della
              barra prima dell'invio. */}
          <button type="submit" className="btn-primary h-11 w-11 shrink-0 rounded-full px-0" disabled={!text.trim()} aria-label="Invia" onMouseDown={(e) => e.preventDefault()}>
            <ArrowUp className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </form>
    </>
  );
}

// Domanda (a destra) e risposta di Second Brain (a sinistra), con le fonti.
function QaBubbles({ msg, byId, archiveOk, onOpen }) {
  const r = msg.result;
  const answered = r && (r.kind === "answer" || r.kind === "insufficient");
  const sources = answered ? (r.sources || []).map((id) => ({ id, item: byId.get(id), quote: r.quotes?.[id] || "" })) : [];
  const maybe = (r?.candidates || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 5);
  const openSource = (n) => {
    const s = sources[n - 1];
    if (s?.item) onOpen(s.item);
  };
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-accent-ink">
          {msg.q}
          <time className="ml-2 align-bottom text-[11px] opacity-70" dateTime={msg.at}>{timeOf(msg.at)}</time>
        </p>
      </div>
      <div className="flex justify-start">
        <div className="w-full max-w-[94%] rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5">
          {msg.pending || !r ? (
            <p role="status" className="flex items-center gap-2 text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cerco nella tua memoria…
            </p>
          ) : r.kind === "answer" ? (
            <>
              <AiBadge>Risposta dai tuoi contenuti</AiBadge>
              <AnswerText text={r.answer} count={sources.length} onCite={openSource} />
            </>
          ) : r.kind === "insufficient" ? (
            <>
              <p className="font-medium">I tuoi contenuti non bastano per rispondere.</p>
              {r.answer && <AnswerText text={r.answer} count={sources.length} onCite={openSource} />}
            </>
          ) : r.kind === "none" ? (
            <p>Nei tuoi contenuti non trovo nulla su questo. Prova con altre parole.</p>
          ) : r.kind === "error" ? (
            <p>Risposta AI non disponibile ({r.error}).{maybe.length ? " Ecco i contenuti più vicini:" : " Riprova tra poco."}</p>
          ) : (
            <p>Ecco i contenuti più vicini alla tua domanda:</p>
          )}
          {answered && r.total > r.consulted && (
            <p className="mt-1.5 text-xs text-muted">Ho consultato {r.consulted} contenuti su {r.total}: quelli più vicini alla domanda e i più recenti.</p>
          )}
          {answered && <Sources sources={sources} archiveOk={archiveOk} onOpen={onOpen} />}
          {r && !msg.pending && !answered && r.kind !== "none" && <Nearby items={maybe} onOpen={onOpen} />}
        </div>
      </div>
    </div>
  );
}

// Testo della risposta: paragrafi, elenchi con "- ", **grassetto** e
// citazioni [1] [2, 3] che aprono la fonte.
export function AnswerText({ text, count, onCite }) {
  const blocks = [];
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const bullet = /^(?:[-*•]|\d+[.)])\s+/.exec(t);
    if (bullet) {
      const last = blocks.at(-1);
      if (last?.list) last.list.push(t.slice(bullet[0].length));
      else blocks.push({ list: [t.slice(bullet[0].length)] });
    } else blocks.push({ p: t });
  }
  return (
    <div className="mt-1.5 space-y-2 leading-relaxed">
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.list.map((t, j) => (
              <li key={j}>
                <Inline text={t} count={count} onCite={onCite} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inline text={b.p} count={count} onCite={onCite} />
          </p>
        ),
      )}
    </div>
  );
}

function Inline({ text, count, onCite }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+(?:,\s*\d+)*\])/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={i}>
          <Inline text={part.slice(2, -2)} count={count} onCite={onCite} />
        </strong>
      );
    }
    const cite = /^\[(\d+(?:,\s*\d+)*)\]$/.exec(part);
    if (cite) {
      const ns = cite[1].split(",").map((n) => Number(n.trim())).filter((n) => n >= 1 && n <= count);
      return (
        <Fragment key={i}>
          {ns.map((n) => (
            <button
              key={n}
              type="button"
              className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-soft px-1 align-text-top text-[11px] font-semibold text-accent"
              aria-label={`Fonte ${n}`}
              onClick={() => onCite(n)}
            >
              {n}
            </button>
          ))}
        </Fragment>
      );
    }
    // Niente spazio tra la parola e la citazione che la segue.
    return <Fragment key={i}>{/^\[\d/.test(parts[i + 1] || "") ? part.trimEnd() : part}</Fragment>;
  });
}

// Fonti numerate come nella risposta: titolo, chi l'ha pubblicato, quando, il
// passaggio citato e il link all'originale.
function Sources({ sources, archiveOk, onOpen }) {
  if (!sources.length) return null;
  return (
    <div className="mt-3 border-t border-line pt-2">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Fonti</p>
      <ol className="space-y-2">
        {sources.map(({ id, item, quote }, i) => (
          <li key={id} className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft px-1 text-[11px] font-semibold text-accent">{i + 1}</span>
            {item ? (
              <div className="min-w-0 flex-1">
                <a
                  href={`/elemento/${item.id}`}
                  onClick={(ev) => {
                    if (ev.metaKey || ev.ctrlKey) return;
                    ev.preventDefault();
                    onOpen(item);
                  }}
                  className="line-clamp-2 text-sm font-medium text-accent underline-offset-2 hover:underline"
                >
                  {displayTitle(item)}
                </a>
                <p className="flex items-center gap-1 text-xs text-muted">
                  <TypeIcon type={item.type} className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{sourceLine(item)}</span>
                </p>
                {quote && <blockquote className="mt-1 border-l-2 border-line pl-2 text-sm italic text-ink/80">«{quote}»</blockquote>}
                {item.url && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted underline-offset-2 hover:underline">
                    <ExternalLink className="h-3 w-3" aria-hidden="true" /> Apri l'originale
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">{archiveOk ? "Contenuto non più nell'archivio." : "Fonte non disponibile ora: l'archivio non è stato caricato."}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function sourceLine(item) {
  const site = item.site_name || (item.url ? displayHost(item.url) : item.file_name ? "File" : typeLabel(item.type));
  const when = item.published_at ? `pubblicato il ${formatDate(item.published_at)}` : `salvato il ${formatDate(item.created_at)}`;
  return [site, item.author, when].filter(Boolean).join(" · ");
}

function Nearby({ items, onOpen }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-1 border-t border-line pt-2">
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
  );
}
