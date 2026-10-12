// Client Supabase, creato solo se le variabili pubbliche sono configurate.
// Senza, l'app gira in "modalità locale" (IndexedDB nel browser).
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anon ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
export const isSyncMode = Boolean(supabase);
