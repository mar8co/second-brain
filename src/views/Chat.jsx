// Chat: la schermata principale, una conversazione con la propria memoria
// (come NotebookLM). Si fanno domande e la risposta arriva dai contenuti
// salvati, con le fonti citate [1] [2] e il passaggio da cui viene. I
// contenuti salvati non compaiono qui: stanno in Archivio. Se nel campo si
// incolla un link, viene salvato nell'archivio.
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Settings } from "lucide-react";
import { AiBadge, ErrorBox, Spinner, TypeIcon } from "../components/ui.jsx";
import { Thumb } from "../components/ItemCard.jsx";
import AddMenu from "../components/AddMenu.jsx";
import { saveFiles, uploadMessage } from "../lib/upload.js";
import { usePageColor } from "../hooks/usePageColor.js";
import { PAGE } from "../lib/colors.js";
import { askArchive, recentTurns } from "../lib/ask.js";
import { getChatLog, updateChatLog, useChatLog } from "../lib/chatlog.js";
import { countBy } from "../lib/search.js";
import { displayHost, detectType, extractUrl } from "../lib/detect.js";
import { displayTitle } from "../lib/item.js";
import { copyText } from "../lib/clipboard.js";
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
  const formRef = useRef(null);
  usePageColor(PAGE.chat);
  useSopraTastiera(formRef);

  // Niente rimbalzo in cima: altrimenti con la pagina tirata giù il titolo
  // scende con lei e il campo di testo si ridisegna senza il segnaposto.
  useEffect(() => {
    document.documentElement.classList.add("senza-rimbalzo");
    return () => document.documentElement.classList.remove("senza-rimbalzo");
  }, []);

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

  // Si va in fondo, come in una chat, a ogni nuovo messaggio: se l'ultima
  // risposta c'è già, si parte dal suo inizio (così una risposta lunga non
  // resta tagliata in alto); finché si aspetta, in fondo.
  const listRef = useRef(null);
  useEffect(() => {
    if (!log.length) return;
    const last = log[log.length - 1];
    const answer = last.result && !last.pending ? listRef.current?.querySelector("li:last-child [data-risposta]") : null;
    // In attesa: la domanda e sotto la risposta che si sta preparando, sotto la
    // testata (non il fondo della lista, che finirebbe dietro al campo di testo).
    const waiting = last.pending ? listRef.current?.lastElementChild?.querySelector("[data-risposta]") : null;
    const go = () => {
      if (answer) answer.scrollIntoView({ block: "start" });
      else if (waiting) waiting.scrollIntoView({ block: "end" });
      else endRef.current?.scrollIntoView({ block: "end" });
    };
    go();
    // Subito dopo l'invio il campo si accorcia e la tastiera si assesta: si ripete
    // quando il layout è fermo, così il "Cerco nella tua memoria…" resta in vista.
    if (!waiting) return undefined;
    const t = [120, 450].map((ms) => setTimeout(go, ms));
    return () => t.forEach(clearTimeout);
  }, [log, loading]);

  // Freccetta per tornare in fondo, come su WhatsApp: compare quando si è saliti.
  const [copia, setCopia] = useState(null);
  const [lontano, setLontano] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      setLontano(el.scrollHeight - window.scrollY - window.innerHeight > 400);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [log]);

  // Immagine (o file) incollata nel campo: salvata come dal "+", senza altri passaggi.
  const pasteFiles = async (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    toast(files.length === 1 ? "Salvo…" : `Salvo ${files.length} file…`);
    const r = await saveFiles(files, archive.add);
    toast(uploadMessage(r));
  };

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

  // Pulisci chat subito, con "Annulla" per ripensarci.
  const clearLog = () => {
    const prev = getChatLog();
    updateChatLog(() => []);
    toast("Chat pulita", { action: { label: "Annulla", run: () => updateChatLog(() => prev) } });
  };

  return (
    <>
      <main className="pagina !pb-[calc(160px+env(safe-area-inset-bottom))]" aria-label="Chat">
        {/* Intestazione sempre visibile, a tinta unita: la conversazione le scorre sotto. */}
        <header className="testata sticky top-0 z-20 -mx-4 bg-sfondo px-4 !pb-2.5">
          <h1 className="marchio">second-brain</h1>
          <div className="flex items-center gap-2">
            {log.length > 0 && (
              <button type="button" className="pillola" onClick={clearLog}>
                Pulisci chat
              </button>
            )}
            <button type="button" className="tondo" aria-label="Impostazioni" onClick={() => navigate("/impostazioni")}>
              <Settings className="h-[18px] w-[18px]" strokeWidth={2.6} aria-hidden="true" />
            </button>
          </div>
        </header>
        {pending > 0 && (
          <p className="micro mb-3 font-semibold" role="status">
            <span className="num">{pending}</span> {pending === 1 ? "contenuto ancora da elaborare" : "contenuti ancora da elaborare"}
          </p>
        )}
        {!syncMode && (
          <p className="riquadro mb-4 text-[0.92rem] font-semibold">
            <strong className="font-extrabold">Modalità locale:</strong> i dati restano solo in questo browser, senza sincronizzazione né backup.
          </p>
        )}
        {error && <ErrorBox onRetry={reload}>{error}</ErrorBox>}
        {loading ? (
          <Spinner label="Carico la tua memoria…" />
        ) : log.length === 0 ? (
          <div className="pt-4">
            <p className="grande">Chiedimi qualsiasi cosa</p>
            <p className="mt-2.5 max-w-sm font-medium text-tenue">
              {items.length
                ? "Rispondo solo con i contenuti che hai salvato: Reel, TikTok, video, caroselli, immagini, siti e note. Ti indico sempre le fonti."
                : 'Salva qualcosa con il Comando Rapido "Second Brain" o incolla qui un link: lo leggo, lo trascrivo e lo aggiungo alla tua memoria.'}
            </p>
            {suggestions.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button type="button" className="pillola" onClick={() => ask(s)}>{s}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <ol ref={listRef} className="space-y-4">
            {conversation.map(({ msg, newDay }) => (
              <li key={msg.id} className="scroll-mt-24">
                {newDay && (
                  <p className="my-4 text-center">
                    <span className="cartellino">{dayLabel(msg.at)}</span>
                  </p>
                )}
                <QaBubbles msg={msg} byId={byId} archiveOk={!error} onOpen={openItem} onCopy={(text, pt) => setCopia({ text, ...pt })} />
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </main>

      {copia && (
        <>
          <div className="fixed inset-0 z-50 [-webkit-user-select:none] [user-select:none] [-webkit-touch-callout:none]" aria-hidden="true" data-chiudi-copia onClick={() => setCopia(null)} />
          <button
            type="button"
            className="fixed z-[60] inline-flex items-center gap-2 [-webkit-user-select:none] [user-select:none] [-webkit-touch-callout:none] rounded-full border-[1.5px] border-inchiostro bg-[var(--superficie)] px-4 py-2.5 text-[0.95rem] font-extrabold tracking-[-0.02em]"
            style={{ left: Math.min(Math.max(copia.x, 80), window.innerWidth - 80), top: Math.max(copia.y - 56, 70), transform: "translateX(-50%)" }}
            onClick={async () => {
              const ok = await copyText(copia.text);
              setCopia(null);
              toast(ok ? "Messaggio copiato" : "Copia non riuscita");
            }}
          >
            <Copy className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" /> Copia messaggio
          </button>
        </>
      )}

      <form ref={formRef} onSubmit={send} className="chat-composer fixed inset-x-0 bottom-0 z-10">
        {lontano && (
          <button
            type="button"
            data-vai-in-fondo
            className="tondo absolute bottom-full left-1/2 mb-3 h-11 w-11 -translate-x-1/2 bg-white shadow-md"
            aria-label="Vai all'ultimo messaggio"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}
          >
            <ArrowDown className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
          </button>
        )}
        <div className="mx-auto flex max-w-[528px] items-end gap-2">
          <AddMenu archive={archive} navigate={navigate} toast={toast} />
          <label htmlFor="chat-q" className="sr-only">Chiedi alla tua memoria</label>
          <textarea
            ref={boxRef}
            id="chat-q"
            rows={1}
            className="campo-chat"
            placeholder="Chiedimi qualcosa..."
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onPaste={pasteFiles}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            enterKeyHint="send"
          />
          {/* Il tocco sul tasto non toglie il cursore dal campo: niente salto della
              barra prima dell'invio. */}
          <button type="submit" className="tondo nero h-[46px] w-[46px]" disabled={!text.trim()} aria-label="Invia" onMouseDown={(e) => e.preventDefault()}>
            <ArrowUp className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
          </button>
        </div>
      </form>
    </>
  );
}

// Su iPhone la tastiera copre la parte bassa della pagina e, se si scorre,
// porta con sé gli elementi fissi in fondo: il campo finirebbe sotto la
// tastiera. Si tiene il campo attaccato al bordo visibile (visualViewport).
function useSopraTastiera(ref) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    let frame = 0;
    const place = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      // Nel rimbalzo in cima alla pagina offsetTop diventa negativo: senza il
      // Math.max il campo verrebbe sollevato di tanto quanto si è tirato.
      const covered = Math.max(0, window.innerHeight - vv.height - Math.max(0, vv.offsetTop));
      el.style.transform = covered > 1 ? `translateY(${-covered}px)` : "";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    place();
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
    };
  }, [ref]);
}

