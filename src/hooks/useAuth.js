// Sessione Supabase (solo in modalità sincronizzata).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(/invalid/i.test(error.message) ? "Email o password non corretti." : `Accesso non riuscito: ${error.message}`);
    }
  }, []);

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  return { session, loading, signIn, signOut };
}
