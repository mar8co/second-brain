// Impostazioni: archivio (rianalizza, aggiungi), modalità dati, AI, esportazione, aggiunta da iPhone.
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
        <p className="micro text-[0.8rem]">Aggiungi salva un nuovo contenuto. Rianalizza rilegge e rielabora con l'AI i contenuti non ancora analizzati bene.</p>
      </Section>

      <Section title="Dove sono i tuoi dati">
        {syncMode ? (
          <>
            <p>Sincronizzati sul tuo progetto <strong className="font-extrabold">Supabase</strong> (database e file privati), visibili solo al tuo account.</p>
            <p className="micro text-[0.8rem]">Accesso come {session?.user?.email}</p>
            <button type="button" className="bottone rosso" onClick={signOut}>
              Esci
            </button>
          </>
        ) : (
          <p><strong className="font-extrabold">Modalità locale:</strong> tutto resta in questo browser (IndexedDB). Niente sincronizzazione tra dispositivi e niente backup: se cancelli i dati del sito li perdi. Esporta spesso.</p>
        )}
        <p className="text-tenue">Per leggere i link, l'indirizzo viene aperto dal server dell'app (Vercel), che legge solo dati pubblici.</p>
      </Section>

      <Section title="AI (Google Gemini)">
        {aiStatus.ai === null ? (
          <p className="text-tenue">Verifico…</p>
        ) : aiStatus.ai ? (
          <p>Attiva sul server (modello {aiStatus.model}). La chiave non è mai inviata all'app.</p>
        ) : (
          <p>Non configurata{aiStatus.error ? ` (${aiStatus.error})` : ""}. L'archivio, la ricerca e i filtri funzionano lo stesso.</p>
        )}
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
            <span className="micro">Scheda, categorie e tag dei contenuti</span>
          </span>
          <i aria-hidden="true" />
        </button>
        <p className="text-tenue">
          Quando la usi, il testo degli elementi da rielaborare e i file da leggere (immagini e PDF senza testo, come le scansioni) vengono inviati a Google. Ogni domanda nella
          chat invia il contenuto di tutti gli elementi salvati (titolo, autore, note, testo); se l'archivio è molto grande, il
          contenuto completo dei più pertinenti e una scheda breve degli altri. L'uso dell'API Gemini può avere costi o limiti secondo il tuo piano Google: non è un servizio gratuito garantito
          né illimitato.
        </p>
      </Section>

      <Section title="Salvare da iPhone">
        <p><strong className="font-extrabold">Installa l'app:</strong> in Safari tocca Condividi → “Aggiungi alla schermata Home”.</p>
        <p>
          <strong className="font-extrabold">Più veloce:</strong> copia il link (es. da Instagram: ··· → Copia link), apri Second Brain e incollalo nella chat.
        </p>
        {!syncMode && <p className="text-tenue">Il salvataggio rapido senza aprire l'app richiede la modalità sincronizzata (Supabase).</p>}
      </Section>

      {syncMode && (
        <Section title="Salvataggio rapido da iPhone">
          <QuickShare toast={toast} />
        </Section>
      )}

      <Section title="Backup">
        <p>Scarica tutto l'archivio (senza i file caricati) in formato JSON.</p>
        <button type="button" className="bottone chiaro" onClick={exportJson} disabled={!archive.items.length}>
          Esporta archivio <span className="num">({archive.items.length})</span>
        </button>
      </Section>
    </Page>
  );
}
