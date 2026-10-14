// Impostazioni: archivio (rianalizza, aggiungi), AI, salvataggio rapido da iPhone, dati e
// account; il resto (privacy, installazione) in "Informazioni e privacy", chiuso.
import { Plus, RotateCw } from "lucide-react";
import { Page, Testata } from "../components/Layout.jsx";
import QuickShare from "../components/QuickShare.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { PAGE } from "../lib/colors.js";

function Section({ title, children }) {
  return (
    <section>
      <h2 className="sezione">{title}</h2>
      <div className="space-y-2.5 text-[0.95rem] font-medium leading-snug">{children}</div>
    </section>
  );
}

export default function Settings({ archive, syncMode, session, signOut, aiStatus, settings, setSettings, toast, back, navigate }) {
  usePageColor(PAGE.settings);
  const { reanalysis, reanalyzable, reanalyzeAll } = archive;
  const reanalyze = async () => {
    const r = await reanalyzeAll();
    if (!r) return;
    if (r.stopped === "limit") toast(`Fermo: limite gratuito dell'AI raggiunto (${r.done} su ${r.total})`);
    else if (r.failed) toast(`Rianalizzati ${r.done - r.failed} su ${r.total}, ${r.failed} da riprovare`);
    else toast(r.done === 1 ? "1 elemento rianalizzato" : `${r.done} elementi rianalizzati`);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), items: archive.items }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `second-brain-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <Page>
      <Testata onBack={() => back("/")} />
      <h1 className="titolo-home">Impostazioni</h1>

      <Section title="Archivio">
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className="pillola relative" disabled={!aiStatus.ai || Boolean(reanalysis) || reanalyzable.length === 0} onClick={reanalyze}>
            <RotateCw className={`h-4 w-4${reanalysis ? " gira" : ""}`} strokeWidth={2.6} aria-hidden="true" />
            {reanalysis ? <span className="num">{reanalysis.done}/{reanalysis.total}</span> : "Rianalizza"}
            {!reanalysis && aiStatus.ai && reanalyzable.length > 0 && <span className="conta num">{reanalyzable.length}</span>}
          </button>
          <button type="button" className="pillola" onClick={() => navigate("/aggiungi")}>
            <Plus className="h-4 w-4" strokeWidth={2.8} aria-hidden="true" />
            Aggiungi
          </button>
        </div>
        <p className="micro text-[0.8rem]">Rianalizza rilegge con l'AI i contenuti non ancora analizzati bene.</p>
      </Section>

      <Section title="AI">
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(settings.autoAi)}
          className="riga-interruttore border-y border-riga"
          onClick={() => setSettings({ autoAi: !settings.autoAi })}
          disabled={!aiStatus.ai}
        >
          <span>
            <b className="block font-extrabold tracking-[-0.02em]">Rielabora con l'AI</b>
            <span className="micro">
              {aiStatus.ai === null ? "Verifico…" : aiStatus.ai ? "Scheda, categorie e tag dei contenuti" : "Non configurata: l'archivio funziona lo stesso"}
            </span>
          </span>
          <i aria-hidden="true" />
        </button>
      </Section>

      {syncMode && (
        <Section title="Salvataggio rapido da iPhone">
          <QuickShare toast={toast} />
        </Section>
      )}

      <Section title="Dati e account">
        <button type="button" className="bottone chiaro" onClick={exportJson} disabled={!archive.items.length}>
          Esporta archivio <span className="num">({archive.items.length})</span>
        </button>
        {syncMode ? (
          <>
            <p className="micro text-[0.8rem]">Accesso come {session?.user?.email}</p>
            <button type="button" className="bottone rosso" onClick={signOut}>
              Esci
            </button>
          </>
        ) : (
          <p className="text-tenue"><strong className="font-extrabold">Modalità locale:</strong> i dati restano solo in questo browser: se cancelli i dati del sito li perdi. Esporta spesso.</p>
        )}
      </Section>

      <details className="group mt-6 border-y-[1.5px] border-inchiostro">
        <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 py-2 text-[0.95rem] font-extrabold tracking-[-0.02em] [&::-webkit-details-marker]:hidden">
          <span>Informazioni e privacy</span>
          <span aria-hidden="true" className="text-[1.3rem] font-bold leading-none">
            <span className="group-open:hidden">+</span>
            <span className="hidden group-open:inline">−</span>
          </span>
        </summary>
        <div className="space-y-3 pb-5 text-[0.9rem] font-medium leading-snug">
          <p>
            <strong className="font-extrabold">Dove sono i dati.</strong>{" "}
            {syncMode
              ? "Sincronizzati sul tuo progetto Supabase (database e file privati), visibili solo al tuo account."
              : "In questo browser (IndexedDB), senza sincronizzazione né backup."}
          </p>
          <p>Per leggere un link, il suo indirizzo viene aperto dal server dell'app (Vercel), che legge solo dati pubblici.</p>
          <p>
            <strong className="font-extrabold">AI (Google Gemini).</strong>{" "}
            {aiStatus.ai ? `Attiva sul server (modello ${aiStatus.model}): la chiave non è mai inviata all'app.` : `Non configurata${aiStatus.error ? ` (${aiStatus.error})` : ""}.`}{" "}
            Quando la usi, il testo degli elementi da rielaborare e i file da leggere (immagini e PDF senza testo) vengono inviati a Google. Ogni domanda nella chat invia a Google il
            contenuto degli elementi salvati (se l'archivio è molto grande, solo dei più pertinenti e una scheda breve degli altri). L'uso dell'API Gemini può avere costi o limiti
            secondo il tuo piano Google: non è un servizio gratuito garantito né illimitato.
          </p>
          <p>
            <strong className="font-extrabold">Installare l'app.</strong> In Safari tocca Condividi → “Aggiungi alla schermata Home”. Per salvare un link copialo (da Instagram: ··· → Copia link) e
            incollalo nella chat
            {syncMode ? ", oppure usa il salvataggio rapido qui sopra." : "; il salvataggio rapido senza aprire l'app richiede la modalità sincronizzata."}
          </p>
        </div>
      </details>
    </Page>
  );
}
