// Serverless function Vercel: POST /api/share → server/share.js
// Salvataggio da Comandi Rapidi senza aprire l'app. Variabili d'ambiente:
// SUPABASE_URL, SUPABASE_ANON_KEY (facoltativa GEMINI_API_KEY per l'AI).
// waitUntil: la lettura del link e l'AI proseguono dopo la risposta.
import { waitUntil } from "@vercel/functions";
import { handleShare } from "../server/share.js";
import { nodeHandler } from "../server/node-adapter.js";

export default nodeHandler(handleShare, process.env, { waitUntil });
