// Accesso (solo modalità sincronizzata). Nessuna registrazione dall'app:
// l'account si crea dalla dashboard Supabase (vedi README).
import { useState } from "react";
import { ErrorBox } from "../components/ui.jsx";

export default function Login({ signIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-6 pt-safe">
      <img src="/favicon.svg" alt="" className="mb-5 h-14 w-14" />
      <h1 className="font-serif text-3xl font-semibold">Second Brain</h1>
      <p className="mt-1 text-muted">Accedi al tuo archivio.</p>
      <form
        className="mt-6 space-y-4"
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
          <label htmlFor="li-email" className="label">Email</label>
          <input id="li-email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="li-pw" className="label">Password</label>
          <input id="li-pw" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        <button type="submit" className="btn-primary w-full min-h-[50px]" disabled={busy}>
          {busy ? "Accesso…" : "Accedi"}
        </button>
      </form>
    </main>
  );
}
