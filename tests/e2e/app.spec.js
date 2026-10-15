/* global window, indexedDB, document */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

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
  // Ordine chiaro: Archivio, AI, Dati e account; il resto è in "Informazioni e privacy", chiuso.
  const ys = [];
  for (const n of ["Archivio", "AI", "Dati e account", "Informazioni e privacy"]) ys.push((await page.getByText(n, { exact: true }).last().boundingBox()).y);
  expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  await expect(page.getByRole("switch", { name: /Rielabora con l'AI/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fai il Backup" })).toBeVisible();
  await expect(page.getByText(/IndexedDB/)).toBeHidden();
  await page.getByText("Informazioni e privacy").click();
  await expect(page.getByText(/IndexedDB/)).toBeVisible();
  await expect(page.getByText(/Versione dell'app/)).toBeVisible();
  // In Archivio non ci sono più; Filtri è una sola icona (senza la parola) sotto la ricerca.
  await page.goto("/archivio");
  await expect(page.getByRole("button", { name: /^Rianalizza/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Aggiungi", exact: true })).toHaveCount(0);
  // Il titolo grande parte sulla stessa riga dell'icona Impostazioni.
  const tit = await page.getByRole("heading", { level: 1 }).boundingBox();
  const ing = await page.getByRole("button", { name: "Impostazioni" }).boundingBox();
  expect(ing.y).toBeLessThan(tit.y + tit.height);
  expect(ing.y + ing.height).toBeGreaterThan(tit.y);
  expect(ing.x).toBeGreaterThan(tit.x + 100);
  const campo = await page.getByLabel("Cerca nell'archivio").boundingBox();
  const filtri = page.getByRole("button", { name: /^Filtri/ });
  const fb = await filtri.boundingBox();
  expect(fb.y).toBeGreaterThan(campo.y + campo.height - 1);
  // Sotto la riga Filtri / Box-Lista non c'è nessuna linea.
  await expect(page.locator("h2.sezione").filter({ has: filtri })).toHaveCSS("border-bottom-width", "0px");
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
  await expect(box).toHaveAttribute("placeholder", "Chiedimi qualcosa...");
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
  await page.getByText("Dettagli", { exact: true }).click();
  await page.getByLabel("Testo della trascrizione").fill("Mettete il pecorino nella ciotola e mantecate fuori dal fuoco.");
  await page.getByRole("button", { name: "Salva trascrizione" }).click();
  await expect(page.getByText("Trascrizione salvata")).toBeVisible();
  await expect(page.getByText(/fonte: trascrizione incollata da te/)).toBeVisible();
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
  // Elimina: solo il cestino rosso, in alto a destra accanto a Modifica.
  const elimina = page.getByRole("button", { name: "Elimina" });
  await expect(elimina).toHaveCSS("background-color", "rgb(224, 42, 13)");
  expect((await elimina.innerText()).trim()).toBe("");
  const modifica = await page.getByRole("button", { name: "Modifica" }).boundingBox();
  const cestino = await elimina.boundingBox();
  expect(cestino.x).toBeGreaterThan(modifica.x + modifica.width - 1);
  expect(Math.abs(cestino.y - modifica.y)).toBeLessThan(12);
  await expect(page.getByRole("button", { name: "Elimina" })).toHaveCount(1);

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

  // Dati tecnici e testo letto stanno in "Dettagli", chiuso di partenza.
  await expect(page.getByText(/fonte: testo della pagina/)).toBeHidden();
  await page.getByText("Dettagli", { exact: true }).click();
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

  // Lo swipe indietro dell'iPhone (indietro nella cronologia) torna alle categorie.
  await page.goBack();
  await expect(page).not.toHaveURL(/category=/);
  await expect(page.getByRole("button", { name: "Acquisti, 1 contenuto" })).toBeVisible();
  // "Categorie" fa lo stesso passo indietro, senza lasciare il box nella cronologia.
  await page.getByRole("button", { name: "Ricette, 1 contenuto" }).click();
  await page.getByRole("button", { name: "Categorie", exact: true }).click();
  await expect(page).not.toHaveURL(/category=/);
  await page.goBack();
  await expect(page).not.toHaveURL(/category=/);
  await page.goForward();
  await page.getByRole("button", { name: "Ricette, 1 contenuto" }).click();
  await expect(page).toHaveURL(/category=Ricette/);

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
  await expect(ristoranti).toHaveCSS("background-color", "rgb(255, 59, 28)");
  await expect(page.getByRole("button", { name: /^Eventi,/ })).toHaveCSS("background-color", "rgb(34, 179, 94)");
  expect((await ristoranti.boundingBox()).y).toBeLessThan((await page.getByRole("button", { name: /^Cibo,/ }).boundingBox()).y);

  // Ristoranti: nome, via e sotto il link al contenuto; i posti che non sono locali no.
  await ristoranti.click();
  await expect(page).toHaveURL(/sezione=ristoranti/);
  // Filtri sta a destra, sulla stessa riga di "Categorie".
  const cat = await page.getByRole("button", { name: "Categorie", exact: true }).boundingBox();
  const fil = await page.getByRole("button", { name: "Filtri" }).boundingBox();
  expect(Math.abs(fil.y - cat.y)).toBeLessThan(4);
  expect(fil.x + fil.width).toBeGreaterThan(page.viewportSize().width - 30);
  const righe = page.locator("ul.righe > li");
  await expect(righe).toHaveCount(2);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ristoranti");
  // Il titolo sta sulla riga dell'icona Impostazioni anche dentro un box.
  const t2 = await page.getByRole("heading", { level: 1 }).boundingBox();
  const g2 = await page.getByRole("button", { name: "Impostazioni" }).boundingBox();
  expect(g2.y).toBeLessThan(t2.y + t2.height);
  await expect(righe.first()).toContainText("Bar San Calisto");
  const enzo = righe.filter({ hasText: "Da Enzo al 29" });
  await expect(enzo).toContainText("Via dei Vascellari 29, Roma");
  // L'indirizzo con la via completa è il testo del link a Maps (nome e via nella ricerca).
  const mappa = enzo.getByRole("link", { name: /Via dei Vascellari 29, Roma/ });
  await expect(mappa).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Da Enzo al 29, Via dei Vascellari 29, Roma"));
  // Il Bar ha solo la città: la via si cerca su OpenStreetMap (qui finto), si
  // vede nel link a Maps e resta salvata dopo il ricaricamento.
  const bar = righe.first();
  await expect(bar.getByRole("link", { name: /Piazza di San Calisto 3, Roma/ })).toHaveAttribute("href", /query=Bar%20San%20Calisto%2C%20Piazza%20di%20San%20Calisto%203%2C%20Roma$/);
  await expect(bar.getByRole("link", { name: /^Roma/ })).toHaveCount(0);
  await expect(bar.getByRole("link", { name: /Cerca su Maps/ })).toHaveCount(0);
  await page.reload();
  await expect(page.locator("ul.righe > li").first().getByRole("link", { name: /Piazza di San Calisto 3, Roma/ })).toBeVisible();
  // Le sedi si scrivono a mano dall'icona tonda accanto al nome (anche più di una);
  // valgono più di quella trovata (qui il Bar) e restano dopo il ricaricamento.
  await expect(bar.getByRole("button", { name: /Scrivi la via|Modifica la via/ })).toHaveCount(0);
  const icona = bar.getByRole("button", { name: "Indirizzi di Bar San Calisto" });
  const nomeBar = await bar.getByText("Bar San Calisto", { exact: true }).boundingBox();
  const ic = await icona.boundingBox();
  expect(ic.x).toBeGreaterThan(nomeBar.x + nomeBar.width);
  expect(ic.y).toBeLessThan(nomeBar.y + nomeBar.height);
  // Tre puntini senza il tondo; un tocco apre un menu: con una via già nota ci sono Modifica e Aggiungi.
  await expect(icona).toHaveCSS("border-top-width", "0px");
  await icona.click();
  await expect(bar.getByRole("menuitem")).toHaveText(["Modifica via", "Aggiungi via"]);
  // Un tocco fuori (anche sopra un link, o sulla barra in basso) chiude solo il menu: il link sotto non scatta.
  const url0 = page.url();
  const link = await bar.getByRole("link", { name: /Piazza di San Calisto 3, Roma/ }).boundingBox();
  await page.mouse.click(link.x + link.width / 2, link.y + link.height / 2);
  await expect(bar.getByRole("menu")).toHaveCount(0);
  expect(page.url()).toBe(url0);
  expect(page.context().pages()).toHaveLength(1);
  await icona.click();
  const nav = await page.getByRole("link", { name: "Chat", exact: true }).boundingBox();
  await page.mouse.click(nav.x + nav.width / 2, nav.y + nav.height / 2);
  await expect(bar.getByRole("menu")).toHaveCount(0);
  expect(page.url()).toBe(url0);
  await icona.click();
  await expect(bar.getByRole("menuitem")).toHaveText(["Modifica via", "Aggiungi via"]);
  await page.keyboard.press("Escape");
  await expect(bar.getByRole("menu")).toHaveCount(0);
  await icona.click();
  await bar.getByRole("menuitem", { name: "Modifica via" }).click();
  await expect(bar.getByRole("menu")).toHaveCount(0);
  await expect(bar.getByRole("textbox", { name: "Indirizzo 1 di Bar San Calisto" })).toHaveValue("Piazza di San Calisto 3, Roma");
  await bar.getByRole("textbox", { name: "Indirizzo 1 di Bar San Calisto" }).fill("Via Prova 5, Roma");
  await bar.getByRole("button", { name: "+ Aggiungi un'altra sede" }).click();
  await bar.getByRole("textbox", { name: "Indirizzo 2 di Bar San Calisto" }).fill("Via Seconda 7, Milano");
  await bar.getByRole("button", { name: "Salva" }).click();
  await expect(bar.getByRole("link", { name: /Via Prova 5, Roma/ })).toHaveAttribute("href", /query=Bar%20San%20Calisto%2C%20Via%20Prova%205%2C%20Roma$/);
  await expect(bar.getByRole("link", { name: /Via Seconda 7, Milano/ })).toHaveAttribute("href", /query=Bar%20San%20Calisto%2C%20Via%20Seconda%207%2C%20Milano$/);
  await page.reload();
  await expect(page.locator("ul.righe > li").first().getByRole("link", { name: /Via Prova 5, Roma/ })).toBeVisible();
  await expect(page.locator("ul.righe > li").first().getByRole("link", { name: /Via Seconda 7, Milano/ })).toBeVisible();
  await expect(page.locator("ul.righe > li").first().getByRole("link", { name: /Piazza di San Calisto/ })).toHaveCount(0);
  // Togliendo una sede resta l'altra.
  await page.locator("ul.righe > li").first().getByRole("button", { name: "Indirizzi di Bar San Calisto" }).click();
  await page.getByRole("menuitem", { name: "Modifica via" }).click();
  await page.getByRole("button", { name: "Togli l'indirizzo 2 di Bar San Calisto" }).click();
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("link", { name: /Via Seconda 7, Milano/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Via Prova 5, Roma/ })).toBeVisible();
  await expect(enzo.getByRole("link", { name: /Apri su Guida di prova/ })).toHaveAttribute("href", `${FIX}/trastevere`);
  await expect(enzo.getByRole("link", { name: "Scheda" })).toBeVisible();
  // Prima "Apri su …" e Scheda, sotto la via con il link a Maps.
  const apri = await enzo.getByRole("link", { name: /Apri su Guida di prova/ }).boundingBox();
  const via = await mappa.boundingBox();
  expect(via.y).toBeGreaterThan(apri.y + apri.height - 1);
  await expect(page.getByText("Museo di Trastevere")).toHaveCount(0);

  // La scheda ha il link a Maps dei locali con la via (non quello generico di una località).
  await enzo.getByRole("link", { name: "Scheda" }).click();
  await expect(page.getByRole("link", { name: /Da Enzo al 29 · Via dei Vascellari 29, Roma/ })).toHaveAttribute("href", /query=Da%20Enzo%20al%2029%2C%20Via%20dei%20Vascellari%2029%2C%20Roma$/);
  await expect(page.getByRole("link", { name: /Bar San Calisto · Via Prova 5, Roma/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Apri in Mappe/ })).toHaveCount(0);
  await page.goBack();

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
  // Il riquadro della data è rosso come il box Ristoranti.
  await expect(page.getByText("25 ott", { exact: true })).toBeVisible();
  await expect(page.getByText("25 ott", { exact: true }).locator("xpath=ancestor::div[1]")).toHaveCSS("background-color", "rgb(255, 59, 28)");
  // Biglietto: sotto il talloncino c'è la dentellatura a zigzag.
  await expect(page.locator("[data-biglietto]").first().locator("div[aria-hidden=true]")).toHaveCSS("background-image", /svg/);
  // Calendario .ics: file "second-brain.ics" con gli eventi datati, tutto il giorno.
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByText("Serata carbonara da Enzo").locator("xpath=ancestor::li[1]").getByRole("button", { name: "Aggiungi al calendario" }).click()]);
  expect(dl.suggestedFilename()).toBe("second-brain.ics");
  const ics = readFileSync(await dl.path(), "utf8");
  expect(ics).toContain("X-WR-CALNAME:second-brain");
  expect(ics).toContain("X-APPLE-CALENDAR-COLOR:#ffb5d0");
  expect(ics).toContain("SUMMARY:🎟️ Serata carbonara da Enzo");
  expect(ics).not.toContain("Festa del quartiere");

  // Passando a lista le due sezioni non ci sono: resta la lista di sempre.
  await page.getByRole("button", { name: "Categorie", exact: true }).click();
  await page.getByRole("group", { name: "Vista" }).getByRole("button", { name: "Lista" }).click();
  await expect(page.getByRole("button", { name: /^Ristoranti,/ })).toHaveCount(0);
  await expect(page.locator("ul.righe li")).toHaveCount(1);
});

test("filtro Autore: i nomi lunghi restano nella larghezza e la pagina non scorre di lato", async ({ page }) => {
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  // Un autore con un nome lunghissimo, come quelli dei profili Instagram.
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("second-brain");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("items", "readwrite");
          const st = tx.objectStore("items");
          st.getAll().onsuccess = (e) => {
            for (const it of e.target.result) st.put({ ...it, author: "Un nome di profilo davvero molto lungo | Investitore Efficace e Consulente Finanziario (@investitore.efficace.consulente)" });
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.goto("/archivio");
  await page.getByRole("button", { name: "Filtri" }).click();
  await page.getByRole("button", { name: /^Autore/ }).click();
  const scelta = page.getByRole("option", { name: /Investitore Efficace/ });
  await expect(scelta).toBeVisible();
  const w = page.viewportSize().width;
  const b = await scelta.boundingBox();
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(w);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Archivio a box: Ristoranti senza via, il menu dei puntini offre solo Aggiungi via", async ({ page }) => {
  // OpenStreetMap non trova nulla: il Bar resta con la sola città.
  await page.route("**/api/geo", (route) => route.fulfill({ json: { found: null } }));
  await addLink(page, `${FIX}/trastevere`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/archivio?sezione=ristoranti");
  const bar = page.locator("ul.righe > li").first();
  await expect(bar.getByRole("link", { name: /Cerca su Maps/ })).toBeVisible();
  await bar.getByRole("button", { name: "Indirizzi di Bar San Calisto" }).click();
  await expect(bar.getByRole("menuitem")).toHaveText(["Aggiungi via"]);
  await bar.getByRole("menuitem", { name: "Aggiungi via" }).click();
  await expect(bar.getByRole("textbox", { name: "Indirizzo 1 di Bar San Calisto" })).toHaveValue("");
  await bar.getByRole("textbox", { name: "Indirizzo 1 di Bar San Calisto" }).fill("Via Nuova 1, Roma");
  await bar.getByRole("button", { name: "Salva" }).click();
  await expect(bar.getByRole("link", { name: /Via Nuova 1, Roma/ })).toBeVisible();
  await expect(bar.getByRole("link", { name: /Cerca su Maps/ })).toHaveCount(0);
  // Ora c'è una via: il menu ha Modifica e Aggiungi; "Aggiungi via" apre la via nota più un campo vuoto.
  await bar.getByRole("button", { name: "Indirizzi di Bar San Calisto" }).click();
  await expect(bar.getByRole("menuitem")).toHaveText(["Modifica via", "Aggiungi via"]);
  await bar.getByRole("menuitem", { name: "Aggiungi via" }).click();
  await expect(bar.getByRole("textbox", { name: "Indirizzo 1 di Bar San Calisto" })).toHaveValue("Via Nuova 1, Roma");
  await bar.getByRole("textbox", { name: "Indirizzo 2 di Bar San Calisto" }).fill("Via Seconda 2, Milano");
  await bar.getByRole("button", { name: "Salva" }).click();
  await expect(bar.getByRole("link", { name: /Via Seconda 2, Milano/ })).toBeVisible();
  await expect(bar.getByRole("link", { name: /Via Nuova 1, Roma/ })).toBeVisible();
});

test("chat: tirando la pagina verso il basso in cima (rimbalzo di iPhone) il campo resta in fondo", async ({ page }) => {
  // Sull'iPhone, nel rimbalzo in cima, visualViewport.offsetTop diventa negativo.
  await page.addInitScript(() => {
    const vv = new EventTarget();
    Object.defineProperties(vv, {
      width: { get: () => window.innerWidth },
      height: { get: () => window.innerHeight },
      offsetTop: { value: -420 },
      offsetLeft: { value: 0 },
      pageTop: { value: -420 },
      scale: { value: 1 },
    });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  });
  await page.goto("/");
  const composer = page.locator(".chat-composer");
  await expect(composer).toBeVisible();
  expect(await page.evaluate(() => window.visualViewport.offsetTop)).toBe(-420);
  expect(await composer.evaluate((el) => el.style.transform)).toBe("");
});

test("chat: il tondo + accanto al campo apre Foto, video o file e Link; un file si salva subito", async ({ page }) => {
  await page.goto("/");
  const piu = page.getByRole("button", { name: "Aggiungi foto, video o file" });
  const campo = await page.getByRole("textbox", { name: "Chiedi alla tua memoria" }).boundingBox();
  const pb = await piu.boundingBox();
  expect(pb.x + pb.width).toBeLessThanOrEqual(campo.x + 1);
  // Non c'è più nella barra in basso.
  await expect(page.getByRole("navigation", { name: "Navigazione principale" }).getByRole("button")).toHaveCount(0);
  await piu.click();
  await expect(page.getByRole("menuitem")).toHaveText(["Foto, video o file", "Link"]);
  // Un tocco fuori (anche sopra la barra) chiude il menu senza attivare quello che sta sotto.
  const arch = await page.getByRole("link", { name: "Archivio", exact: true }).boundingBox();
  await page.mouse.click(arch.x + arch.width / 2, arch.y + arch.height / 2);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  // Foto: si sceglie dal telefono e finisce nell'archivio.
  await piu.click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: "Foto, video o file" }).click()]);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await chooser.setFiles({ name: "schermata.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Salvato nell'archivio")).toBeVisible();
  // Anche un video, dallo stesso pulsante.
  await piu.click();
  const [chooser2] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: "Foto, video o file" }).click()]);
  await chooser2.setFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("00000018667479706d703432", "hex") });
  await expect(page.getByText("Salvato nell'archivio").first()).toBeVisible();
  await page.getByRole("link", { name: "Archivio", exact: true }).click();
  await expect(page.getByText("schermata.png").first()).toBeVisible();
  await expect(page.getByText("clip.mp4").first()).toBeVisible();
  // Link porta alla pagina Aggiungi.
  await page.goto("/");
  await piu.click();
  await page.getByRole("menuitem", { name: "Link" }).click();
  await expect(page).toHaveURL(/\/aggiungi$/);
});

