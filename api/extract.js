// Serverless function Vercel: POST /api/extract → server/extract.js
// Variabili d'ambiente: SUPABASE_URL, SUPABASE_ANON_KEY (facoltativa ALLOWED_EMAILS).
import { handleExtract } from "../server/extract.js";
import { nodeHandler } from "../server/node-adapter.js";

export default nodeHandler(handleExtract);
