// Adattatore tra (req, res) di Node/Vercel e i core framework-agnostic in
// server/*. Usato dalle function in api/ e dal middleware di sviluppo di Vite.

import { MAX_UPLOAD_BYTES, parseMultipart } from "./media.js";

const MAX_BODY = 256 * 1024;

// `limit`: le domande (/api/ai) portano con sé le schede di tutto l'archivio.
export function readJsonBody(req, limit = MAX_BODY) {
  // Vercel ha già fatto il parse del JSON.
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on("data", (c) => {
      if (over) return; // si legge il resto senza tenerlo: la risposta 413 deve arrivare
      size += c.length;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (over) return reject(Object.assign(new Error("too_large"), { status: 413 }));
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error("bad_json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

// Corpo "Modulo" con file (Comandi Rapidi): letto grezzo, poi diviso nei campi.
function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("too_large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readBody(req, allowFiles, maxBody) {
  const ct = String(req.headers["content-type"] || "");
  if (/^multipart\/form-data/i.test(ct)) {
    if (!allowFiles) throw Object.assign(new Error("bad_body"), { status: 400 });
    return parseMultipart(await readRawBody(req, MAX_UPLOAD_BYTES), ct);
  }
  return readJsonBody(req, maxBody);
}

// extra.maxBody: limite del corpo JSON per questo endpoint (predefinito 256 KB).
export function nodeHandler(core, env = process.env, { maxBody, ...extra } = {}) {
  return async (req, res) => {
    let out;
    if (req.method !== "POST") {
      out = { status: 405, json: { error: "Metodo non consentito." } };
    } else {
      try {
        const body = await readBody(req, Boolean(extra.allowFiles), maxBody);
        out = await core({ authHeader: req.headers.authorization, body, env, ...extra });
      } catch (e) {
        const tooLarge = extra.allowFiles ? "File troppo grande (massimo 4 MB): per i video invia solo l'audio, per le slide riduci le immagini." : "Richiesta troppo grande.";
        const error = e.status === 413 ? tooLarge : "Richiesta non valida.";
        out = extra.allowFiles ? { status: e.status || 500, text: error } : { status: e.status || 500, json: { error } };
      }
    }
    // Risposta in streaming (eventi SSE): ogni evento parte appena è pronto.
    if (typeof out.stream === "function") {
      res.statusCode = out.status;
      res.setHeader("cache-control", "no-store, no-transform");
      res.setHeader("content-type", "text/event-stream; charset=utf-8");
      res.setHeader("x-accel-buffering", "no");
      res.flushHeaders?.();
      const send = (ev) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`);
      };
      try {
        await out.stream(send);
      } catch {
        send({ type: "error", status: 500, error: "Errore interno." });
      }
      res.end();
      return;
    }
    res.statusCode = out.status;
    res.setHeader("cache-control", "no-store");
    // Risposta in testo semplice per chi la mostra così com'è (Comandi Rapidi).
    if (typeof out.text === "string") {
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(out.text);
      return;
    }
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(out.json));
  };
}
