// Autorizzazione degli endpoint /api/*.
//
// In produzione ogni richiesta deve portare il token di sessione Supabase
// dell'utente (Authorization: Bearer <access_token>): senza, 401. Così né la
// lettura dei link né la quota Gemini sono usabili da estranei.
//
// Solo in sviluppo locale senza Supabase (modalità locale) il middleware di
// Vite imposta ALLOW_NO_AUTH=1: gli endpoint rispondono solo su localhost.

import { createClient } from "@supabase/supabase-js";

export async function verifyRequest({ authHeader, env }) {
  const url = env.SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    if (env.ALLOW_NO_AUTH === "1") return { ok: true, userId: "local" };
    return { ok: false, status: 503, error: "Server non configurato: mancano SUPABASE_URL e SUPABASE_ANON_KEY." };
  }
  const token = String(authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, error: "Non autenticato." };
  try {
    const supabase = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return { ok: false, status: 401, error: "Sessione non valida o scaduta." };
    // Facoltativo: elenco di email ammesse (difesa in più oltre alle
    // registrazioni disattivate su Supabase).
    const allowed = String(env.ALLOWED_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length && !allowed.includes(String(data.user.email || "").toLowerCase())) {
      return { ok: false, status: 403, error: "Account non autorizzato." };
    }
    return { ok: true, userId: data.user.id };
  } catch {
    return { ok: false, status: 502, error: "Impossibile verificare la sessione." };
  }
}
