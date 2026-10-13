// Impostazioni → "Salvataggio rapido da iPhone": crea il codice personale che
// il Comando Rapido invia a /api/share per salvare senza aprire l'app.
// Il codice si vede una sola volta: nel database resta solo il suo hash.
import { useEffect, useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { ErrorBox } from "./ui.jsx";

export default function QuickShare({ toast }) {
  const [info, setInfo] = useState({ loading: true, createdAt: null });
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
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
    if (info.createdAt && !window.confirm("Il codice attuale smetterà di funzionare: dovrai aggiornare il Comando Rapido. Continuare?")) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("create_share_token");
    setBusy(false);
    if (e) return setError(`Impossibile creare il codice: ${e.message}`);
    setToken(data);
    setInfo({ loading: false, createdAt: new Date().toISOString() });
  };

  const revoke = async () => {
    if (!window.confirm("Disattivare il salvataggio rapido? Il Comando smetterà di funzionare.")) return;
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
    <div className="space-y-2">
      <p>
        Con un Comando Rapido il link viene salvato <strong>senza aprire l'app</strong>: il server lo legge e l'AI assegna categorie e tag
        in background. Ti serve un codice personale.
      </p>
      <p>
        Reel, TikTok, video di Facebook, YouTube e Shorts vengono <strong>trascritti</strong> e i caroselli <strong>letti slide per
        slide</strong> a partire dal solo link (post pubblici). Può servire qualche minuto.
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {token ? (
        <div className="rounded-xl border border-line bg-sunken p-3">
          <p className="text-xs font-medium text-muted">Il tuo codice (si vede solo ora, trattalo come una password):</p>
          <p className="mt-1 break-all font-mono text-xs">{token}</p>
          <button type="button" className="btn-ghost mt-2" onClick={() => copy(token, "Codice")}>
            <Copy className="h-4 w-4" aria-hidden="true" /> Copia codice
          </button>
        </div>
      ) : info.loading ? (
        <p className="text-muted">Verifico…</p>
      ) : info.createdAt ? (
        <p className="text-muted">Codice attivo, creato il {new Date(info.createdAt).toLocaleDateString("it-IT")}. Per vederlo di nuovo devi crearne uno nuovo.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={create} disabled={busy || info.loading}>
          <KeyRound className="h-4 w-4" aria-hidden="true" /> {info.createdAt ? "Crea un nuovo codice" : "Crea codice"}
        </button>
        {info.createdAt && (
          <button type="button" className="btn-ghost text-bad" onClick={revoke} disabled={busy}>
            Disattiva
          </button>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Come creare il Comando Rapido</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>App Comandi → <strong>+</strong> → tocca ⓘ e attiva <strong>Mostra nel foglio di condivisione</strong> (tipi: URL e Testo).</li>
          <li>
            Aggiungi <strong>Ottieni contenuti di URL</strong>. URL:{" "}
            <button type="button" className="break-all font-mono text-xs underline" onClick={() => copy(endpoint, "Indirizzo")}>{endpoint}</button>
          </li>
          <li>Nella stessa azione tocca <strong>Mostra di più</strong>: Metodo <strong>POST</strong>, Corpo richiesta <strong>JSON</strong>.</li>
          <li>Aggiungi due campi di tipo Testo: <code>token</code> = il tuo codice; <code>text</code> = la variabile <strong>Input comando rapido</strong>.</li>
          <li>Aggiungi <strong>Mostra notifica</strong> con la variabile <strong>Contenuti dell'URL</strong>: ti dirà se il salvataggio è riuscito.</li>
        </ol>
      </details>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Facoltativo: inviare il file di un video</summary>
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
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Facoltativo: inviare gli screenshot di un carosello</summary>
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
        <p className="mt-2 text-muted">Limite: 4 MB per invio. Se il video è lungo, dividilo in due parti.</p>
      </details>
    </div>
  );
}
