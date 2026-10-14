/* global window */
import { expect, test } from "@playwright/test";

const FIX = "http://127.0.0.1:4599";

// Ogni test parte da un archivio locale vuoto (IndexedDB nuovo per contesto).
// L'Archivio parte a box; gli altri test lo vogliono in lista (solo il test
// "a box" parte dalla vista di partenza).
test.beforeEach(async ({ page }, info) => {
  if (info.title.includes("a box")) return;
  await page.addInitScript(() => window.localStorage.setItem("sb-vista", "lista"));
});

async function addLink(page, url, note) {
  await page.goto("/aggiungi");
  await page.getByLabel("Link", { exact: true }).fill(url);
  if (note) await page.getByLabel("Nota (facoltativa)").fill(note);
  await page.getByRole("button", { name: "Salva", exact: true }).click();
}

test("chat vuota; second-brain in alto; barra con solo Chat e Archivio; Rianalizza e Aggiungi in Impostazioni; Filtri solo icona sotto la ricerca", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "second-brain" })).toBeVisible();
  await expect(page.getByText("Chiedimi qualsiasi cosa")).toBeVisible();
  await expect(page.getByText("Modalità locale")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navigazione principale" });
  await expect(nav.getByRole("link")).toHaveText(["Chat", "Archivio"]);
  await page.getByRole("button", { name: "Impostazioni" }).click();
  await expect(page).toHaveURL(/\/impostazioni$/);
  // Rianalizza e Aggiungi stanno in cima alle Impostazioni.
  const rian = await page.getByRole("button", { name: /^Rianalizza/ }).boundingBox();
  const agg = await page.getByRole("button", { name: "Aggiungi", exact: true }).boundingBox();
  const titolo = await page.getByRole("heading", { name: "Impostazioni" }).boundingBox();
  expect(rian.x).toBeLessThan(agg.x);
  expect(rian.y).toBeLessThan(titolo.y + 300);
  // In Archivio non ci sono più; Filtri è una sola icona (senza la parola) sotto la ricerca.
  await page.goto("/archivio");
  await expect(page.getByRole("button", { name: /^Rianalizza/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Aggiungi", exact: true })).toHaveCount(0);
  const campo = await page.getByLabel("Cerca nell'archivio").boundingBox();
  const filtri = page.getByRole("button", { name: /^Filtri/ });
  const fb = await filtri.boundingBox();
  expect(fb.y).toBeGreaterThan(campo.y + campo.height - 1);
  expect((await filtri.innerText()).trim()).toBe("");
  await expect(page.getByText("Filtri", { exact: true })).toHaveCount(0);
  // Aggiungi dalle Impostazioni.
  await page.goto("/impostazioni");
  await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
  await expect(page).toHaveURL(/\/aggiungi$/);
});

test("link incollato nella chat: salvato nell'archivio, la chat resta per le domande", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Chiedi alla tua memoria").fill(`${FIX}/ricetta`);
  await page.getByRole("button", { name: "Invia" }).click();
  await expect(page.getByText(/Salvato nell'archivio/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Pasta al limone in 10 minuti/ })).toHaveCount(0);
  // Navigazione dentro l'app (non un ricaricamento): la lettura in corso continua.
  const nav = page.getByRole("navigation", { name: "Navigazione principale" });
  await nav.getByRole("link", { name: "Archivio" }).click();
  await expect(page.getByText("Pasta al limone in 10 minuti")).toBeVisible();
  // Domande suggerite per cominciare, dalle categorie.
  await nav.getByRole("link", { name: "Chat" }).click();
  await expect(page.getByRole("button", { name: "Cosa ho salvato su ricette?" })).toBeVisible();
});

test("campo della chat: cresce con il testo; mentre si scrive la barra Chat / Archivio sparisce", async ({ page }) => {
  await page.goto("/");
  const box = page.getByLabel("Chiedi alla tua memoria");
  const nav = page.getByRole("navigation", { name: "Navigazione principale" });
  const h1 = (await box.boundingBox()).height;
  await box.click();
  await expect(nav).toBeHidden();
  await box.fill("Una domanda molto lunga sulla mia memoria che continua e continua ".repeat(4));
  await expect.poll(async () => (await box.boundingBox()).height).toBeGreaterThan(h1 * 2);
  // Testo lunghissimo: il campo si ferma a circa 6 righe e scorre.
  await box.fill("parola ".repeat(300));
  expect((await box.boundingBox()).height).toBeLessThanOrEqual(161);
  await box.fill("");
  await expect.poll(async () => (await box.boundingBox()).height).toBe(h1);
  await box.blur();
  await expect(nav).toBeVisible();
});

test("campo della chat sempre sopra la tastiera, anche scorrendo (iPhone)", async ({ page }) => {
  // Finta tastiera: la parte visibile della pagina è alta 400 px e scorsa di 120.
  await page.addInitScript(() => {
    const vv = new EventTarget();
    Object.assign(vv, { height: window.innerHeight, offsetTop: 0, width: window.innerWidth, scale: 1 });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    window.__tastiera = (height, offsetTop) => {
      Object.assign(vv, { height, offsetTop });
      vv.dispatchEvent(new Event("resize"));
      vv.dispatchEvent(new Event("scroll"));
    };
  });
  await page.goto("/");
  const form = page.locator("form.chat-composer");
  const H = await page.evaluate(() => window.innerHeight);
  await expect.poll(async () => Math.round((await form.boundingBox()).y + (await form.boundingBox()).height)).toBe(H);
  await page.evaluate(() => window.__tastiera(400, 120));
  // Il fondo del campo coincide con il fondo della parte visibile (120 + 400).
  await expect.poll(async () => Math.round((await form.boundingBox()).y + (await form.boundingBox()).height)).toBe(520);
  await page.evaluate((h) => window.__tastiera(h, 0), H);
  await expect.poll(async () => Math.round((await form.boundingBox()).y + (await form.boundingBox()).height)).toBe(H);
});

test("pulisci chat subito, con Annulla per ripensarci", async ({ page }) => {
  await page.goto("/");
  const box = page.getByLabel("Chiedi alla tua memoria");
  await box.fill("dove ho salvato le ricette?");
  await box.press("Enter");
  await expect(page.getByText("dove ho salvato le ricette?")).toBeVisible();
  await page.getByRole("button", { name: "Pulisci chat" }).click();
  await expect(page.getByText("Chat pulita")).toBeVisible();
  await expect(page.getByText("Chiedimi qualsiasi cosa")).toBeVisible();
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page.getByText("dove ho salvato le ricette?")).toBeVisible();
});

test("chat: si apre dall'inizio dell'ultima risposta, anche se è lunga, non dalla tua domanda", async ({ page }) => {
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/");
  const box = page.getByLabel("Chiedi alla tua memoria");
  await box.fill("Cosa ho salvato sul limone?");
  await box.press("Enter");
  await expect(page.getByText("Risposta dai tuoi contenuti").first()).toBeVisible();
  await box.fill("Raccontami la ricetta lunga con il limone");
  await box.press("Enter");
  await expect(page.getByText("Passaggio 30 della ricetta")).toHaveCount(1);

  // Dopo averla ricevuta e riaprendo la chat: l'inizio dell'ultima risposta
  // è sotto l'intestazione, non tagliato in alto.
  for (const apri of [async () => {}, async () => page.reload()]) {
    await apri();
    const risposta = page.locator("[data-risposta]").last();
    await expect(risposta).toBeVisible();
    await expect.poll(async () => (await risposta.boundingBox()).y).toBeGreaterThan(60);
    await expect.poll(async () => (await risposta.boundingBox()).y).toBeLessThan(200);
  }
});

test("trascrizione incollata a mano su un link: salvata e mostrata come testo estratto", async ({ page }) => {
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.getByText("Trascrizione del video").click();
  await page.getByLabel("Testo della trascrizione").fill("Mettete il pecorino nella ciotola e mantecate fuori dal fuoco.");
  await page.getByRole("button", { name: "Salva trascrizione" }).click();
  await expect(page.getByText("Trascrizione salvata")).toBeVisible();
  await page.getByText(/Testo estratto/).click();
  await expect(page.getByText("fonte: trascrizione incollata da te")).toBeVisible();
  await expect(page.getByText("mantecate fuori dal fuoco")).toBeVisible();
});

test("salva una nota, la ritrova dopo il ricaricamento e la elimina", async ({ page }) => {
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "Nota" }).click();
  await page.getByLabel(/^Titolo/).fill("Idea regalo per Giulia");
  await page.getByLabel("Testo").fill("Lampada da lettura in ottone");
  await page.getByRole("textbox", { name: "Categorie" }).fill("Acquisti");
  await page.getByRole("textbox", { name: "Categorie" }).press("Enter");
  await page.getByRole("button", { name: "Salva", exact: true }).click();

  await expect(page).toHaveURL(/\/elemento\//);
  await expect(page.getByRole("heading", { name: "Idea regalo per Giulia" })).toBeVisible();
  await expect(page.getByText("Salvato", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Idea regalo per Giulia" })).toBeVisible();
  // La chat è solo per le domande: il contenuto è in Archivio.
  await page.goto("/");
  await expect(page.getByText("Chiedimi qualsiasi cosa")).toBeVisible();
  await expect(page.getByText("Idea regalo per Giulia")).toHaveCount(0);
  await page.goto("/archivio");
  await page.getByText("Idea regalo per Giulia").click();
  // Eliminazione subito, senza "Sei sicuro?": l'avviso permette di annullare.
  await page.getByRole("button", { name: "Elimina" }).click();
  await expect(page).toHaveURL(/\/archivio$/);
  await expect(page.getByText("Ancora niente qui")).toBeVisible();
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page.getByText("Idea regalo per Giulia")).toBeVisible();
  await page.getByText("Idea regalo per Giulia").click();
  await page.getByRole("button", { name: "Elimina" }).click();
  await expect(page.getByText("Elemento eliminato")).toBeVisible();
  await expect(page.getByText("Elemento eliminato")).toBeHidden({ timeout: 8000 });
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByText("Ancora niente qui")).toBeVisible();
});

test("link leggibile: Analizzato, testo estratto, categorie assegnate dall'AI", async ({ page }) => {
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByRole("heading", { name: "Pasta al limone in 10 minuti" })).toBeVisible();
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await expect(page.getByText("Cucina di prova")).toBeVisible();
  await expect(page.getByRole("link", { name: "Apri l'originale" })).toHaveAttribute("href", `${FIX}/ricetta`);

  // Testo estratto con la sua fonte
  await page.getByText("Testo estratto").click();
  await expect(page.getByText(/fonte: testo della pagina/)).toBeVisible();

  // Categorie e tag assegnati dall'AI, etichettati come tali
  await expect(page.getByText("Categorie e tag assegnati dall'AI · da verificare")).toBeVisible();
  await expect(page.getByText("Ricetta veloce di pasta al limone.")).toBeVisible();
  // Scheda di memoria: punti chiave e persone, luoghi e prodotti citati
  await expect(page.getByText("Punti chiave")).toBeVisible();
  await expect(page.getByText("La pasta al limone si condisce con scorza di limone, burro e parmigiano.")).toBeVisible();
  await expect(page.locator("li.cartellino", { hasText: "Parmigiano" })).toBeVisible();
  await expect(page.locator("li.pillola", { hasText: "Ricette" })).toBeVisible();
  await expect(page.locator("li.pillola", { hasText: "#pasta" })).toBeVisible();
});

