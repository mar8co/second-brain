// Impostazioni: modalità dati, AI, esportazione, aggiunta da iPhone.
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

export default function Settings({ archive, syncMode, session, signOut, aiStatus, settings, setSettings, toast, back }) {
  usePageColor(PAGE.settings);
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
        <p className="text-tenue">Per la Mappa, il nome e l'indirizzo dei posti citati nei contenuti vengono cercati su OpenStreetMap (gratuito) dal server dell'app; la cartina viene caricata dal sito di OpenStreetMap.</p>
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
