// Chat: la schermata principale, una conversazione con la propria memoria
// (come NotebookLM). Si fanno domande e la risposta arriva dai contenuti
// salvati, con le fonti citate [1] [2] e il passaggio da cui viene. I
// contenuti salvati non compaiono qui: stanno in Archivio. Se nel campo si
// incolla un link, viene salvato nell'archivio.
import { Fragment, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Copy, Settings } from "lucide-react";
import { AiBadge, ErrorBox, Spinner, TypeIcon } from "../components/ui.jsx";
import { SwipeElimina, Thumb } from "../components/ItemCard.jsx";
import { mergeFiles } from "../lib/upload.js";
import FilePreview from "../components/FilePreview.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { PAGE } from "../lib/colors.js";
import { askArchive, recentTurns } from "../lib/ask.js";
import { getChatLog, updateChatLog, useChatLog } from "../lib/chatlog.js";
import { getPartial, setPartial, usePartial } from "../lib/partial.js";
import { countBy } from "../lib/search.js";
import { displayHost, detectType, extractUrl } from "../lib/detect.js";
import { displayTitle } from "../lib/item.js";
import { copyText } from "../lib/clipboard.js";
import { FileStoreContext } from "../lib/fileurl.js";
import { LINK_SOURCE, isLink, linkParts } from "../lib/linkify.js";
import { conTelefoni } from "../lib/telefoni.js";
import { formatDate, typeLabel } from "../lib/format.js";
import { eventsOf, restaurantsOf } from "../lib/spots.js";

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
  const paginaRef = useRef(null);
  const testataRef = useRef(null);
  usePageColor(PAGE.chat);
  useSopraTastiera(formRef);
  useMisure(paginaRef, testataRef, formRef);
  const aggancia = useAggancioIniziale(paginaRef);

  // La posizione all'apertura la decide la chat (a filo sull'ultima risposta):
  // ricaricando l'app (per esempio quando si aggiorna) il browser non rimette
  // quella di prima.
  // Uscendo si torna al comportamento normale (le pagine aperte da qui lo ereditano).
  useEffect(() => {
    const h = window.history;
    if (!("scrollRestoration" in h)) return undefined;
    h.scrollRestoration = "manual";
    return () => {
      h.scrollRestoration = "auto";
    };
  }, []);

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
  // Domande d'esempio quando la chat è vuota: fatte con i contenuti salvati,
  // così si capisce subito cosa si può chiedere.
  const suggestions = useMemo(() => domandeEsempio(items, ai), [items, ai]);

  const conversation = useMemo(() => log.map((m, i) => ({ msg: m, newDay: i === 0 || dayKey(m.at) !== dayKey(log[i - 1].at) })), [log]);

  // Si va in fondo, come in una chat, all'apertura e a ogni nuovo messaggio:
  // se l'ultima risposta c'è già, si parte dal suo inizio, a filo sotto la
  // testata (così una risposta lunga non resta tagliata in alto; una corta
  // finisce a filo sopra il campo); finché si aspetta, in fondo.
  const listRef = useRef(null);
  // Prima che la pagina si veda: così all'apertura non compare un attimo
  // l'inizio della chat prima del salto in fondo.
  useLayoutEffect(() => {
    if (!log.length) return;
    const last = log[log.length - 1];
    const answer = last.result && !last.pending ? listRef.current?.querySelector("li:last-child [data-risposta]") : null;
    // In attesa: la domanda e sotto la risposta che si sta preparando, sotto la
    // testata (non il fondo della lista, che finirebbe dietro al campo di testo).
    const waiting = last.pending ? listRef.current?.lastElementChild?.querySelector("[data-risposta]") : null;
    const go = () => {
      if (answer) answer.scrollIntoView({ block: "start" });
      // Se la risposta sta già arrivando, la segue segui() (sotto).
      else if (waiting) getPartial(last.id) || waiting.scrollIntoView({ block: "end" });
      else endRef.current?.scrollIntoView({ block: "end" });
    };
    go();
    // Mentre si aspetta una risposta la pagina la segue: niente ritorno alla precedente.
    aggancia(answer ? go : null);
    // Subito dopo l'invio il campo si accorcia e la tastiera si assesta: si ripete
    // quando il layout è fermo, così il "Cerco nella tua memoria…" resta in vista.
    if (!waiting) return undefined;
    const t = [120, 450].map((ms) => setTimeout(go, ms));
    return () => t.forEach(clearTimeout);
  }, [log, loading, aggancia]);

  // Mentre la risposta arriva parola per parola, la pagina la segue.
  const last = log.at(-1);
  const streaming = usePartial(last?.pending ? last.id : null);
  useLayoutEffect(() => {
    if (streaming?.answer) segui(listRef.current?.lastElementChild?.querySelector("[data-risposta]"));
  }, [streaming]);

  // Freccetta per tornare in fondo, come su WhatsApp: compare quando si è saliti.
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

  // Immagine (o file) incollata nel campo: come dal "+", prima l'anteprima con
  // "Aggiungi altre" e "Salva", senza archiviare subito.
  const [incollati, setIncollati] = useState(null);
  const pasteFiles = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    setIncollati(mergeFiles([], files));
  };

  // Con l'archivio sincronizzato la domanda la prepara il server.
  const store = useContext(FileStoreContext);
  const server = store?.mode === "sync";

  const ask = async (question) => {
    // I turni precedenti servono per le domande di seguito ("e quanto costa?").
    const history = recentTurns(getChatLog());
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    updateChatLog((cur) => [...cur, { id, at: new Date().toISOString(), q: question, pending: true }]);
    // La risposta arriva anche se nel frattempo si è passati a un'altra
    // schermata; intanto si vede comparire parola per parola.
    const result = await askArchive(items, question, { ai, history, server, onPartial: (p) => setPartial(id, p) });
    updateChatLog((cur) => cur.map((m) => (m.id === id ? { ...m, pending: false, result, answeredAt: new Date().toISOString() } : m)));
    setPartial(id, null);
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
  const deleteMsg = (msg) => {
    const prev = getChatLog();
    updateChatLog((cur) => cur.filter((m) => m.id !== msg.id));
    toast("Messaggio eliminato", { action: { label: "Annulla", run: () => updateChatLog(() => prev) } });
  };
  const clearLog = () => {
    const prev = getChatLog();
    updateChatLog(() => []);
    toast("Chat pulita", { action: { label: "Annulla", run: () => updateChatLog(() => prev) } });
  };

  return (
    <>
      <main ref={paginaRef} className="pagina chat-pagina" aria-label="Chat">
        {/* Intestazione sempre visibile, a tinta unita: la conversazione le scorre sotto. */}
        <header ref={testataRef} className="testata sticky top-0 z-20 -mx-4 bg-sfondo px-4 !pb-2.5">
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
                ? "Rispondo con quello che hai salvato e ti indico le fonti. Posso anche aiutarti a usarlo: come arrivare in un posto, cosa fare, da dove cominciare."
                : 'Salva qualcosa con il Comando Rapido "Second Brain" o incolla qui un link: lo leggo, lo trascrivo e lo aggiungo alla tua memoria.'}
            </p>
            {suggestions.length > 0 && (
              <>
                <p className="micro mt-5 font-bold">Per esempio</p>
                <ul className="mt-2 flex flex-col items-start gap-1.5" aria-label="Domande d'esempio">
                  {suggestions.map((s) => (
                    <li key={s}>
                      <button type="button" className="pillola !h-auto min-h-[38px] py-1.5 text-left" onClick={() => ask(s)}>{s}</button>
                    </li>
                  ))}
                </ul>
              </>
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
                {/* Swipe a sinistra: Elimina toglie domanda e risposta, con Annulla. */}
                <SwipeElimina onDelete={() => deleteMsg(msg)}>
                  <QaBubbles msg={msg} byId={byId} archiveOk={!error} onOpen={openItem} onCopy={async (text) => toast((await copyText(text)) ? "Messaggio copiato" : "Copia non riuscita")} />
                </SwipeElimina>
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </main>

      {incollati && <FilePreview initial={incollati} archive={archive} toast={toast} onClose={() => setIncollati(null)} />}

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

// Altezze vere della testata e del campo in fondo, per il CSS della pagina
// (.chat-pagina): le risposte si fermano a filo sotto la testata e in fondo
// resta solo lo spazio del campo, che con la tastiera aperta è molto più basso
// (senza la barra Chat / Archivio). Se si era in fondo alla chat e il campo si
// alza (la tastiera che si chiude, il testo che va a capo), si resta in fondo:
// l'ultima risposta non finisce dietro al campo.
function useMisure(paginaRef, testataRef, campoRef) {
  useLayoutEffect(() => {
    const pagina = paginaRef.current;
    const testata = testataRef.current;
    const campo = campoRef.current;
    if (!pagina || !testata || !campo) return undefined;
    const misura = () => {
      const doc = document.documentElement;
      const inFondo = doc.scrollHeight - window.innerHeight - window.scrollY < 4;
      pagina.style.setProperty("--alto-testata", `${testata.offsetHeight}px`);
      pagina.style.setProperty("--alto-campo", `${campo.offsetHeight}px`);
      if (inFondo && doc.scrollHeight - window.innerHeight - window.scrollY > 1) window.scrollTo(0, doc.scrollHeight);
    };
    misura();
    if (typeof ResizeObserver === "undefined") return undefined;
    // Bordo compreso: con la tastiera cambia solo lo spazio sotto il campo.
    const ro = new ResizeObserver(misura);
    ro.observe(testata, { box: "border-box" });
    ro.observe(campo, { box: "border-box" });
    return () => ro.disconnect();
  }, [paginaRef, testataRef, campoRef]);
}

// All'apertura (app avviata o pagina Chat) l'ultima risposta resta a filo anche
// mentre la pagina si assesta: il carattere che arriva, la chat che si
// sincronizza, le misure di testata e campo. Si smette al primo tocco, alla
// rotella o a un tasto, e comunque dopo qualche secondo dal primo aggancio.
// Restituisce la funzione con cui la chat dice come tornare all'ultima risposta.
function useAggancioIniziale(paginaRef) {
  const stato = useRef({ attivo: true, vai: null, scade: 0 });
  useEffect(() => {
    const s = stato.current;
    s.attivo = true;
    const pagina = paginaRef.current;
    const riprova = () => {
      if (s.attivo && s.vai && performance.now() < s.scade) s.vai();
    };
    const ferma = () => {
      s.attivo = false;
    };
    const ro = pagina && typeof ResizeObserver !== "undefined" ? new ResizeObserver(riprova) : null;
    ro?.observe(pagina, { box: "border-box" });
    document.fonts?.ready?.then(riprova);
    const tocchi = ["pointerdown", "touchstart", "wheel", "keydown"];
    tocchi.forEach((t) => window.addEventListener(t, ferma, { capture: true, passive: true }));
    return () => {
      ferma();
      ro?.disconnect();
      tocchi.forEach((t) => window.removeEventListener(t, ferma, { capture: true }));
    };
  }, [paginaRef]);
  return useCallback((vai) => {
    const s = stato.current;
    if (!s.attivo) return;
    if (vai && !s.scade) s.scade = performance.now() + 4000;
    s.vai = vai;
  }, []);
}

// Risposta che cresce mentre arriva: la pagina scorre con lei finché il suo
// inizio arriva sotto la testata, poi si ferma (si legge dall'inizio). Se si è
// saliti a leggere altro, resta dov'è. I margini sono quelli di scrollIntoView
// (scroll-margin della risposta, dalle misure di testata e campo).
function segui(el) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top >= window.innerHeight) return;
  const css = getComputedStyle(el);
  const top = parseFloat(css.scrollMarginTop) || 0;
  const bottom = window.innerHeight - (parseFloat(css.scrollMarginBottom) || 0);
  const shift = Math.min(r.bottom - bottom, r.top - top);
  if (shift > 1) window.scrollBy(0, shift);
}

// Testo di una risposta senza i segni del grassetto e le citazioni [1].
function plainAnswer(text) {
  return String(text || "").replace(/\*\*/g, "").replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "").trim();
}

