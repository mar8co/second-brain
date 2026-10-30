// Serverless function Vercel: POST /api/lavori → server/lavori.js
// Chiamata dalla sveglia di Supabase (pg_cron + pg_net) ogni pochi minuti,
// con Authorization: Bearer <token> (nel database c'è solo il suo hash).
// Variabili d'ambiente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
// (facoltativa APIFY_TOKEN per rileggere i post social).
import { waitUntil } from "@vercel/functions";
import { handleLavori } from "../server/lavori.js";

export default async function handler(req, res) {
  let out;
  try {
    out = req.method === "POST" ? await handleLavori({ authHeader: req.headers.authorization, env: process.env, waitUntil }) : { status: 405, json: { error: "Metodo non consentito." } };
  } catch (e) {
    console.warn("lavori: giro non riuscito", e?.message);
    out = { status: 500, json: { error: "Errore interno." } };
  }
  res.statusCode = out.status;
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(out.json));
}
