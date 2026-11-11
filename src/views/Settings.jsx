// Impostazioni, dall'uso più frequente al meno frequente: Archivio (backup,
// rianalizza), AI, App (condividi l'app, salvataggio rapido da iPhone),
// Account (esci); il resto (privacy, installazione) in "Informazioni e
// privacy", chiuso. Ogni azione è una riga con icona, nome e una spiegazione.
import { DatabaseBackup, LogOut, RotateCw, Share } from "lucide-react";
import { Page, Testata } from "../components/Layout.jsx";
import Notifiche from "../components/Notifiche.jsx";
import QuickShare from "../components/QuickShare.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { PAGE } from "../lib/colors.js";
import { useState } from "react";
import { creaBackup, preferenze } from "../lib/backup.js";
import { getChatLog } from "../lib/chatlog.js";

function Section({ title, children }) {
  return (
    <section>
      <h2 className="sezione">{title}</h2>
      <div className="text-[0.95rem] font-medium leading-snug">{children}</div>
    </section>
  );
}

// Una riga per azione: icona, nome in grassetto, spiegazione sotto, a destra
// un numero o l'avanzamento. Il nome è anche il nome accessibile del tasto.
function Riga({ icona: Icona, nome, nota, destra, rosso = false, gira = false, ...props }) {
  return (
    <button type="button" className={`riga-azione${rosso ? " rosso" : ""}`} aria-label={nome} {...props}>
      <Icona className={`h-5 w-5 flex-none${gira ? " gira" : ""}`} strokeWidth={2.5} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <b className="block font-extrabold tracking-[-0.02em]">{nome}</b>
        {nota && <span className="micro block">{nota}</span>}
      </span>
      {destra}
    </button>
  );
}

// Link dell'app: con il menu Condividi del telefono, altrimenti copiato.
async function condividiApp(toast) {
  const url = window.location.origin;
  const dati = { title: "Second Brain", text: "Second Brain: salva link, reel, posti e note e ritrovali chiedendo.", url };
  if (navigator.share) {
    try {
      await navigator.share(dati);
      return;
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Link dell'app copiato");
  } catch {
    toast(url);
  }
}

export default function Settings({ archive, store, syncMode, session, signOut, aiStatus, settings, setSettings, toast, back }) {
  usePageColor(PAGE.settings);
  const { reanalysis, reanalyzable, reanalyzeAll } = archive;
  const reanalyze = async () => {
    const r = await reanalyzeAll();
    if (!r) return;
    if (r.stopped === "limit") toast(`Fermo: limite gratuito dell'AI raggiunto (${r.done} su ${r.total})`);
    else if (r.failed) toast(`Rianalizzati ${r.done - r.failed} su ${r.total}, ${r.failed} da riprovare`);
    else toast(r.done === 1 ? "1 elemento rianalizzato" : `${r.done} elementi rianalizzati`);
  };
  // Backup completo: contenuti, chat, preferenze e file (foto, PDF) in uno zip.
  const [backup, setBackup] = useState(null);
  const faiBackup = async () => {
    if (backup) return;
    setBackup({ fatti: 0, totale: 0 });
    try {
      const r = await creaBackup({
        items: archive.items,
        chat: getChatLog(),
        prefs: preferenze(),
        scarica: async (it) => {
          const url = await store.fileUrl(it);
          if (!url) throw new Error("indirizzo del file non disponibile");
          const res = await fetch(url);
          if (!res.ok) throw new Error(`errore ${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        },
        avanzamento: (fatti, totale) => setBackup({ fatti, totale }),
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([r.zip], { type: "application/zip" }));
      a.download = `second-brain-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      toast(r.mancanti ? `Backup pronto, ${r.mancanti} file non scaricati` : "Backup pronto, con foto, PDF e chat");
    } catch (e) {
      toast(e?.message || "Backup non riuscito");
    } finally {
      setBackup(null);
    }
  };

  return (
    <Page>
      <Testata onBack={() => back("/")} right={syncMode ? <Notifiche toast={toast} /> : null} />
      <h1 className="titolo-home">Impostazioni</h1>

      <Section title="Archivio">
        <div className="righe-azioni">
          <Riga
            icona={DatabaseBackup}
            nome="Fai il Backup"
            nota={backup ? (backup.totale ? `File ${backup.fatti}/${backup.totale}` : "Preparo…") : "Contenuti, chat, foto e PDF in un file .zip"}
            onClick={faiBackup}
            disabled={!archive.items.length || Boolean(backup)}
          />
          {/* Rianalizza solo quando c'è qualcosa da rileggere: il resto l'app lo fa da sola. */}
          {aiStatus.ai && (reanalysis || reanalyzable.length > 0) && (
            <Riga
              icona={RotateCw}
              gira={Boolean(reanalysis)}
              nome="Rianalizza"
              nota={reanalysis ? `${reanalysis.done} su ${reanalysis.total}` : "Rilegge i contenuti letti male o a metà"}
              destra={!reanalysis && <span className="conta-riga num">{reanalyzable.length}</span>}
              onClick={reanalyze}
              disabled={Boolean(reanalysis)}
            />
          )}
        </div>
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

      <Section title="App">
        <div className="righe-azioni">
          <Riga icona={Share} nome="Condividi l'app" nota="Manda il link di Second Brain" onClick={() => condividiApp(toast)} />
        </div>
        {syncMode && (
          <details className="group border-b border-riga">
            <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 py-2 font-extrabold tracking-[-0.02em] [&::-webkit-details-marker]:hidden">
              <span>Salvataggio rapido da iPhone</span>
              <span aria-hidden="true" className="text-[1.3rem] font-bold leading-none">
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
            </summary>
            <div className="space-y-2.5 pb-5 text-[0.95rem] font-medium leading-snug">
              <QuickShare toast={toast} />
            </div>
          </details>
        )}
      </Section>

      {syncMode ? (
        <Section title="Account">
          <div className="righe-azioni">
            <Riga icona={LogOut} nome="Esci" nota={session?.user?.email || "Dal tuo account"} rosso onClick={signOut} />
          </div>
        </Section>
      ) : (
        <Section title="Dati e account">
          <p className="text-tenue"><strong className="font-extrabold">Modalità locale:</strong> i dati restano solo in questo browser: se cancelli i dati del sito li perdi. Fai il backup spesso.</p>
        </Section>
      )}

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
          <p>
            <strong className="font-extrabold">Versione dell'app.</strong> <span className="num">{__BUILD__}</span>
          </p>
          <p>Per leggere un link, il suo indirizzo viene aperto dal server dell'app (Vercel), che legge solo dati pubblici.</p>
          <p>Per trovare la via di un locale nel box Ristoranti, nome e città del locale vengono inviati a OpenStreetMap (gratuito, senza account), una sola volta per locale. Le copertine dei posti sono tessere della mappa di OpenStreetMap, caricate dal tuo telefono.</p>
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
            {syncMode ? ", oppure usa il salvataggio rapido (in App, qui sopra)." : "; il salvataggio rapido senza aprire l'app richiede la modalità sincronizzata."}
          </p>
        </div>
      </details>
    </Page>
  );
}
