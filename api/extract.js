// Serverless function Vercel: POST /api/extract → server/social.js
// Legge un link; Reel, TikTok, post Facebook e YouTube vengono trascritti e i
// caroselli letti slide per slide. Variabili d'ambiente: SUPABASE_URL,
// SUPABASE_ANON_KEY (facoltative ALLOWED_EMAILS, GEMINI_API_KEY, APIFY_TOKEN).
import { handleRead } from "../server/social.js";
import { nodeHandler } from "../server/node-adapter.js";

export default nodeHandler(handleRead);
