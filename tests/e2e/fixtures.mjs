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
  "/trastevere": `<!doctype html><html lang="it"><head><title>Dove mangiare a Trastevere</title>
    <meta property="og:title" content="Dove mangiare a Trastevere">
    <meta property="og:site_name" content="Guida di prova"></head>
    <body><article><h1>Dove mangiare a Trastevere</h1><p>${"Da Enzo al 29 in via dei Vascellari fa la carbonara migliore, poi un caffè al Bar San Calisto. ".repeat(12)}</p></article></body></html>`,
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
  if (prompt.includes("<domanda>") && prompt.includes("Scegli gli elementi")) {
    // Archivio grande: sceglie le schede con le parole della domanda.
    const q = prompt.slice(prompt.lastIndexOf("<domanda>")).toLowerCase();
    return { refs: lastBlock(prompt, "memoria").filter((d) => q.split(/\W+/).some((w) => w.length > 4 && JSON.stringify(d).toLowerCase().includes(w))).map((d) => d.n) };
  }
  if (prompt.includes("<domanda>")) {
    // Contenuto completo di tutto l'archivio (o dei più pertinenti) e schede degli altri.
    const docs = [...lastBlock(prompt, "dettagli"), ...lastBlock(prompt, "memoria")];
    const q = prompt.slice(prompt.lastIndexOf("<domanda>"));
    const recipe = docs.find((d) => /limone/i.test(JSON.stringify(d)));
    if (/limone/i.test(q) && recipe) {
      return {
        answer: `Hai salvato **${recipe.titolo}**: pasta condita con scorza di limone, burro e parmigiano [${recipe.n}].\n- Pronta in 10 minuti [${recipe.n}]`,
        sufficient: true,
        sources: [{ n: recipe.n, quote: "si condisce con scorza di limone, burro e parmigiano" }],
      };
    }
    // Domanda di seguito: capisce dalla conversazione che si parla della pasta al limone.
    if (/quanto ci vuole/i.test(q) && /limone/i.test(lastBlock(prompt, "conversazione").map((t) => t.domanda).join(" ")) && recipe) {
      return { answer: `Ci vogliono 10 minuti [${recipe.n}].`, sufficient: true, sources: [{ n: recipe.n, quote: "frase inventata che non c'è nel testo" }] };
    }
    // Domanda senza parole in comune: la risposta arriva dalle parole chiave della scheda.
    if (/primo piatto/i.test(q)) {
      const hit = docs.find((d) => (d.parole_chiave || []).includes("primo piatto"));
      if (hit) return { answer: `In "${hit.titolo}" c'è un primo piatto veloce [${hit.n}].`, sufficient: true, sources: [{ n: hit.n, quote: "" }] };
    }
    return { answer: "Gli elementi forniti non parlano di questo.", sufficient: false, sources: [] };
  }
  const el = prompt.slice(prompt.lastIndexOf("<elemento>"));
  if (/Trastevere/i.test(el)) {
    return {
      summary: "Due posti dove mangiare a Trastevere.",
      points: ["Da Enzo al 29 fa la carbonara.", "Il Bar San Calisto per il caffè."],
      entities: [{ name: "Da Enzo al 29", kind: "luogo" }],
      keywords: ["ristoranti", "roma", "trastevere"],
      categories: ["Cibo"],
      tags: ["roma"],
      places: [
        { name: "Da Enzo al 29", address: "Via dei Vascellari 29, Roma" },
        { name: "Bar San Calisto", address: "Piazza di San Calisto, Roma" },
        { name: "Posto che non esiste", address: "" },
      ],
    };
  }
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

let geoCalls = 0;

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url.startsWith("/v1beta/models/")) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw);
        if (req.headers["x-goog-api-key"] !== "fake-key") return send(res, 403, "application/json", "{}");
        const prompt = body.contents[0].parts[0].text;
        const out = fakeGemini(prompt);
        // Risposta lenta, per provare che non va persa cambiando schermata.
        const slow = /<domanda>[^<]*palestra/i.test(prompt) ? 1500 : 0;
        setTimeout(() => send(res, 200, "application/json", JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] })), slow);
      });
      return;
    }
    // Finto OpenStreetMap (Nominatim): conta le richieste.
    if (req.url.startsWith("/search?")) {
      geoCalls += 1;
      const q = new URL(req.url, "http://x").searchParams.get("q") || "";
      const hit = /Da Enzo/.test(q) ? { lat: "41.8892", lon: "12.4743", display_name: "Da Enzo al 29, Via dei Vascellari, Roma" } : /San Calisto/.test(q) ? { lat: "41.8888", lon: "12.4697", display_name: "Bar San Calisto, Roma" } : null;
      return send(res, 200, "application/json", JSON.stringify(hit ? [hit] : []));
    }
    if (req.url === "/geo-count") return send(res, 200, "application/json", JSON.stringify({ calls: geoCalls }));
    if (req.url === "/reel-privato") return send(res, 302, "text/html", "", { location: "/accounts/login" });
    if (pages[req.url]) return send(res, 200, "text/html; charset=utf-8", pages[req.url]);
    send(res, 404, "text/html", "<title>404</title>");
  })
  .listen(PORT, "127.0.0.1", () => console.log(`fixtures su ${PORT}`));