test("contenuti salvati senza AI: rielaborati da soli all'apertura dell'app", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("second-brain-settings", JSON.stringify({ autoAi: false })));
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await expect(page.getByText("Punti chiave")).toHaveCount(0);
  const url = page.url();
  // L'AI torna attiva: la scheda di memoria viene creata senza fare nulla.
  await page.evaluate(() => localStorage.setItem("second-brain-settings", JSON.stringify({ autoAi: true })));
  await page.goto(url);
  await expect(page.getByText("Punti chiave")).toBeVisible();
  await expect(page.getByText("Ricetta veloce di pasta al limone.")).toBeVisible();
  await expect(page.locator("li.pillola", { hasText: "Ricette" })).toBeVisible();
});

test("contenuto dietro login: Non accessibile con spiegazione, link conservato", async ({ page }) => {
  await addLink(page, `${FIX}/reel-privato`, "esercizi schiena visti su Instagram");
  await expect(page.getByText("Non accessibile", { exact: true })).toBeVisible();
  await expect(page.getByText(/richiede di accedere/)).toBeVisible();
  await expect(page.getByText("La tua nota")).toBeVisible();
  await expect(page.getByRole("heading", { name: "esercizi schiena visti su Instagram" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Apri l'originale" })).toHaveAttribute("href", `${FIX}/reel-privato`);
});

test("indirizzo da Comandi Rapidi: /aggiungi?text= estrae il link", async ({ page }) => {
  const shared = `Guarda questo! ${FIX}/ricetta`;
  await page.goto(`/aggiungi?text=${encodeURIComponent(shared)}`);
  await expect(page.getByLabel("Link", { exact: true })).toHaveValue(`${FIX}/ricetta`);
  await expect(page.getByLabel("Nota (facoltativa)")).toHaveValue("Guarda questo!");
});

test("ricerca, filtri e domanda sull'archivio con fonti", async ({ page }) => {
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "Nota" }).click();
  await page.getByLabel(/^Titolo/).fill("Trattoria Da Enzo");
  await page.getByLabel("Testo").fill("ristorante a Roma, Trastevere");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/\/elemento\//);

  // Ricerca testuale (trova anche nel testo estratto)
  await page.goto("/archivio");
  await page.getByLabel("Cerca nell'archivio").fill("parmigiano");
  await expect(page.getByText("1 elemento")).toBeVisible();
  await expect(page.getByText("Pasta al limone in 10 minuti")).toBeVisible();
  // Stato in basso, prima delle categorie: pieno verde se analizzato.
  const riga = page.locator("ul.righe li").first();
  const tag = await riga.locator(".cartellino").first().boundingBox();
  const stato = riga.locator('[title="Analizzato"]');
  const pallino = await stato.boundingBox();
  expect(pallino.x + pallino.width).toBeLessThanOrEqual(tag.x + 1);
  expect(Math.abs(pallino.y + pallino.height / 2 - (tag.y + tag.height / 2))).toBeLessThan(6);
  await expect(stato.locator("i")).toHaveCSS("background-color", "rgb(34, 179, 94)");

  // Filtri rapidi: categorie sempre visibili
  await expect(page.getByRole("button", { name: /^Rianalizza/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tutte", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Ultimi 7 giorni" })).toHaveCount(0);

  // Filtro per tipo
  await page.getByLabel("Cerca nell'archivio").fill("");
  await page.getByRole("button", { name: /^Filtri/ }).click();
  // Scelte disegnate dall'app, niente menu a tendina del sistema; niente Tag e Stato.
  await expect(page.locator("#filters select")).toHaveCount(0);
  await expect(page.locator("#filters input")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Tag/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Stato/ })).toHaveCount(0);
  await expect(page.getByText("Nessun filtro attivo")).toBeVisible();
  await page.getByRole("button", { name: /^Tipo/ }).click();
  await page.getByRole("option", { name: "Nota" }).click();
  await expect(page.getByText("1 elemento")).toBeVisible();
  await expect(page.getByText("Trattoria Da Enzo")).toBeVisible();
  // "Azzera filtri" in cima al riquadro dei filtri
  await expect(page.getByText("1 filtro attivo")).toBeVisible();
  await page.getByRole("button", { name: "Azzera filtri" }).click();
  await expect(page.getByText("2 elementi")).toBeVisible();

  // Periodo con il calendario dell'app: mese e anno dal titolo, poi primo e ultimo giorno
  await page.getByRole("button", { name: /^Periodo/ }).click();
  await expect(page.getByText("Tocca il primo giorno")).toBeVisible();
  await page.getByRole("button", { name: /scegli mese e anno/ }).click();
  const anno = Number(await page.locator(".scegli-mese .num").textContent());
  for (let a = anno; a > 2025; a--) await page.getByRole("button", { name: "Anno prima" }).click();
  await page.getByRole("button", { name: "gennaio 2025" }).click();
  await page.getByRole("button", { name: /^mercoledì 1 gennaio 2025/ }).click();
  await expect(page.getByText("Ora tocca l'ultimo giorno")).toBeVisible();
  await page.getByRole("button", { name: /^venerdì 10 gennaio 2025/ }).click();
  await expect(page.getByRole("button", { name: /^Periodo\s*1 – 10 gen 2025/ })).toBeVisible();
  await expect(page.getByText("Nessun risultato")).toBeVisible();
  await expect(page).toHaveURL(/from=2025-01-01&to=2025-01-10/);
  // Mese dopo con la freccia; poi il periodo di oggi (stesso giorno due volte)
  await page.getByRole("button", { name: "Mese dopo" }).click();
  await expect(page.getByRole("button", { name: /^Febbraio 2025/ })).toBeVisible();
  await page.getByRole("button", { name: "Togli date" }).click();
  await page.getByRole("button", { name: /scegli mese e anno/ }).click();
  for (let a = 2025; a < anno; a++) await page.getByRole("button", { name: "Anno dopo" }).click();
  const oggi = new Date();
  await page.getByRole("button", { name: oggi.toLocaleDateString("it-IT", { month: "long", year: "numeric" }) }).click();
  await page.locator(".giorno.oggi").click();
  await page.locator(".giorno.oggi").click();
  await expect(page.getByText("2 elementi")).toBeVisible();
  // Chiuso il riquadro, il periodo resta come pillola da togliere
  await page.getByRole("button", { name: /^Filtri/ }).click();
  await page.getByRole("button", { name: /^Rimuovi filtro/ }).click();
  await expect(page).not.toHaveURL(/from=/);

  // Domanda nella chat: risposta con citazioni, fonti numerate e passaggio citato
  await page.goto("/");
  const box = page.getByLabel("Chiedi alla tua memoria");
  await box.fill("come si fa la pasta al limone?");
  await box.press("Enter");
  await expect(page.getByText("come si fa la pasta al limone?")).toBeVisible();
  await expect(page.getByText("Risposta dai tuoi contenuti")).toBeVisible();
  await expect(page.getByText(/scorza di limone, burro e parmigiano/).first()).toBeVisible();
  await expect(page.locator("strong", { hasText: "Pasta al limone in 10 minuti" })).toBeVisible();
  // Fonti in un riquadro chiuso, con le miniature; si apre toccandolo.
  const fonti = page.getByRole("button", { name: /^Fonti/ }).first();
  await expect(fonti).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("«si condisce con scorza di limone, burro e parmigiano»")).toHaveCount(0);
  await fonti.click();
  await expect(page.getByText("«si condisce con scorza di limone, burro e parmigiano»")).toBeVisible();
  await expect(page.getByRole("link", { name: "Apri l'originale" })).toHaveAttribute("href", `${FIX}/ricetta`);

  // Domanda di seguito: si capisce dalla conversazione. L'estratto inventato non compare.
  await box.fill("e quanto ci vuole?");
  await box.press("Enter");
  await expect(page.getByText("Ci vogliono 10 minuti")).toBeVisible();
  await expect(page.getByText(/frase inventata/)).toHaveCount(0);

  // Domanda con parole diverse da quelle del contenuto: risponde dalle parole chiave della scheda
  await box.fill("mi serve un primo piatto veloce, cosa avevo salvato?");
  await box.press("Enter");
  await expect(page.getByText(/c'è un primo piatto veloce/)).toBeVisible();

  // Domanda senza riscontri nell'archivio. La risposta arriva anche se
  // nel frattempo si passa all'Archivio.
  await box.fill("orari della palestra?");
  await page.getByRole("button", { name: "Invia" }).click();
  await expect(page.getByText("Cerco nella tua memoria…")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navigazione principale" });
  await nav.getByRole("link", { name: "Archivio" }).click();
  await expect(page).toHaveURL(/\/archivio/);
  await nav.getByRole("link", { name: "Chat" }).click();
  await expect(page.getByText(/I tuoi contenuti non bastano per rispondere/)).toBeVisible();

  // La cronologia resta dopo il ricaricamento; la citazione apre la fonte
  await page.reload();
  await expect(page.getByText("orari della palestra?")).toBeVisible();
  await page.getByRole("button", { name: "Fonte 1" }).first().click();
  await expect(page).toHaveURL(/\/elemento\//);
});

test("carica un file di testo: testo estratto e cercabile", async ({ page }) => {
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "File" }).click();
  await page.getByLabel(/^File/).setInputFiles({ name: "appunti.md", mimeType: "text/markdown", buffer: Buffer.from("# Docker\nComando utile: docker compose up -d") });
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByRole("heading", { name: "appunti.md" })).toBeVisible();
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/archivio?q=compose");
  await expect(page.getByText("appunti.md")).toBeVisible();
});