// Icona "copia" in alto a destra di un messaggio (il contenitore è relative).
function CopyIcon({ label, onClick, className = "" }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={`absolute right-1 top-1 grid h-8 w-8 place-items-center ${className}`}>
      <Copy className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}

// Domanda (a destra, nera) e risposta di Second Brain (a sinistra, bianca),
// con le fonti.
// Orario del messaggio: solo da vedere. Il testo sta in un attributo mostrato
// col CSS (::before), quindi non si seleziona e non finisce mai nel testo copiato.
function Ora({ iso, className = "" }) {
  return <time aria-label={timeOf(iso)} dateTime={iso} data-ora={timeOf(iso)} className={`num block text-right text-[11px] font-medium leading-none before:content-[attr(data-ora)] [-webkit-user-select:none] [user-select:none] [-webkit-touch-callout:none] ${className}`} />;
}

function QaBubbles({ msg, byId, archiveOk, onOpen, onCopy }) {
  const r = msg.result;
  // Risposta che sta arrivando: testo scritto finora, con le sue citazioni.
  const partial = usePartial(msg.pending ? msg.id : null);
  const writing = Boolean(msg.pending && partial?.answer);
  const answered = r && (r.kind === "answer" || r.kind === "insufficient");
  const sources = answered ? (r.sources || []).map((id) => ({ id, item: byId.get(id), quote: r.quotes?.[id] || "" })) : [];
  const maybe = (r?.candidates || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 5);
  const openSource = (n) => {
    const s = sources[n - 1];
    if (s?.item) onOpen(s.item);
  };
  // Si copia anche l'aiuto pratico, dopo la risposta.
  const answerText = [plainAnswer(r?.answer), plainAnswer(r?.aiuto)].filter(Boolean).join("\n\n");
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="relative max-w-[85%]">
          <p className="whitespace-pre-wrap rounded-[18px] rounded-br-[4px] bg-[#0a0a0a] px-3.5 py-2.5 font-semibold leading-snug text-white [-webkit-user-select:text] [user-select:text]">
            {msg.q}
            <Ora iso={msg.at} className="-mb-0.5 mt-0.5 opacity-60" />
          </p>
        </div>
      </div>
      <div className="flex justify-start" data-risposta>
        <div className={`card-bianca vignetta relative w-full max-w-[94%] py-3.5 pl-4 [-webkit-user-select:none] [user-select:none] [-webkit-touch-callout:none] ${r?.kind === "answer" || writing ? "pr-4" : "pr-11"}`}>
          {writing ? (
            <>
              <AiBadge>Risposta dai tuoi contenuti</AiBadge>
              <AnswerText
                text={partial.answer}
                count={partial.sources.length}
                onCite={(n) => {
                  const it = byId.get(partial.sources[n - 1]);
                  if (it) onOpen(it);
                }}
              />
              <p role="status" className="mt-2 flex h-4 items-center">
                <i aria-hidden="true" className="pulsa inline-block h-2 w-2 rounded-full bg-[#0a0a0a]" />
                <span className="sr-only">Sto scrivendo la risposta…</span>
              </p>
            </>
          ) : msg.pending || !r ? (
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
              {!r.aiuto && <p className="font-extrabold tracking-[-0.02em]">I tuoi contenuti non bastano per rispondere.</p>}
              {r.answer && <AnswerText text={r.answer} count={sources.length} onCite={openSource} />}
            </>
          ) : r.kind === "none" ? (
            <p className="font-semibold">Nei tuoi contenuti non trovo nulla su questo. Prova con altre parole.</p>
          ) : r.kind === "error" ? (
            <p className="font-semibold">Risposta AI non disponibile ({r.error}).{maybe.length ? " Ecco i contenuti più vicini:" : " Riprova tra poco."}</p>
          ) : (
            <p className="font-semibold">Ecco i contenuti più vicini alla tua domanda:</p>
          )}
          {answered && <AiutoPratico aiuto={r.aiuto} azioni={r.azioni} />}
          {answerText && !msg.pending && <CopyIcon label="Copia risposta" onClick={() => onCopy(answerText)} className="!top-2.5" />}
          {answered && <Sources sources={sources} archiveOk={archiveOk} onOpen={onOpen} />}
          {r && !msg.pending && !answered && r.kind !== "none" && <Nearby items={maybe} onOpen={onOpen} />}
          {r && !msg.pending && <Ora iso={msg.answeredAt || msg.at} className="-mb-1 mt-1.5 text-tenue" />}
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
    <div className="mt-2.5 space-y-2.5 text-[1.02rem] font-medium leading-[1.45] [-webkit-user-select:text] [user-select:text]">
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
  const parts = text.split(new RegExp(`(\\*\\*[^*]+\\*\\*|\\[\\d+(?:,\\s*\\d+)*\\]|${LINK_SOURCE})`, "gi"));
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
              className="num ml-[2px] inline-flex h-4 min-w-4 items-center justify-center rounded-full border-[1.5px] border-[#0a0a0a] bg-white px-[3px] align-[0.3em] text-[10px] font-extrabold leading-none text-[#0a0a0a] [-webkit-user-select:none] [user-select:none]"
              aria-label={`Fonte ${n}`}
              onClick={() => onCite(n)}
            >
              {n}
            </button>
          ))}
        </Fragment>
      );
    }
    if (isLink(part)) {
      const { url, href, rest } = linkParts(part);
      return (
        <Fragment key={i}>
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 [overflow-wrap:anywhere]">
            {url}
          </a>
          {rest}
        </Fragment>
      );
    }
    // Niente spazio tra la parola e la citazione che la segue.
    return <ConTelefoni key={i} text={/^\[\d/.test(parts[i + 1] || "") ? part.trimEnd() : part} />;
  });
}

