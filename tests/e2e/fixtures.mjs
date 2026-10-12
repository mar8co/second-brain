// Server di prova per i test end-to-end: pagine web finte e un finto Gemini.
// Nessuna chiamata a servizi reali.
import http from "node:http";

const PORT = Number(process.env.FIXTURE_PORT || 4599);
const LONG = "Si cuoce la pasta e si condisce con scorza di limone, burro e parmigiano. ".repeat(15);

const pages = {
  "/ricetta": `<!doctype html><html lang="it"><head><title>Pasta al limone</title>
    <meta property="og:title" content="Pasta al limone in 10 minuti">
    <meta property="og:description" content="Una ricetta estiva veloce.">
    <meta property="og:site_name" content="Cucina di prova"></head>
    <body><article><h1>Pasta al limone</h1><p>${LONG}</p><p>${LONG}</p></article></body></html>`,
  "/accounts/login": `<html><head><title>Accedi</title></head><body>Accedi per vedere</body></html>`,
};

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, { "content-type": type, ...headers });
  res.end(body);
}

function fakeGemini(prompt) {
  if (prompt.includes("<domanda>")) {
    // L'ultimo blocco <archivio>…</archivio> (il primo è citato nelle istruzioni).
    const start = prompt.lastIndexOf("<archivio>") + "<archivio>".length;
    const docs = JSON.parse(prompt.slice(start, prompt.lastIndexOf("</archivio>")));
    const hit = docs.find((d) => /limone/i.test(JSON.stringify(d)));
    return hit
      ? { answer: `Hai salvato "${hit.titolo}": pasta condita con scorza di limone, burro e parmigiano.`, sufficient: true, sources: [hit.id] }
      : { answer: "Gli elementi forniti non parlano di questo.", sufficient: false, sources: [] };
  }
  const el = prompt.slice(prompt.lastIndexOf("<elemento>"));
  if (/limone/i.test(el)) return { summary: "Ricetta veloce di pasta al limone.", categories: ["Ricette"], tags: ["pasta", "limone"] };
  return { summary: "", categories: [], tags: [] };
}

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url.startsWith("/v1beta/models/")) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw);
        if (req.headers["x-goog-api-key"] !== "fake-key") return send(res, 403, "application/json", "{}");
        const out = fakeGemini(body.contents[0].parts[0].text);
        send(res, 200, "application/json", JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }));
      });
      return;
    }
    if (req.url === "/reel-privato") return send(res, 302, "text/html", "", { location: "/accounts/login" });
    if (pages[req.url]) return send(res, 200, "text/html; charset=utf-8", pages[req.url]);
    send(res, 404, "text/html", "<title>404</title>");
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fixtures su ${PORT}`));
