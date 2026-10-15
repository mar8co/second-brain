// Accesso (solo modalità sincronizzata). Nessuna registrazione dall'app:
// l'account si crea dalla dashboard Supabase (vedi README).
import { useState } from "react";
import { ErrorBox } from "../components/ui.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { PAGE } from "../lib/colors.js";

export default function Login({ signIn, resetPassword }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  usePageColor(PAGE.chat);

  return (
    <main className="pagina flex min-h-[100dvh] flex-col justify-center !pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(24px+env(safe-area-inset-top))]">
      <img src="/favicon.svg" alt="" className="mb-6 h-16 w-16 rounded-[14px]" />
      <h1 className="gigante">
        Second
        <br />
        Brain
      </h1>
      <p className="-mt-2 font-semibold text-tenue">Accedi al tuo archivio.</p>
      <form
        className="mt-6 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await signIn(email.trim(), password);
          } catch (err) {
            setError(err.message);
            setBusy(false);
          }
        }}
      >
        <div>
          <label htmlFor="li-email" className="etichetta">Email</label>
          <input id="li-email" type="email" autoComplete="username" className="campo" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="li-pw" className="etichetta">Password</label>
          <input id="li-pw" type="password" autoComplete="current-password" className="campo" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button
          type="button"
          className="link text-[0.95rem]"
          disabled={busy}
          onClick={async () => {
            setError(null);
            setInfo(null);
            if (!email.trim()) return setError("Scrivi la tua email qui sopra, poi tocca di nuovo “Hai dimenticato la password?”.");
            setBusy(true);
            try {
              await resetPassword(email.trim());
              setInfo("Se l'email è registrata, ti ho mandato un link per scegliere una nuova password. Controlla anche lo spam.");
            } catch (err) {
              setError(err.message);
            }
            setBusy(false);
          }}
        >
          Hai dimenticato la password?
        </button>
        {error && <ErrorBox>{error}</ErrorBox>}
        {info && <p role="status" className="font-semibold">{info}</p>}
        <button type="submit" className="bottone grande-azione" disabled={busy}>
          {busy ? "Attendi…" : "Accedi"}
        </button>
      </form>
    </main>
  );
}