// Numeri di telefono sottolineati: un tocco e il telefono propone di chiamare.
function ConTelefoni({ text }) {
  return conTelefoni(text).map((p, i) =>
    typeof p === "string" ? (
      <Fragment key={i}>{p}</Fragment>
    ) : (
      <a key={i} href={`tel:${p.tel}`} className="whitespace-nowrap underline underline-offset-2">
        {p.testo}
      </a>
    ),
  );
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
                <span className="num absolute -left-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border-[1.5px] border-[#0a0a0a] bg-white px-[3px] text-[10px] font-extrabold leading-none text-[#0a0a0a]">{i + 1}</span>
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

// Fino a 4 domande d'esempio fatte con l'archivio: un quartiere con dei
// ristoranti, come arrivare a un locale, gli eventi in programma e la
// categoria più usata. Senza AI solo la ricerca per categoria.
export function domandeEsempio(items, ai) {
  if (!items.length) return [];
  const out = [];
  const top = countBy(items, "categories")[0]?.[0];
  if (ai) {
    const locali = restaurantsOf(items);
    const zone = countBy(locali.map((r) => ({ categories: r.zona ? [r.zona] : [] })), "categories");
    if (zone[0]?.[1] > 1) out.push(`Dove posso mangiare a ${zone[0][0]}?`);
    const conVia = locali.find((r) => r.streets?.length);
    if (conVia) out.push(`Come arrivo a ${conVia.name}?`);
    if (eventsOf(items).upcoming.length) out.push("Che eventi ho in programma?");
  }
  if (top) out.push(`Cosa ho salvato su ${top.toLowerCase()}?`);
  if (ai && out.length < 3) out.unshift("Cosa ho salvato questa settimana?");
  return out.slice(0, 4);
}

// Aiuto pratico oltre i contenuti salvati (conoscenze generali dell'AI, senza
// fonti) e link da aprire: percorso o posto su Google Maps, ricerca sul web.
function AiutoPratico({ aiuto, azioni = [] }) {
  if (!aiuto && !azioni?.length) return null;
  return (
    <div className="mt-3 border-t border-riga pt-3" data-aiuto>
      {aiuto && (
        <>
          <p className="micro mb-1 font-bold">Oltre ai tuoi contenuti</p>
          <AnswerText text={aiuto} count={0} onCite={() => {}} />
        </>
      )}
      {azioni?.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Link utili">
          {azioni.map((a) => (
            <li key={a.url}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="pillola attiva !h-auto min-h-[38px] py-1.5 text-left">
                {a.label}
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.8} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