test("file non ammesso: errore chiaro, niente salvataggio", async ({ page }) => {
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "File" }).click();
  await page.getByLabel(/^File/).setInputFiles({ name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await expect(page.getByRole("alert")).toContainText("Tipo di file non supportato");
});

test("link non valido: messaggio di errore", async ({ page }) => {
  await page.goto("/aggiungi");
  await page.getByLabel("Link", { exact: true }).fill("non è un link");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Inserisci un link valido");
});

test("manifest PWA e icone", async ({ request }) => {
  const res = await request.get("/");
  expect(res.ok()).toBeTruthy();
  for (const p of ["/favicon.svg", "/apple-touch-icon.png", "/icons/icon-192.png", "/icons/icon-512.png"]) {
    expect((await request.get(p)).ok(), p).toBeTruthy();
  }
});

test("Archivio a box: una scatola per categoria, dentro le copertine; Vista passa a lista", async ({ page }) => {
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "Nota" }).click();
  await page.getByLabel(/^Titolo/).fill("Idea regalo per Giulia");
  await page.getByLabel("Testo").fill("Lampada da lettura in ottone");
  await page.getByRole("textbox", { name: "Categorie" }).fill("Acquisti");
  await page.getByRole("textbox", { name: "Categorie" }).press("Enter");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/\/elemento\//);

  // Di partenza: box, uno per categoria, con il numero dei contenuti.
  await page.goto("/archivio");
  const vista = page.getByRole("group", { name: "Vista" });
  await expect(vista.getByRole("button", { name: "Box" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Ricette, 1 contenuto" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Acquisti, 1 contenuto" })).toBeVisible();
  await expect(page.locator("ul.righe")).toHaveCount(0);
  await expect(page.getByText(/^\d+ categorie$/)).toBeVisible();

  // Dentro un box: i contenuti della categoria, e "Categorie" per tornare indietro.
  await page.getByRole("button", { name: "Ricette, 1 contenuto" }).click();
  await expect(page).toHaveURL(/category=Ricette/);
  // Il titolo grande non è più "Archivio" ma il nome del box.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ricette");
  await expect(page.getByText("1 elemento")).toBeVisible();
  await expect(page.getByRole("link", { name: /Pasta al limone in 10 minuti/ })).toBeVisible();
  await expect(page.getByText("Idea regalo per Giulia")).toHaveCount(0);

  // Vista Lista: la lista di sempre, e la scelta resta dopo il ricaricamento.
  await vista.getByRole("button", { name: "Lista" }).click();
  await expect(page.locator("ul.righe li")).toHaveCount(1);
  await page.reload();
  await expect(vista.getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Tutte", exact: true })).toBeVisible();

  // Di nuovo a box: "Categorie" riporta a tutte le scatole.
  await vista.getByRole("button", { name: "Box" }).click();
  await page.getByRole("button", { name: "Categorie", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Archivio");
  await expect(page.getByRole("button", { name: "Acquisti, 1 contenuto" })).toBeVisible();

  // Ricerca: i box mostrano solo ciò che corrisponde.
  await page.getByLabel("Cerca nell'archivio").fill("lampada");
  await expect(page.getByRole("button", { name: "Acquisti, 1 contenuto" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ricette, 1 contenuto" })).toHaveCount(0);
});

test("Archivio a box: Ristoranti ed Eventi con i link ai contenuti; passati in grigio in fondo", async ({ page }) => {
  await addLink(page, `${FIX}/trastevere`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();

  // Due box fissi in testa, prima delle categorie.
  await page.goto("/archivio");
  const ristoranti = page.getByRole("button", { name: "Ristoranti, 2 locali" });
  await expect(ristoranti).toBeVisible();
  await expect(page.getByRole("button", { name: "Eventi, 1 in arrivo" })).toBeVisible();
  // Colorati come le altre scatole, non neri.
  await expect(ristoranti).toHaveCSS("background-color", "rgb(255, 122, 26)");
  await expect(page.getByRole("button", { name: /^Eventi,/ })).toHaveCSS("background-color", "rgb(34, 179, 94)");
  expect((await ristoranti.boundingBox()).y).toBeLessThan((await page.getByRole("button", { name: /^Cibo,/ }).boundingBox()).y);

  // Ristoranti: nome, via e sotto il link al contenuto; i posti che non sono locali no.
  await ristoranti.click();
  await expect(page).toHaveURL(/sezione=ristoranti/);
  const righe = page.locator("ul.righe > li");
  await expect(righe).toHaveCount(2);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ristoranti");
  await expect(righe.first()).toContainText("Bar San Calisto");
  const enzo = righe.filter({ hasText: "Da Enzo al 29" });
  await expect(enzo).toContainText("Via dei Vascellari 29, Roma");
  // L'indirizzo è un link a Maps con nome e via (senza via ci sarebbe "Cerca su Maps").
  const mappa = enzo.getByRole("link", { name: /Via dei Vascellari 29, Roma/ });
  await expect(mappa).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Da Enzo al 29, Via dei Vascellari 29, Roma"));
  await expect(righe.first().getByRole("link", { name: /Piazza di San Calisto, Roma/ })).toHaveAttribute("href", /query=Bar%20San%20Calisto%2C%20Piazza%20di%20San%20Calisto%2C%20Roma$/);
  await expect(enzo.getByRole("link", { name: /Apri su Guida di prova/ })).toHaveAttribute("href", `${FIX}/trastevere`);
  await expect(enzo.getByRole("link", { name: "Scheda" })).toBeVisible();
  await expect(page.getByText("Museo di Trastevere")).toHaveCount(0);

  // Eventi: prossimi per data, poi senza data, in fondo i passati in grigio.
  await page.getByRole("button", { name: "Categorie", exact: true }).click();
  await page.getByRole("button", { name: /^Eventi,/ }).click();
  const prossimo = await page.getByText("Serata carbonara da Enzo").boundingBox();
  const senzaData = await page.getByText("Festa del quartiere").boundingBox();
  const passato = await page.getByText("Degustazione di primavera").boundingBox();
  expect(prossimo.y).toBeLessThan(senzaData.y);
  expect(senzaData.y).toBeLessThan(passato.y);
  await expect(page.getByRole("heading", { name: "Passati" })).toBeVisible();
  await expect(page.locator("[data-passati]")).toHaveCSS("opacity", "0.5");
  await expect(page.getByText("Serata carbonara da Enzo").locator("xpath=ancestor::li[1]").getByRole("link", { name: /Apri su Guida di prova/ })).toBeVisible();

  // Passando a lista le due sezioni non ci sono: resta la lista di sempre.
  await page.getByRole("button", { name: "Categorie", exact: true }).click();
  await page.getByRole("group", { name: "Vista" }).getByRole("button", { name: "Lista" }).click();
  await expect(page.getByRole("button", { name: /^Ristoranti,/ })).toHaveCount(0);
  await expect(page.locator("ul.righe li")).toHaveCount(1);
});
