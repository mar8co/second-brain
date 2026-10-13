// Serverless function Vercel: POST /api/extract → server/read.js
// Legge un link; Reel, TikTok, post Facebook e YouTube vengono trascritti e i
// caroselli letti slide per slide. Variabili d'ambiente: SUPABASE_URL,
// SUPABASE_ANON_KEY (facoltative ALLOWED_EMAILS, GEMINI_API_KEY, APIFY_TOKEN).
// waitUntil: per i post social la lettura prosegue dopo la risposta.
import { waitUntil } from "@vercel/functions";
import { handleRead } from "../server/read.js";
import { nodeHandler } from "../server/node-adapter.js";

export default nodeHandler(handleRead, process.env, { waitUntil });
