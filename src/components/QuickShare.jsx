// Impostazioni → "Salvataggio rapido da iPhone": crea il codice personale che
// il Comando Rapido invia a /api/share per salvare senza aprire l'app.
// Il codice si vede una sola volta: nel database resta solo il suo hash.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { ErrorBox } from "./ui.jsx";
import { Domanda } from "./Foglio.jsx";

export default function QuickShare({ toast }) {
  const [info, setInfo] = useState({ loading: true, createdAt: null });
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ask, setAsk] = useState(null);
  const endpoint = `${window.location.origin}/api/share`;

  useEffect(() => {
    let alive = true;
    supabase
      .from("share_tokens")
      .select("created_at")
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (!alive) return;
        setInfo({ loading: false, createdAt: data?.created_at || null });
        if (e) setError("Funzione non ancora attiva sul database (manca l'aggiornamento di supabase/schema.sql).");
      });
    return () => {
      alive = false;
    };
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("create_share_token");
    setBusy(false);
    if (e) return setError(`Impossibile creare il codice: ${e.message}`);
    setToken(data);
    setInfo({ loading: false, createdAt: new Date().toISOString() });
  };

  const revoke = async () => {
    setBusy(true);
    const { error: e } = await supabase.rpc("revoke_share_token");
    setBusy(false);
    if (e) return setError(`Impossibile disattivare: ${e.message}`);
    setToken(null);
    setInfo({ loading: false, createdAt: null });
  };

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copiato`);
    } catch {
      toast("Copia non riuscita: seleziona il testo a mano");
    }
  };

  return (
    <div className="space-y-2.5">
      <p>
        Salva un link <strong className="font-extrabold">senza aprire l'app</strong>: serve un codice personale e un Comando Rapido. Il server legge il link (Reel, TikTok, video e
        caroselli pubblici) e l'AI assegna categorie e tag in background.{" "}
        <strong className="font-extrabold">Foto, video e file non si salvano da qui</strong> (il Comando invia solo il nome): usa il tondo + nella Chat.
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {token ? (
        <div className="riquadro">
          <p className="micro font-semibold">Il tuo codice (si vede solo ora, trattalo come una password)</p>
          <p className="mt-1 select-all break-all text-[0.95rem] font-bold">{token}</p>
          <button type="button" className="link" onClick={() => copy(token, "Codice")}>
            Copia codice
          </button>
        </div>
      ) : info.loading ? (
        <p className="text-tenue">Verifico…</p>
      ) : info.createdAt ? (
        <p className="text-tenue">Codice attivo, creato il {new Date(info.createdAt).toLocaleDateString("it-IT")}. Per vederlo di nuovo devi crearne uno nuovo.</p>
      ) : null}
      <div className="bottoni !mt-1">
        <button
          type="button"
          className="bottone"
          onClick={() =>
            info.createdAt
              ? setAsk({ titolo: "Creare un nuovo codice?", testo: "Il codice attuale smetterà di funzionare: dovrai aggiornare il Comando Rapido.", si: "Crea", onSi: create })
              : create()
          }
          disabled={busy || info.loading}
        >
          {busy ? "Un momento…" : info.createdAt ? "Crea un nuovo codice" : "Crea codice"}
        </button>
        {info.createdAt && (
          <button
            type="button"
            className="bottone chiaro"
            onClick={() => setAsk({ titolo: "Disattivare il salvataggio rapido?", testo: "Il Comando Rapido smetterà di funzionare finché non crei un nuovo codice.", si: "Disattiva", rosso: true, onSi: revoke })}
            disabled={busy}
          >
            Disattiva
          </button>
        )}
        <a className="bottone chiaro" href="https://www.icloud.com/shortcuts/a1375a33253b4547a66a52a0a33ad13e" target="_blank" rel="noreferrer">
          Installa il comando
        </a>
      </div>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li><strong>Installa il comando</strong>: tocca il pulsante, poi <strong>Aggiungi comando</strong> nell'app Comandi.</li>
        <li><strong>Crea il codice</strong> qui sopra e tocca <strong>Copia codice</strong>.</li>
        <li>In Comandi apri il comando, nell'azione <strong>Ottieni contenuti di URL</strong> incolla il codice nel campo <code>token</code>.</li>
        <li>Per salvare: da un link tocca Condividi → <strong>Comandi</strong> → il tuo comando.</li>
      </ol>
      {ask && <Domanda {...ask} color="#ffffff" onClose={() => setAsk(null)} />}
      <details className="group border-t border-riga pb-1">
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 font-extrabold tracking-[-0.02em] [&::-webkit-details-marker]:hidden"><span>Oppure crea il Comando a mano</span><Segno /></summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>App Comandi → <strong>+</strong> → tocca ⓘ e attiva <strong>Mostra nel foglio di condivisione</strong> (tipi: URL e Testo).</li>
          <li>
            Aggiungi <strong>Ottieni contenuti di URL</strong>. URL:{" "}
            <button type="button" className="break-all text-[0.85rem] font-bold underline" onClick={() => copy(endpoint, "Indirizzo")}>{endpoint}</button>
          </li>
          <li>Nella stessa azione tocca <strong>Mostra di più</strong>: Metodo <strong>POST</strong>, Corpo richiesta <strong>JSON</strong>.</li>
          <li>Aggiungi due campi di tipo Testo: <code>token</code> = il tuo codice; <code>text</code> = la variabile <strong>Input comando rapido</strong>.</li>
          <li>Aggiungi <strong>Mostra notifica</strong> con la variabile <strong>Contenuti dell'URL</strong>: ti dirà se il salvataggio è riuscito.</li>
        </ol>
      </details>
      <details className="group border-t border-riga pb-1">
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 font-extrabold tracking-[-0.02em] [&::-webkit-details-marker]:hidden"><span>Facoltativo: inviare il file di un video</span><Segno /></summary>
        <p className="mt-2">
          Serve solo se un video non si riesce a leggere dal link (per esempio perché è privato). Scaricalo quando c'è l'opzione "Scarica",
          oppure fai una registrazione schermo, poi da Foto → Condividi → questo comando. Si invia solo l'audio, che l'AI trascrive in
          background; il file non viene conservato.
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Nuovo comando → ⓘ → <strong>Mostra nel foglio di condivisione</strong>, tipi: <strong>Contenuti multimediali</strong>.</li>
          <li>Aggiungi <strong>Codifica contenuti multimediali</strong> con l'Input comando rapido e attiva <strong>Solo audio</strong>.</li>
          <li>
            Aggiungi <strong>Ottieni contenuti di URL</strong> con lo stesso indirizzo, Metodo <strong>POST</strong>, Corpo richiesta{" "}
            <strong>Modulo</strong>: campo <code>token</code> (Testo) = il tuo codice; campo <code>file</code> (File) = <strong>Contenuti multimediali codificati</strong>.
          </li>
          <li>Aggiungi <strong>Mostra notifica</strong> con <strong>Contenuti dell'URL</strong>.</li>
        </ol>
      </details>
      <details className="group border-t border-riga pb-1">
        <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 font-extrabold tracking-[-0.02em] [&::-webkit-details-marker]:hidden"><span>Facoltativo: inviare gli screenshot di un carosello</span><Segno /></summary>
        <p className="mt-2">
          Serve solo se un carosello non si riesce a leggere dal link. Fai uno screenshot di ogni slide, selezionali in Foto nell'ordine e
          condividili con questo comando: l'AI legge il testo di ogni slide.
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>Nuovo comando → ⓘ → <strong>Mostra nel foglio di condivisione</strong>, tipi: <strong>Immagini</strong>.</li>
          <li>Aggiungi <strong>Ridimensiona immagine</strong> (Input comando rapido) a larghezza <strong>1080</strong>.</li>
          <li>Aggiungi <strong>Converti immagine</strong> in <strong>JPEG</strong>, poi <strong>Crea PDF</strong> con le immagini convertite.</li>
          <li>
            Aggiungi <strong>Ottieni contenuti di URL</strong> come sopra (POST, Modulo): <code>token</code> = il tuo codice; <code>file</code> (File) = il <strong>PDF</strong>.
          </li>
          <li>Aggiungi <strong>Mostra notifica</strong> con <strong>Contenuti dell'URL</strong>.</li>
        </ol>
        <p className="mt-2 text-tenue">Limite: 4 MB per invio. Se il video è lungo, dividilo in due parti.</p>
      </details>
    </div>
  );
}

// "+" quando è chiuso, "−" quando è aperto.
function Segno() {
  return (
    <span aria-hidden="true" className="text-[1.3rem] font-bold leading-none">
      <span className="group-open:hidden">+</span>
      <span className="hidden group-open:inline">−</span>
    </span>
  );
}
