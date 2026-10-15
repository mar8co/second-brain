// Sessione Supabase (solo in modalità sincronizzata).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  // Dopo il link "password dimenticata" Supabase apre l'app con una sessione di recupero.
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(/invalid/i.test(error.message) ? "Email o password non corretti." : `Accesso non riuscito: ${error.message}`);
    }
  }, []);

  // Manda l'email con il link per scegliere una nuova password.
  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw new Error(/rate|seconds|too many/i.test(error.message) ? "Troppe richieste: riprova fra qualche minuto." : `Non sono riuscito a inviare l'email: ${error.message}`);
  }, []);

  const setNewPassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(`Password non cambiata: ${error.message}`);
    setRecovery(false);
  }, []);

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  return { session, loading, recovery, signIn, resetPassword, setNewPassword, signOut };
}
