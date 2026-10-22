// Serverless function Vercel: notifiche push per i promemoria degli eventi.
//   POST {action:"key"}  → chiave pubblica per iscriversi (richiede la sessione)
//   POST {action:"test"} → notifica di prova ai dispositivi dell'utente
//   GET (Vercel Cron)    → invio giornaliero (Authorization: Bearer CRON_SECRET)
// Variabili d'ambiente: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
import { handlePushCron, handlePushKey, handlePushTest } from "../server/push.js";
import { readJsonBody } from "../server/node-adapter.js";

export default async function handler(req, res) {
  let out;
  try {
    if (req.method === "GET") out = await handlePushCron({ authHeader: req.headers.authorization, env: process.env });
    else if (req.method === "POST") {
      const body = await readJsonBody(req);
      const args = { authHeader: req.headers.authorization, env: process.env };
      out = body?.action === "key" ? await handlePushKey(args) : body?.action === "test" ? await handlePushTest(args) : { status: 400, json: { error: "Azione non valida." } };
    } else out = { status: 405, json: { error: "Metodo non consentito." } };
  } catch {
    out = { status: 500, json: { error: "Errore interno." } };
  }
  res.statusCode = out.status;
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(out.json));
}
