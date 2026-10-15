// Scelta della nuova password, dopo il link ricevuto per email (modalità sincronizzata).
import { useState } from "react";
import { ErrorBox } from "../components/ui.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { PAGE } from "../lib/colors.js";

export default function NuovaPassword({ setNewPassword }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  usePageColor(PAGE.chat);

  return (
    <main className="pagina flex min-h-[100dvh] flex-col justify-center !pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(24px+env(safe-area-inset-top))]">
      <h1 className="gigante">
        Nuova
        <br />
        password
      </h1>
      <p className="-mt-2 font-semibold text-tenue">Scegli la password con cui accedere da ora.</p>
      <form
        className="mt-6 space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (password.length < 8) return setError("Usa almeno 8 caratteri.");
          if (password !== again) return setError("Le due password non coincidono.");
          setBusy(true);
          try {
            await setNewPassword(password);
          } catch (err) {
            setError(err.message);
            setBusy(false);
          }
        }}
      >
        <div>
          <label htmlFor="np-pw" className="etichetta">Nuova password</label>
          <input id="np-pw" type="password" autoComplete="new-password" className="campo" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="np-pw2" className="etichetta">Ripeti la password</label>
          <input id="np-pw2" type="password" autoComplete="new-password" className="campo" value={again} onChange={(e) => setAgain(e.target.value)} required />
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button type="submit" className="bottone grande-azione" disabled={busy}>
          {busy ? "Salvo…" : "Salva password"}
        </button>
      </form>
    </main>
  );
}