test("Archivio a box: il box Foto e video mostra la foto salvata", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Aggiungi foto, video o file" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: "Foto, video o file" }).click()]);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await chooser.setFiles({ name: "vestito.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Salvato nell'archivio")).toBeVisible();
  await page.getByRole("link", { name: "Archivio", exact: true }).click();
  // La foto ha la sua copertina anche nel box della categoria.
  await expect(page.getByRole("button", { name: /^Senza categoria/ }).locator("img")).toBeVisible();
  await page.getByRole("button", { name: /^Foto e video, 1 file/ }).click();
  await expect(page.getByRole("heading", { name: "Foto e video", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "vestito.png" }).locator("img")).toBeVisible();
});

test("Archivio a box: i box fissi Foto e video e File hanno le stesse dimensioni di Ristoranti e si possono riordinare", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Aggiungi foto, video o file" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: "Foto, video o file" }).click()]);
  await chooser.setFiles({ name: "nota.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
  await expect(page.getByText("Salvato nell'archivio")).toBeVisible();
  await page.getByRole("link", { name: "Archivio", exact: true }).click();
  const size = async (name) => (await page.getByRole("button", { name: new RegExp(`^${name},`) }).boundingBox());
  const r = await size("Ristoranti");
  for (const n of ["Eventi", "Foto e video", "File"]) {
    const b = await size(n);
    expect(Math.abs(b.width - r.width)).toBeLessThan(2);
    expect(Math.abs(b.height - r.height)).toBeLessThan(2);
  }
  // Riordino: File passa prima di Foto e video.
  const x0 = (await size("File")).y * 1000 + (await size("File")).x;
  await page.getByRole("button", { name: "Ordina" }).click();
  await page.getByRole("button", { name: "Sposta File prima" }).click();
  await page.getByRole("button", { name: "Sposta File prima" }).click();
  await page.getByRole("button", { name: "Fine" }).click();
  const x1 = (await size("File")).y * 1000 + (await size("File")).x;
  expect(x1).toBeLessThan(x0);
  await page.reload();
  const x2 = (await size("File")).y * 1000 + (await size("File")).x;
  expect(x2).toBe(x1);
  // Il box File mostra il documento.
  await page.getByRole("button", { name: /^File,/ }).click();
  await expect(page.getByRole("heading", { name: "File", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /nota\.pdf/ })).toBeVisible();
});

test("lista: lo swipe su una riga scopre Elimina, con Annulla", async ({ page }) => {
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "Nota" }).click();
  await page.getByLabel(/^Titolo/).fill("Prova da togliere");
  await page.getByLabel("Testo").fill("Testo di prova");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/\/elemento\//);
  await page.goto("/archivio");
  const riga = page.getByRole("link", { name: /Prova da togliere/ }).first();
  await expect(riga).toBeVisible();
  const b = await riga.boundingBox();
  await page.mouse.move(b.x + b.width - 20, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 80, b.y + b.height / 2, { steps: 5 });
  await page.mouse.move(b.x + b.width - 140, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Elimina" }).click();
  await expect(page.getByText("Elemento eliminato")).toBeVisible();
  await expect(page.getByRole("link", { name: /Prova da togliere/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page.getByRole("link", { name: /Prova da togliere/ }).first()).toBeVisible();
});

test("chat: appena invii, si vede la risposta in preparazione sopra il campo, non solo la tua domanda", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/");
  const box = page.getByLabel("Chiedi alla tua memoria");
  for (const q of ["Cosa ho salvato sul limone?", "Raccontami la ricetta lunga con il limone"]) {
    await box.fill(q);
    await box.press("Enter");
    await expect(page.getByText("Risposta dai tuoi contenuti").last()).toBeVisible();
  }
  await page.route("**/api/ai", async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await box.fill("Un'altra domanda sul limone");
  await box.press("Enter");
  const attesa = page.getByText("Cerco nella tua memoria…");
  await expect(attesa).toBeVisible();
  const form = await page.locator("form.chat-composer").boundingBox();
  await expect.poll(async () => { const b = await attesa.boundingBox(); return b.y + b.height <= form.y + 2 && b.y > 50; }).toBe(true);
  await expect(page.getByText("Un'altra domanda sul limone")).toBeInViewport();
  // Vignetta: l'angolo in basso a sinistra del box bianco è quasi retto, gli altri tondi.
  const vign = page.locator(".vignetta").last();
  await expect(vign).toHaveCSS("border-bottom-left-radius", "4px");
  await expect(vign).toHaveCSS("border-top-left-radius", "18px");
});

test("Aggiungi: i tre pulsanti non sono attaccati al titolo", async ({ page }) => {
  await page.goto("/aggiungi");
  const h = await page.getByRole("heading", { name: "Aggiungi", level: 1 }).boundingBox();
  const t = await page.getByRole("tab", { name: "Link" }).boundingBox();
  expect(t.y - (h.y + h.height)).toBeGreaterThanOrEqual(20);
});