// Pressione lunga (o tasto destro) su un messaggio: chiama onOpen con il punto
// premuto. Si annulla se il dito si muove (scorrimento).
function useLongPress(onOpen) {
  const t = useRef(0);
  const start = useRef(null);
  const stop = () => {
    clearTimeout(t.current);
    start.current = null;
  };
  return {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY };
      const { clientX: x, clientY: y } = e;
      clearTimeout(t.current);
      t.current = setTimeout(() => onOpen({ x, y }), 450);
    },
    onPointerMove: (e) => {
      const s0 = start.current;
      if (s0 && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > 10) stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    onContextMenu: (e) => {
      e.preventDefault();
      stop();
      onOpen({ x: e.clientX, y: e.clientY });
    },
  };
}

// Testo di una risposta senza i segni del grassetto e le citazioni [1].
function plainAnswer(text) {
  return String(text || "").replace(/\*\*/g, "").replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "").trim();
}

// Domanda (a destra, nera) e risposta di Second Brain (a sinistra, bianca),
// con le fonti.
function QaBubbles({ msg, byId, archiveOk, onOpen, onCopy }) {
  const r = msg.result;
  const answered = r && (r.kind === "answer" || r.kind === "insufficient");
  const sources = answered ? (r.sources || []).map((id) => ({ id, item: byId.get(id), quote: r.quotes?.[id] || "" })) : [];
  const maybe = (r?.candidates || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 5);
  const openSource = (n) => {
    const s = sources[n - 1];
    if (s?.item) onOpen(s.item);
  };
  const pressQ = useLongPress((pt) => onCopy(msg.q, pt));
  const pressA = useLongPress((pt) => {
    const t = plainAnswer(r?.answer);
    if (t) onCopy(t, pt);
  });
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <p {...pressQ} className="max-w-[85%] whitespace-pre-wrap rounded-[18px] rounded-br-[4px] bg-[#0a0a0a] px-3.5 py-2.5 font-semibold leading-snug text-white [-webkit-user-select:none] [user-select:none] [-webkit-touch-callout:none]">
          {msg.q}
          <time className="num ml-2 align-bottom text-[11px] font-medium opacity-60" dateTime={msg.at}>{timeOf(msg.at)}</time>
        </p>
      </div>
      <div className="flex scroll-mb-44 scroll-mt-24 justify-start" data-risposta>
        <div {...pressA} className="card-bianca vignetta w-full max-w-[94%] px-4 py-3.5 [-webkit-user-select:none] [user-select:none] [-webkit-touch-callout:none]">
          {msg.pending || !r ? (
            <p role="status" className="flex items-center gap-2 font-semibold">
              <i aria-hidden="true" className="pulsa inline-block h-2.5 w-2.5 rounded-full bg-[#0a0a0a]" /> Cerco nella tua memoria…
            </p>
          ) : r.kind === "answer" ? (
            <>
              <AiBadge>Risposta dai tuoi contenuti</AiBadge>
              <AnswerText text={r.answer} count={sources.length} onCite={openSource} />
            </>
          ) : r.kind === "insufficient" ? (
            <>
              <p className="font-extrabold tracking-[-0.02em]">I tuoi contenuti non bastano per rispondere.</p>
              {r.answer && <AnswerText text={r.answer} count={sources.length} onCite={openSource} />}
            </>
          ) : r.kind === "none" ? (
            <p className="font-semibold">Nei tuoi contenuti non trovo nulla su questo. Prova con altre parole.</p>
          ) : r.kind === "error" ? (
            <p className="font-semibold">Risposta AI non disponibile ({r.error}).{maybe.length ? " Ecco i contenuti più vicini:" : " Riprova tra poco."}</p>
          ) : (
            <p className="font-semibold">Ecco i contenuti più vicini alla tua domanda:</p>
          )}
          {answered && r.total > r.consulted && (
            <p className="micro mt-2">Ho consultato <span className="num">{r.consulted}</span> contenuti su <span className="num">{r.total}</span>: quelli più vicini alla domanda e i più recenti.</p>
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
    <div className="mt-2.5 space-y-2.5 text-[1.02rem] font-medium leading-[1.45]">
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-[#0a0a0a]">
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
        <strong key={i} className="font-extrabold">
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
              className="num mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0a0a0a] px-1 align-text-top text-[11px] font-extrabold text-white"
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

// Fonti numerate come nella risposta, in un riquadro chiuso: si vede quante
// sono, con le miniature; toccandolo si aprono titolo, chi l'ha pubblicato,
// quando, il passaggio citato e il link all'originale.
function Sources({ sources, archiveOk, onOpen }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!sources.length) return null;
  return (
    <div className="fonti mt-4">
      <button type="button" className="fonti-testa" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="text-[0.95rem] font-extrabold tracking-[-0.02em]">Fonti</span>
        <span className="num text-[0.8rem] font-semibold opacity-70">{sources.length}</span>
        {!open && (
          <span className="ml-1 flex -space-x-2" aria-hidden="true">
            {sources.slice(0, 4).map(({ id: sid, item }) =>
              item ? <Thumb key={sid} item={item} size="h-7 w-7 !rounded-lg ring-2 ring-white" /> : null,
            )}
          </span>
        )}
        <span aria-hidden="true" className="ml-auto text-[1.15rem] font-bold">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ol id={id} className="righe border-t-[1.5px] border-[#0a0a0a]">
          {sources.map(({ id: sid, item, quote }, i) => (
            <li key={sid} className="flex gap-3 py-3">
              <span className="relative shrink-0 self-start">
                {item ? <Thumb item={item} size="h-12 w-12" /> : <span className="block h-12 w-12 rounded-xl bg-[rgb(10_10_10/0.08)]" />}
                <span className="num absolute -left-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0a0a0a] px-1 text-[11px] font-extrabold text-white ring-2 ring-white">{i + 1}</span>
              </span>
              {item ? (
                <div className="min-w-0 flex-1">
                  <a
                    href={`/elemento/${item.id}`}
                    onClick={(ev) => {
                      if (ev.metaKey || ev.ctrlKey) return;
                      ev.preventDefault();
                      onOpen(item);
                    }}
                    className="line-clamp-2 font-extrabold leading-tight tracking-[-0.02em] underline-offset-[3px] hover:underline"
                  >
                    {displayTitle(item)}
                  </a>
                  <p className="micro mt-0.5 flex items-center gap-1">
                    <TypeIcon type={item.type} className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{sourceLine(item)}</span>
                  </p>
                  {quote && <blockquote className="mt-1.5 border-l-2 border-[#0a0a0a] pl-2.5 text-[0.92rem] font-semibold leading-snug">«{quote}»</blockquote>}
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[0.8rem] font-bold underline underline-offset-[3px]">
                      Apri l'originale<span aria-hidden="true"> →</span>
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm font-medium text-tenue">{archiveOk ? "Contenuto non più nell'archivio." : "Fonte non disponibile ora: l'archivio non è stato caricato."}</p>
              )}
            </li>
          ))}
        </ol>
      )}
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
    <ul className="righe mt-2 border-t-[1.5px] border-[#0a0a0a]">
      {items.map((it) => (
        <li key={it.id}>
          <a
            href={`/elemento/${it.id}`}
            onClick={(ev) => {
              ev.preventDefault();
              onOpen(it);
            }}
            className="flex items-center gap-2 py-2.5 font-bold leading-tight"
          >
            <TypeIcon type={it.type} className="h-4 w-4 shrink-0" />
            <span className="line-clamp-1 flex-1">{displayTitle(it)}</span>
            <span aria-hidden="true">→</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
