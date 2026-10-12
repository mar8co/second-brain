// Adattatore tra (req, res) di Node/Vercel e i core framework-agnostic in
// server/*. Usato dalle function in api/ e dal middleware di sviluppo di Vite.

const MAX_BODY = 256 * 1024;

export function readJsonBody(req) {
  // Vercel ha già fatto il parse del JSON.
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > MAX_BODY) {
        reject(Object.assign(new Error("too_large"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error("bad_json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

export function nodeHandler(core, env = process.env, extra = {}) {
  return async (req, res) => {
    let out;
    if (req.method !== "POST") {
      out = { status: 405, json: { error: "Metodo non consentito." } };
    } else {
      try {
        const body = await readJsonBody(req);
        out = await core({ authHeader: req.headers.authorization, body, env, ...extra });
      } catch (e) {
        out = { status: e.status || 500, json: { error: e.status === 413 ? "Richiesta troppo grande." : "Richiesta non valida." } };
      }
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
