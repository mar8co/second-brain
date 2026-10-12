// Chiedi: domande in linguaggio naturale sull'archivio.
//
// 1. Cerco nell'archivio (nel browser) gli elementi più pertinenti.
// 2. Se l'AI è configurata, invio SOLO quelli a Gemini, che deve rispondere
//    usando esclusivamente quegli elementi e citarli come fonti.
// 3. Senza AI (o se fallisce) mostro comunque gli elementi trovati.
import { useEffect, useRef, useState } from "react";
import { Info, MessageCircleQuestion, Send } from "lucide-react";
import { Page, TopBar } from "../components/Layout.jsx";
import { ItemList } from "../components/ItemCard.jsx";
import { AiBadge, EmptyState, ErrorBox, Spinner } from "../components/ui.jsx";
import { retrieveForQuestion } from "../lib/search.js";
import { aiPayload } from "../lib/process.js";
import { api } from "../lib/api.js";

export default function Ask({ archive, query, navigate, openItem, ai }) {
  const [q, setQ] = useState(query.get("q") || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const autoRan = useRef(false);

  const ask = async (question) => {
    const text = question.trim();
    if (!text) return;
    navigate(`/chiedi?q=${encodeURIComponent(text)}`, { replace: true });
    const candidates = retrieveForQuestion(archive.items, text, 12);
    if (!candidates.length) {
      setResult({ question: text, kind: "none", candidates });
      return;
    }
    if (!ai) {
      setResult({ question: text, kind: "noai", candidates });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await api.ask(text, candidates.map(aiPayload));
      const sources = r.sources.map((id) => candidates.find((c) => c.id === id)).filter(Boolean);
      setResult({ question: text, kind: r.sufficient ? "answer" : "insufficient", answer: r.answer, sources, candidates });
    } catch (e) {
      setResult({ question: text, kind: "error", error: e.message, candidates });
    } finally {
      setLoading(false);
    }
  };

  // Domanda arrivata dalla home (?q=…): la eseguo una volta, a archivio caricato.
  useEffect(() => {
    if (autoRan.current || archive.loading || ai === null || !query.get("q")) return;
    autoRan.current = true;
    ask(query.get("q"));
  }, [archive.loading, ai]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <TopBar title="Chiedi all'archivio" />
      <Page>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <label htmlFor="ask-q" className="label">La tua domanda</label>
          <div className="flex gap-2">
            <input
              id="ask-q"
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Es. quali ricette con le zucchine ho salvato?"
              enterKeyHint="send"
              maxLength={500}
            />
            <button type="submit" className="btn-primary shrink-0 px-3.5" disabled={!q.trim() || loading} aria-label="Chiedi">
              <Send className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </form>

        <p className="mt-2 flex gap-1.5 text-xs text-muted">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {ai
            ? "Le risposte usano solo i tuoi elementi. Per rispondere invio a Google Gemini gli estratti degli elementi più pertinenti (massimo 12)."
            : ai === false
              ? "AI non configurata: ti mostro gli elementi più pertinenti, senza risposta generata."
              : "Verifico se l'AI è disponibile…"}
        </p>

        <div className="mt-6" aria-live="polite">
          {loading && <Spinner label="Cerco nell'archivio e preparo la risposta…" />}
          {!loading && !result && (
            <EmptyState icon={MessageCircleQuestion} title="Chiedi qualcosa">
              Ad esempio: “dove avevo salvato quel ristorante a Napoli?” oppure “idee regalo per mia sorella”.
            </EmptyState>
          )}
          {!loading && result && <Result result={result} openItem={openItem} />}
        </div>
      </Page>
    </>
  );
}

function Result({ result, openItem }) {
  const { kind } = result;
  if (kind === "none") {
    return (
      <div className="card p-4">
        <p className="font-medium">Nell'archivio non trovo nulla su questo.</p>
        <p className="mt-1 text-sm text-muted">Nessun elemento contiene le parole della domanda: prova a riformularla con altri termini.</p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {kind === "answer" && (
        <section className="rounded-2xl border border-ai/30 bg-ai/5 p-4">
          <AiBadge>Risposta generata dall'AI dai tuoi elementi</AiBadge>
          <p className="mt-2 whitespace-pre-wrap">{result.answer}</p>
          <p className="mt-2 text-xs text-muted">Verifica sempre nelle fonti qui sotto.</p>
        </section>
      )}
      {kind === "insufficient" && (
        <section className="card p-4">
          <p className="font-medium">L'archivio non contiene informazioni sufficienti per rispondere.</p>
          {result.answer && <p className="mt-1 text-sm text-muted">{result.answer}</p>}
        </section>
      )}
      {kind === "error" && <ErrorBox>Risposta AI non disponibile: {result.error} Ecco comunque gli elementi più pertinenti.</ErrorBox>}

      {kind === "answer" && result.sources.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Fonti usate</h2>
          <ItemList items={result.sources} onOpen={openItem} />
        </section>
      )}
      {kind !== "answer" && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Elementi forse pertinenti</h2>
          <ItemList items={result.candidates.slice(0, 8)} onOpen={openItem} />
        </section>
      )}
    </div>
  );
}
