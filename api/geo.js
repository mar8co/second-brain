// Serverless function Vercel: POST /api/geo → server/geo.js
// Trova le coordinate di un posto dal nome con OpenStreetMap (Nominatim),
// senza chiave. Variabili d'ambiente: SUPABASE_URL, SUPABASE_ANON_KEY
// (facoltativa ALLOWED_EMAILS).
import { handleGeo } from "../server/geo.js";
import { nodeHandler } from "../server/node-adapter.js";

export default nodeHandler(handleGeo, process.env);
