// Impostazioni: modalità dati, AI, esportazione, aggiunta da iPhone.
import { Download, LogOut } from "lucide-react";
import { Page, TopBar } from "../components/Layout.jsx";
import QuickShare from "../components/QuickShare.jsx";

function Section({ title, children }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <div className="space-y-2 text-sm text-ink/90">{children}</div>
    </section>
  );
}

export default function Settings({ archive, syncMode, session, signOut, aiStatus, settings, setSettings, toast, back }) {
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), items: archive.items }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `second-brain-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      <TopBar title="Impostazioni" onBack={() => back("/")} />
      <Page>
        <div className="space-y-4">
          <Section title="Dove sono i tuoi dati">
            {syncMode ? (
              <>
                <p>Sincronizzati sul tuo progetto <strong>Supabase</strong> (database e file privati), visibili solo al tuo account.</p>
                <p className="text-muted">Accesso come {session?.user?.email}</p>
                <button type="button" className="btn-ghost mt-1" onClick={signOut}>
                  <LogOut className="h-4 w-4" aria-hidden="true" /> Esci
                </button>
              </>
            ) : (
              <p><strong>Modalità locale:</strong> tutto resta in questo browser (IndexedDB). Niente sincronizzazione tra dispositivi e niente backup: se cancelli i dati del sito li perdi. Esporta spesso.</p>
            )}
            <p className="text-muted">Per leggere i link, l'indirizzo viene aperto dal server dell'app (Vercel), che legge solo dati pubblici.</p>
          </Section>

          <Section title="AI (Google Gemini)">
            {aiStatus.ai === null ? (
              <p className="text-muted">Verifico…</p>
            ) : aiStatus.ai ? (
              <p>Attiva sul server (modello {aiStatus.model}). La chiave non è mai inviata all'app.</p>
            ) : (
              <p>Non configurata{aiStatus.error ? ` (${aiStatus.error})` : ""}. L'archivio, la ricerca e i filtri funzionano lo stesso.</p>
            )}
            <p className="text-muted">
              Quando la usi, il testo degli elementi da rielaborare e i file da leggere (immagini e PDF senza testo, come le scansioni) vengono inviati a Google. Ogni domanda nella
              chat invia il contenuto di tutti gli elementi salvati (titolo, autore, note, testo); se l'archivio è molto grande, il
              contenuto completo dei più pertinenti e una scheda breve degli altri. L'uso dell'API Gemini può avere costi o limiti secondo il tuo piano Google: non è un servizio gratuito garantito
              né illimitato.
            </p>
            <label className="mt-1 flex min-h-[44px] items-center justify-between gap-3">
              <span>Rielabora i contenuti con l'AI (scheda, categorie e tag)</span>
              <input
                type="checkbox"
                className="h-6 w-6 accent-[rgb(var(--accent))]"
                checked={settings.autoAi}
                onChange={(e) => setSettings({ autoAi: e.target.checked })}
                disabled={!aiStatus.ai}
              />
            </label>
          </Section>

          <Section title="Salvare da iPhone">
            <p><strong>Installa l'app:</strong> in Safari tocca Condividi → “Aggiungi alla schermata Home”.</p>
            <p>
              <strong>Più veloce:</strong> copia il link (es. da Instagram: ··· → Copia link), apri Second Brain e tocca “Incolla link”.
            </p>
            {!syncMode && (
              <p className="text-muted">Il salvataggio rapido senza aprire l'app richiede la modalità sincronizzata (Supabase).</p>
            )}
          </Section>

          {syncMode && (
            <Section title="Salvataggio rapido da iPhone">
              <QuickShare toast={toast} />
            </Section>
          )}

          <Section title="Backup">
            <p>Scarica tutto l'archivio (senza i file caricati) in formato JSON.</p>
            <button type="button" className="btn-ghost" onClick={exportJson} disabled={!archive.items.length}>
              <Download className="h-4 w-4" aria-hidden="true" /> Esporta archivio ({archive.items.length})
            </button>
          </Section>
        </div>
      </Page>
    </>
  );
}
