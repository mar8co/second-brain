// Serverless function Vercel: POST /api/ai → server/ai.js
// Variabili d'ambiente: SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY
// (facoltative: GEMINI_MODEL, ALLOWED_EMAILS). Senza GEMINI_API_KEY risponde
// "ai_disabled" e l'app funziona senza AI.
import { AI_BODY_BYTES, handleAi } from "../server/ai.js";
import { nodeHandler } from "../server/node-adapter.js";

export default nodeHandler(handleAi, process.env, { maxBody: AI_BODY_BYTES });
