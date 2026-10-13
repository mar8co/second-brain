// Serverless function Vercel: POST /api/share → server/share.js
// Salvataggio da Comandi Rapidi senza aprire l'app. Variabili d'ambiente:
// SUPABASE_URL, SUPABASE_ANON_KEY (facoltative GEMINI_API_KEY per l'AI e
// APIFY_TOKEN per trascrivere i video social e leggere i caroselli dal link).
// waitUntil: la lettura del link e l'AI proseguono dopo la risposta.
// allowFiles: accetta anche l'audio di un video o le slide di un carosello.
import { waitUntil } from "@vercel/functions";
import { handleShare } from "../server/share.js";
import { nodeHandler } from "../server/node-adapter.js";

export default nodeHandler(handleShare, process.env, { waitUntil, allowFiles: true });
