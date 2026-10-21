// Serverless function Vercel: POST /api/thumb → server/thumb.js
// Copia la miniatura di un link nell'archivio dell'utente. Variabili d'ambiente:
// SUPABASE_URL, SUPABASE_ANON_KEY (facoltativa ALLOWED_EMAILS).
import { handleThumb } from "../server/thumb.js";
import { nodeHandler } from "../server/node-adapter.js";

export default nodeHandler(handleThumb, process.env);
