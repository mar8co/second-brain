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

// Ultimo blocco <tag>…</tag> del prompt (il primo può essere citato nelle istruzioni).
function lastBlock(prompt, tag) {
  const start = prompt.lastIndexOf(`<${tag}>`);
  if (start < 0) return [];
  return JSON.parse(prompt.slice(start + tag.length + 2, prompt.lastIndexOf(`</${tag}>`)));
}

function fakeGemini(prompt) {
  if (prompt.includes("<domanda>")) {
    // Contenuto completo dei più pertinenti e schede di tutto l'archivio.
    const docs = [...lastBlock(prompt, "dettagli"), ...lastBlock(prompt, "memoria")];
    const q = prompt.slice(prompt.lastIndexOf("<domanda>"));
    if (/limone/i.test(q)) {
      const hit = docs.find((d) => /limone/i.test(JSON.stringify(d)));
      if (hit) return { answer: `Hai salvato "${hit.titolo}": pasta condita con scorza di limone, burro e parmigiano.`, sufficient: true, sources: [hit.id] };
    }
    // Domanda senza parole in comune: la risposta arriva dalle schede (parole chiave).
    if (/primo piatto/i.test(q)) {
      const hit = docs.find((d) => (d.parole_chiave || []).includes("primo piatto"));
      if (hit) return { answer: `Nella scheda "${hit.titolo}" c'è un primo piatto veloce.`, sufficient: true, sources: [hit.id] };
    }
    return { answer: "Gli elementi forniti non parlano di questo.", sufficient: false, sources: [] };
  }
  const el = prompt.slice(prompt.lastIndexOf("<elemento>"));
  if (/limone/i.test(el)) {
    return {
      summary: "Ricetta veloce di pasta al limone.",
      points: ["La pasta al limone si condisce con scorza di limone, burro e parmigiano."],
      entities: [{ name: "Parmigiano", kind: "prodotto" }],
      keywords: ["ricetta", "primo piatto", "pasta"],
      categories: ["Ricette"],
      tags: ["pasta", "limone"],
    };
  }
  return { summary: "", points: [], entities: [], keywords: [], categories: [], tags: [] };
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
