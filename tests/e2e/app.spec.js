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

// "Altri campi (facoltativi)" è chiuso: lo apre se serve (titolo, nota del link, categorie, tag).
// Menu "…" della pagina principale dell'Archivio: filtri, vista e ordine dei box.
// Comandi dell'Archivio: pill Box/Lista e Riordina a sinistra, Filtri a destra.
async function opzione(page, voce) {
  const nomi = { "Mostra come lista": "Lista", "Mostra come box": "Box", "Riordina i box": "Riordina" };
  if (nomi[voce]) return page.getByRole("button", { name: nomi[voce], exact: true }).click();
  await page.getByRole("button", { name: voce }).click();
}

// Vista dell'Archivio (box o lista) dal menu "…"; se è già quella, si richiude.
// La pill Box/Lista mostra solo la vista a cui si passa.
async function vista(page, v) {
  await expect(page.getByRole("button", { name: /^(Box|Lista)$/ })).toBeVisible();
  const pill = page.getByRole("button", { name: v === "box" ? "Box" : "Lista", exact: true });
  if (await pill.count()) await pill.click();
}

async function apriAltri(page) {
  const d = page.locator("details", { hasText: "Altri campi (facoltativi)" });
  if ((await d.getAttribute("open")) === null) await d.locator("summary").click();
}

async function addLink(page, url, note) {
  await page.goto("/aggiungi");
  await page.getByLabel("Link", { exact: true }).fill(url);
  if (note) {
    await apriAltri(page);
    await page.getByLabel("Nota (facoltativa)").fill(note);
  }
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
  // Fai il Backup sta in cima alle Impostazioni; Rianalizza compare solo se c'è qualcosa da rileggere.
  await expect(page.getByRole("button", { name: /^Rianalizza/ })).toHaveCount(0);
  const agg = await page.getByRole("button", { name: "Fai il Backup" }).boundingBox();
  const titolo = await page.getByRole("heading", { name: "Impostazioni" }).boundingBox();
  expect(agg.y).toBeLessThan(titolo.y + 300);
  // Ordine chiaro: Archivio, AI, Dati e account; il resto è in "Informazioni e privacy", chiuso.
  const ys = [];
  for (const n of ["Archivio", "AI", "Dati e account", "Informazioni e privacy"]) ys.push((await page.locator("main").getByText(n, { exact: true }).last().boundingBox()).y);
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
  // Archivio vuoto: niente comandi, solo la ricerca.
  await expect(page.getByRole("button", { name: "Lista", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Filtri/ })).toHaveCount(0);
  await expect(page.getByText("Filtri", { exact: true })).toHaveCount(0);
  // Aggiungi non sta più nelle Impostazioni.
  await page.goto("/impostazioni");
  await expect(page.getByRole("button", { name: "Aggiungi", exact: true })).toHaveCount(0);
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
  await apriAltri(page);
  await page.getByLabel(/^Titolo/).fill("Idea regalo per Giulia");
  await page.getByLabel("Testo").fill("Lampada da lettura in ottone");
  await page.getByRole("textbox", { name: "Categorie" }).fill("Acquisti");
  await page.getByRole("textbox", { name: "Categorie" }).press("Enter");
  await page.getByRole("button", { name: "Salva", exact: true }).click();

  await expect(page).toHaveURL(/\/elemento\//);
  await expect(page.getByRole("heading", { name: "Idea regalo per Giulia" })).toBeVisible();
  await expect(page.getByText("Salvato", { exact: true })).toBeVisible();
  // Modifica ed Elimina (rosso) affiancati sotto il riepilogo; Indietro a
  // sinistra della stellina.
  const elimina = page.getByRole("button", { name: "Elimina" });
  await expect(elimina).toHaveCSS("background-color", "rgb(224, 42, 13)");
  const modifica = await page.getByRole("button", { name: "Modifica" }).boundingBox();
  const cestino = await elimina.boundingBox();
  expect(cestino.x).toBeGreaterThan(modifica.x + modifica.width - 1);
  expect(Math.abs(cestino.y - modifica.y)).toBeLessThan(4);
  const indietro = await page.getByRole("button", { name: "Indietro" }).boundingBox();
  const stella = await page.getByRole("button", { name: /preferiti/i }).first().boundingBox();
  expect(indietro.x + indietro.width).toBeLessThan(stella.x + 1);
  expect(Math.abs(indietro.y - stella.y)).toBeLessThan(4);
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
  // Annulla rimette l'elemento e riapre la sua scheda.
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page).toHaveURL(/\/elemento\//);
  await expect(page.getByRole("heading", { name: "Idea regalo per Giulia" })).toBeVisible();
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
  // Categorie e tag stanno in fondo, dentro "Dettagli".
  await page.getByText("Dettagli", { exact: true }).click();
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
  await apriAltri(page);
  await page.getByLabel(/^Titolo/).fill("Trattoria Da Enzo");
  await page.getByLabel("Testo").fill("ristorante a Roma, Trastevere");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/\/elemento\//);

  // Ricerca testuale (trova anche nel testo estratto)
  await page.goto("/archivio");
  await page.getByLabel("Cerca nell'archivio").fill("parmigiano");
  await expect(page.getByText("1 elemento")).toBeVisible();
  await expect(page.getByText("Pasta al limone in 10 minuti")).toBeVisible();
  // Un contenuto letto bene non mostra lo stato: il pallino c'è solo se qualcosa non va.
  const riga = page.locator("ul.righe li").first();
  await expect(riga.locator('[title="Analizzato"]')).toHaveCount(0);

  // In vista Lista niente pill delle categorie (la categoria è nei Filtri).
  await expect(page.getByRole("button", { name: /^Rianalizza/ })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Categorie" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ultimi 7 giorni" })).toHaveCount(0);

  // Filtro per tipo
  await page.getByLabel("Cerca nell'archivio").fill("");
  await opzione(page, /^Filtri/);
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
  await opzione(page, /^Filtri/);
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

test("carica un file di testo dal + della chat: testo estratto e cercabile", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Scegli foto, video o file").setInputFiles({ name: "appunti.md", mimeType: "text/markdown", buffer: Buffer.from("# Docker\nComando utile: docker compose up -d") });
  await page.getByRole("button", { name: /^Salva \d+ (foto|file)$/ }).click();
  await expect(page.getByText("Salvato nell'archivio")).toBeVisible();
  await page.goto("/archivio?q=compose");
  await expect(page.getByText("appunti.md")).toBeVisible();
});

test("file non ammesso dal +: errore chiaro, niente salvataggio", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Scegli foto, video o file").setInputFiles({ name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await page.getByRole("button", { name: /^Salva \d+ (foto|file)$/ }).click();
  await expect(page.getByText(/Tipo di file non supportato/).first()).toBeVisible();
});

test("Aggiungi ha solo Link e Nota (i file si aggiungono dal +)", async ({ page }) => {
  await page.goto("/aggiungi");
  await expect(page.getByRole("tab")).toHaveText(["Link", "Nota"]);
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
  await apriAltri(page);
  await page.getByLabel(/^Titolo/).fill("Idea regalo per Giulia");
  await page.getByLabel("Testo").fill("Lampada da lettura in ottone");
  await page.getByRole("textbox", { name: "Categorie" }).fill("Acquisti");
  await page.getByRole("textbox", { name: "Categorie" }).press("Enter");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/\/elemento\//);

  // Di partenza: box, uno per categoria, con il numero dei contenuti.
  await page.goto("/archivio");
  // Riordina a sinistra; a destra la pill Lista (la vista alternativa) e i Filtri, sulla stessa riga.
  await expect(page.getByRole("button", { name: "Box", exact: true })).toHaveCount(0);
  const lst = await page.getByRole("button", { name: "Lista", exact: true }).boundingBox();
  const rio = await page.getByRole("button", { name: "Riordina", exact: true }).boundingBox();
  const fil0 = await page.getByRole("button", { name: /^Filtri/ }).boundingBox();
  expect(rio.x + rio.width).toBeLessThan(lst.x);
  expect(lst.x + lst.width).toBeLessThan(fil0.x);
  expect(fil0.x - (lst.x + lst.width)).toBeLessThan(16);
  expect(fil0.x + fil0.width).toBeGreaterThan(page.viewportSize().width - 30);
  expect(Math.abs(lst.y - fil0.y)).toBeLessThan(4);
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

  // Vista Lista dal menu "…": la lista di sempre, e la scelta resta dopo il ricaricamento.
  await page.getByRole("button", { name: "Categorie", exact: true }).click();
  await opzione(page, "Mostra come lista");
  await expect(page.locator("ul.righe li").first()).toBeVisible();
  await page.reload();
  await expect(page.locator("ul.righe li").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Box", exact: true })).toBeVisible();

  // Di nuovo a box: tutte le scatole.
  await opzione(page, "Mostra come box");
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
  const righe = page.locator("li[data-scheda-locale]");
  await expect(righe).toHaveCount(2);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ristoranti");
  // Il titolo sta sulla riga dell'icona Impostazioni anche dentro un box.
  const t2 = await page.getByRole("heading", { level: 1 }).boundingBox();
  const g2 = await page.getByRole("button", { name: "Impostazioni" }).boundingBox();
  expect(g2.y).toBeLessThan(t2.y + t2.height);
  await expect(righe.first()).toContainText("Bar San Calisto");
  // Senza miniatura: icona e nome del tipo di locale (dall'AI o dal nome), divisi per quartiere (OpenStreetMap).
  await expect(righe.locator("img")).toHaveCount(0);
  await expect(righe.first().locator("[data-tipo-locale]")).toHaveText("Bar e caffè");
  await expect(righe.filter({ has: page.getByText("Da Enzo al 29", { exact: true }) }).locator("[data-tipo-locale]")).toHaveText("Trattoria");
  await expect(page.locator("section[data-gruppo-locali] h3").first()).toContainText("Trastevere");
  await expect(page.locator("section[data-gruppo-locali]")).toHaveCount(1);
  // Il pill "Ordina per" accanto ai Filtri: Nome, Tipo, Quartiere (predefinito), Città.
  const ordina = page.getByRole("button", { name: /^Ordina per/ });
  await expect(ordina).toHaveAccessibleName("Ordina per quartiere");
  const scegli = async (voce) => {
    await ordina.click();
    await expect(page.getByRole("menuitemradio")).toHaveText(["Nome", "Tipo", "Quartiere", "Città"]);
    await page.getByRole("menuitemradio", { name: voce }).click();
    await expect(page.getByRole("menu", { name: "Ordina per" })).toHaveCount(0);
  };
  // Per tipo: due gruppi, e sotto il nome il quartiere.
  await scegli("Tipo");
  await expect(page.locator("section[data-gruppo-locali] h3 > span:first-child")).toHaveText(["Bar e caffè", "Trattorie"]);
  await expect(righe.first().locator("[data-tipo-locale]")).toHaveText("Trastevere");
  // Per città: un gruppo Roma, sotto il nome tipo e quartiere.
  await scegli("Città");
  await expect(page.locator("section[data-gruppo-locali] h3 > span:first-child")).toHaveText(["Roma"]);
  await expect(righe.first().locator("[data-tipo-locale]")).toHaveText("Bar e caffè · Trastevere");
  // Per nome: un solo elenco A–Z, senza titoli di gruppo.
  await scegli("Nome");
  await expect(page.locator("section[data-gruppo-locali] h3")).toHaveCount(0);
  await expect(righe.locator("p").filter({ hasText: /^(Bar San Calisto|Da Enzo al 29)$/ })).toHaveText(["Bar San Calisto", "Da Enzo al 29"]);
  await expect(page.getByRole("button", { name: "Ordina per nome" })).toBeVisible();
  // La scelta resta: riaprendo i Ristoranti (anche senza ?gruppo=) torna per nome.
  await page.goto("/archivio?sezione=ristoranti");
  await expect(page.getByRole("button", { name: "Ordina per nome" })).toBeVisible();
  await expect(page.locator("section[data-gruppo-locali] h3")).toHaveCount(0);
  // Un tocco fuori chiude il menu senza cambiare scelta.
  await ordina.click();
  await page.mouse.click(4, 300);
  await expect(page.getByRole("menu", { name: "Ordina per" })).toHaveCount(0);
  await scegli("Quartiere");
  // Filtro per tipo di locale, nei Filtri della pagina.
  await page.getByRole("button", { name: /^Filtri/ }).click();
  await page.getByRole("button", { name: /^Tipo di locale/ }).click();
  const tipi = page.getByRole("listbox", { name: "Tipo di locale" });
  await expect(tipi.getByRole("option")).toHaveText([/^Tutti/, /^Bar e caffè/, /^Trattoria/]);
  await tipi.getByRole("option", { name: /^Trattoria/ }).click();
  await expect(righe).toHaveCount(1);
  await page.getByRole("button", { name: /^Tipo di locale/ }).click();
  await tipi.getByRole("option", { name: /^Tutti/ }).click();
  await expect(righe).toHaveCount(2);
  await page.getByRole("button", { name: /^Filtri/ }).click();
  // Un tocco sulla riga apre la scheda del locale; da lì il contenuto salvato, con il rosso del box Ristoranti.
  await righe.first().getByText("Bar San Calisto").first().click();
  const foglio = page.getByRole("dialog", { name: "Scheda di Bar San Calisto" });
  await expect(foglio).toBeVisible();
  await foglio.getByRole("button", { name: /^Apri scheda/ }).first().click();
  await expect(page).toHaveURL(/\/elemento\//);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 59, 28)");
  await page.goBack();
  await expect(righe).toHaveCount(2);
  const enzo = righe.filter({ has: page.getByText("Da Enzo al 29", { exact: true }) });
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
  await expect(page.locator("li[data-scheda-locale]").first().getByRole("link", { name: /Piazza di San Calisto 3, Roma/ })).toBeVisible();
  // Nella riga niente puntini né campi: gli indirizzi si modificano dalla scheda del locale.
  await expect(bar.getByRole("button", { name: /Indirizzi di/ })).toHaveCount(0);
  await expect(bar.getByRole("textbox")).toHaveCount(0);
  const apriScheda = async (riga) => {
    await riga.getByText("Bar San Calisto", { exact: true }).click();
    const f = page.getByRole("dialog", { name: "Scheda di Bar San Calisto" });
    await expect(f).toBeVisible();
    return f;
  };
  let f = await apriScheda(bar);
  await expect(f.getByRole("link", { name: /Piazza di San Calisto 3, Roma/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(f).toHaveCount(0);
  f = await apriScheda(bar);
  await f.getByRole("button", { name: "Modifica indirizzi" }).click();
  await expect(f.getByRole("textbox", { name: "Indirizzo 1 di Bar San Calisto" })).toHaveValue("Piazza di San Calisto 3, Roma");
  await f.getByRole("textbox", { name: "Indirizzo 1 di Bar San Calisto" }).fill("Via Prova 5, Roma");
  await f.getByRole("button", { name: "+ Aggiungi un'altra sede" }).click();
  await f.getByRole("textbox", { name: "Indirizzo 2 di Bar San Calisto" }).fill("Via Seconda 7, Milano");
  await f.getByRole("button", { name: "Salva" }).click();
  await expect(f).toHaveCount(0);
  // Per quartiere/città: una riga per sede, ognuna con una sola via, nel suo gruppo (qui la città).
  const sedeRoma = righe.filter({ has: page.getByRole("link", { name: /Via Prova 5, Roma/ }) });
  const sedeMilano = righe.filter({ has: page.getByRole("link", { name: /Via Seconda 7, Milano/ }) });
  await expect(sedeRoma.getByRole("link", { name: /Via Prova 5, Roma/ })).toHaveAttribute("href", /query=Bar%20San%20Calisto%2C%20Via%20Prova%205%2C%20Roma$/);
  await expect(sedeMilano.getByRole("link", { name: /Via Seconda 7, Milano/ })).toHaveAttribute("href", /query=Bar%20San%20Calisto%2C%20Via%20Seconda%207%2C%20Milano$/);
  await expect(righe.filter({ hasText: "Bar San Calisto" })).toHaveCount(2);
  await expect(sedeRoma.getByRole("link")).toHaveCount(1);
  await expect(page.locator("section[data-gruppo-locali]", { has: sedeMilano }).locator("h3")).toContainText("Milano");
  await page.reload();
  await expect(sedeRoma).toBeVisible();
  await expect(sedeMilano).toBeVisible();
  await expect(page.getByRole("link", { name: /Piazza di San Calisto/ })).toHaveCount(0);
  // Per tipo: una sola riga per il locale, con tutti e due gli indirizzi.
  await scegli("Tipo");
  await expect(righe.filter({ hasText: "Bar San Calisto" })).toHaveCount(1);
  await expect(righe.filter({ hasText: "Bar San Calisto" }).getByRole("link")).toHaveCount(2);
  await scegli("Quartiere");
  // La scheda di una sede mostra tutti gli indirizzi; togliendone uno resta l'altro.
  f = await apriScheda(sedeRoma);
  await expect(f.getByRole("link", { name: /Via Seconda 7, Milano/ })).toBeVisible();
  await f.getByRole("button", { name: "Modifica indirizzi" }).click();
  await f.getByRole("button", { name: "Togli l'indirizzo 2 di Bar San Calisto" }).click();
  await f.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("link", { name: /Via Seconda 7, Milano/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Via Prova 5, Roma/ })).toBeVisible();
  // Niente link al post nella riga: si apre dalla scheda. Sotto il tipo, la via con il link a Maps.
  await expect(enzo.getByRole("link", { name: /Apri su/ })).toHaveCount(0);
  // La via scritta a mano fa ricercare il quartiere (qui l'AI finta non lo sa):
  // il Bar passa sotto "Roma".
  await expect(page.locator("section[data-gruppo-locali]", { hasText: "Bar San Calisto" }).locator("h3")).toContainText("Roma");
  await expect(page.locator("section[data-gruppo-locali]")).toHaveCount(2);
  const tipo = await enzo.locator("[data-tipo-locale]").boundingBox();
  expect((await mappa.boundingBox()).y).toBeGreaterThan(tipo.y + tipo.height - 1);
  await expect(page.getByText("Museo di Trastevere")).toHaveCount(0);

  // Il contenuto salvato ha il link a Maps dei locali con la via (non quello generico di una località).
  await enzo.getByText("Da Enzo al 29", { exact: true }).click();
  await page.getByRole("dialog", { name: "Scheda di Da Enzo al 29" }).getByRole("button", { name: /^Apri scheda/ }).first().click();
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
  // Il riquadro della data è giallo.
  const tra10 = new Date();
  tra10.setDate(tra10.getDate() + 10);
  const dataBox = `${tra10.getDate()} ${["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"][tra10.getMonth()]}`;
  await expect(page.getByText(dataBox, { exact: true })).toBeVisible();
  await expect(page.getByText(dataBox, { exact: true }).locator("xpath=ancestor::div[1]")).toHaveCSS("background-color", "rgb(255, 214, 10)");
  // Il testo del biglietto non è attaccato allo zigzag e sta a metà altezza.
  const bigl = page.locator("[data-biglietto]").first();
  const bb = await bigl.boundingBox();
  const zz = await bigl.locator("div[aria-hidden=true]").boundingBox();
  const nome = await bigl.getByText("Serata carbonara da Enzo").boundingBox();
  expect(nome.x - (zz.x + zz.width)).toBeGreaterThanOrEqual(14);
  const testo = await bigl.locator("div.min-w-0").boundingBox();
  expect(Math.abs(testo.y + testo.height / 2 - (bb.y + bb.height / 2))).toBeLessThan(3);
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
  // Dopo l'aggiunta il pulsante diventa grigio e non si può più premere (anche dopo il ricaricamento).
  const biglCarbonara = page.getByText("Serata carbonara da Enzo").locator("xpath=ancestor::li[1]");
  await expect(biglCarbonara.getByRole("button", { name: "Aggiunto al calendario" })).toBeDisabled();
  await page.reload();
  await expect(page.getByText("Serata carbonara da Enzo").locator("xpath=ancestor::li[1]").getByRole("button", { name: "Aggiunto al calendario" })).toBeDisabled();
  // Swipe a sinistra sul biglietto: Elimina toglie l'evento, Annulla lo rimette.
  const nBigl = await page.locator("[data-biglietto]").count();
  const bg = await page.locator("[data-biglietto]").first().boundingBox();
  await page.mouse.move(bg.x + bg.width - 20, bg.y + bg.height / 2);
  await page.mouse.down();
  await page.mouse.move(bg.x + bg.width - 120, bg.y + bg.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.locator("[data-biglietto]").first().getByRole("button", { name: "Elimina", exact: true }).click();
  await expect(page.locator("[data-biglietto]")).toHaveCount(nBigl - 1);
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page.locator("[data-biglietto]")).toHaveCount(nBigl);

  // Passando a lista le due sezioni non ci sono: resta la lista di sempre.
  await page.getByRole("button", { name: "Categorie", exact: true }).click();
  await vista(page, "lista");
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
  await opzione(page, /^Filtri/);
  await page.getByRole("button", { name: /^Autore/ }).click();
  const scelta = page.getByRole("option", { name: /Investitore Efficace/ });
  await expect(scelta).toBeVisible();
  const w = page.viewportSize().width;
  const b = await scelta.boundingBox();
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(w);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Archivio a box: Ristoranti senza via, la scheda del locale offre Aggiungi indirizzo, poi Modifica indirizzi", async ({ page }) => {
  // OpenStreetMap non trova nulla: il Bar resta con la sola città.
  await page.route("**/api/geo", (route) => route.fulfill({ json: { found: null } }));
  await addLink(page, `${FIX}/trastevere`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/archivio?sezione=ristoranti");
  const bar = page.locator("li[data-scheda-locale]").filter({ has: page.getByText("Bar San Calisto", { exact: true }) });
  await expect(bar.getByRole("link", { name: /Cerca su Maps/ })).toBeVisible();
  // Il gruppo dei locali senza indirizzo, in fondo alla lista dopo i quartieri.
  const daControllare = page.locator("section[data-gruppo-locali]", { hasText: "Senza indirizzo" });
  await expect(daControllare).toContainText("Bar San Calisto");
  await expect(page.locator("section[data-gruppo-locali] h3").last()).toContainText("Senza indirizzo");
  const f = page.getByRole("dialog", { name: "Scheda di Bar San Calisto" });
  await bar.getByText("Bar San Calisto", { exact: true }).click();
  await expect(f.getByRole("button", { name: "Modifica indirizzi" })).toHaveCount(0);
  await expect(f.getByRole("button", { name: "Elimina", exact: true })).toBeVisible();
  await f.getByRole("button", { name: "Aggiungi indirizzo" }).click();
  await expect(f.getByRole("textbox", { name: "Indirizzo 1 di Bar San Calisto" })).toHaveValue("");
  await f.getByRole("textbox", { name: "Indirizzo 1 di Bar San Calisto" }).fill("Via Nuova 1, Roma");
  await f.getByRole("button", { name: "Salva" }).click();
  await expect(bar.getByRole("link", { name: /Via Nuova 1, Roma/ })).toBeVisible();
  await expect(bar.getByRole("link", { name: /Cerca su Maps/ })).toHaveCount(0);
  await expect(daControllare).toHaveCount(0);
  // Ora c'è una via: la scheda ha Modifica indirizzi, con la via nota.
  await bar.getByText("Bar San Calisto", { exact: true }).click();
  await f.getByRole("button", { name: "Modifica indirizzi" }).click();
  await expect(f.getByRole("textbox", { name: "Indirizzo 1 di Bar San Calisto" })).toHaveValue("Via Nuova 1, Roma");
  await f.getByRole("button", { name: "+ Aggiungi un'altra sede" }).click();
  await f.getByRole("textbox", { name: "Indirizzo 2 di Bar San Calisto" }).fill("Via Seconda 2, Milano");
  await f.getByRole("button", { name: "Salva" }).click();
  await expect(bar.getByRole("link", { name: /Via Seconda 2, Milano/ })).toBeVisible();
  await expect(bar.getByRole("link", { name: /Via Nuova 1, Roma/ })).toBeVisible();
  // Due sedi, due righe: Elimina dalla scheda di una sede toglie solo quella (con Annulla).
  await expect(bar).toHaveCount(2);
  const milano = bar.filter({ has: page.getByRole("link", { name: /Via Seconda 2, Milano/ }) });
  await milano.getByText("Bar San Calisto", { exact: true }).click();
  await f.getByRole("button", { name: "Elimina questa sede" }).click();
  await expect(page.getByText("Sede eliminata")).toBeVisible();
  await expect(bar).toHaveCount(1);
  await expect(bar.getByRole("link", { name: /Via Nuova 1, Roma/ })).toBeVisible();
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(bar).toHaveCount(2);
});

test("Archivio a box: Ristoranti, la via si prende incollando il link di Google Maps", async ({ page }) => {
  // OpenStreetMap non trova il Bar per nome; il link di Maps passa al server vero (con il finto OSM).
  await page.route("**/api/geo", async (route) => {
    const body = route.request().postDataJSON();
    if (!body.link) return route.fulfill({ json: { found: null } });
    if (body.link.includes("sbagliato")) return route.fulfill({ json: { found: null, error: "Non ho trovato la via in questo link." } });
    return route.continue();
  });
  await addLink(page, `${FIX}/trastevere`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/archivio?sezione=ristoranti");
  const daControllare = page.locator("section[data-gruppo-locali]", { hasText: "Senza indirizzo" });
  await expect(daControllare).toContainText("incolla il link del locale su Google Maps");
  const riga = page.locator("li[data-scheda-locale]").filter({ has: page.getByText("Bar San Calisto", { exact: true }) });
  await riga.getByText("Bar San Calisto", { exact: true }).click();
  const bar = page.getByRole("dialog", { name: "Scheda di Bar San Calisto" });
  await bar.getByRole("button", { name: "Aggiungi indirizzo" }).click();
  const campo = bar.getByRole("textbox", { name: "Indirizzo 1 di Bar San Calisto" });
  await expect(campo).toHaveAttribute("placeholder", /link di Maps/);
  // Un link da cui non si legge la via: resta nel campo, con un avviso.
  await campo.fill("https://maps.app.goo.gl/sbagliato");
  await bar.getByRole("button", { name: "Salva" }).click();
  await expect(bar.getByText(/Non sono riuscito a leggere la via da questo link/)).toBeVisible();
  await expect(campo).toHaveValue("https://maps.app.goo.gl/sbagliato");
  // "Incolla link di Maps" mette quello che hai copiato nel campo vuoto e legge subito la via.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("https://maps.app.goo.gl/sbagliato2"));
  // Con testo c'è la X; con il campo vuoto al suo posto c'è l'icona Incolla.
  await expect(bar.getByRole("button", { name: /Togli l'indirizzo 1/ })).toBeVisible();
  await expect(bar.getByRole("button", { name: /Incolla link di Maps/ })).toHaveCount(0);
  await campo.fill("");
  await expect(bar.getByRole("button", { name: /Togli l'indirizzo 1/ })).toHaveCount(0);
  await bar.getByRole("button", { name: /Incolla link di Maps/ }).click();
  await expect(campo).toHaveValue("https://maps.app.goo.gl/sbagliato2");
  await expect(bar.getByText(/Non sono riuscito a leggere la via da questo link/)).toBeVisible();
  // Il testo copiato da "Condividi" di Google Maps (nome e link, attaccati come in un
  // campo di una riga): la via viene dal link.
  await campo.fill("Bar San Calistohttps://www.google.com/maps/place/Bar+San+Calisto,+Piazza+di+San+Calisto,+3,+00153+Roma+RM/@41.8889,12.4699,17z/data=!3d41.8889!4d12.4699");
  await bar.getByRole("button", { name: "Salva" }).click();
  await expect(bar).toHaveCount(0);
  await expect(riga.getByRole("link", { name: /Piazza di San Calisto 3, Roma/ })).toBeVisible();
  await expect(daControllare).toHaveCount(0);
});

test("Archivio a box: Ristoranti, Elimina dalla scheda del locale e con lo swipe, con Annulla", async ({ page }) => {
  await page.route("**/api/geo", (route) => route.fulfill({ json: { found: null } }));
  await addLink(page, `${FIX}/trastevere`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/archivio?sezione=ristoranti");
  const righe = page.locator("li[data-scheda-locale]");
  await expect(righe).toHaveCount(2);
  // Aspetta la ricerca su OpenStreetMap (non trova nulla): il Bar passa in "Senza indirizzo".
  await expect(page.locator("section[data-gruppo-locali]", { hasText: "Senza indirizzo" })).toContainText("Bar San Calisto");
  const bar = righe.filter({ has: page.getByText("Bar San Calisto", { exact: true }) });
  // Scheda > Elimina: il locale sparisce, Annulla lo rimette.
  await bar.getByText("Bar San Calisto", { exact: true }).click();
  await page.getByRole("dialog", { name: "Scheda di Bar San Calisto" }).getByRole("button", { name: "Elimina", exact: true }).click();
  await expect(righe).toHaveCount(1);
  await expect(page.getByText("Ristorante eliminato")).toBeVisible();
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(righe).toHaveCount(2);
  // Swipe a sinistra: appare Elimina sulla riga.
  const prima = righe.first();
  const b = await prima.boundingBox();
  await page.mouse.move(b.x + b.width - 20, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 120, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await prima.getByRole("button", { name: "Elimina", exact: true }).click();
  await expect(righe).toHaveCount(1);
  // Resta eliminato dopo il ricaricamento (i contenuti restano nell'archivio).
  await page.reload();
  await expect(page.locator("li[data-scheda-locale]")).toHaveCount(1);
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

test("chat: il + è nella barra in basso come nelle altre schermate (non accanto al campo); un file si salva subito", async ({ page }) => {
  await page.goto("/");
  const piu = page.locator(".barra-piu").getByRole("button", { name: "Aggiungi foto, video o file" });
  await expect(piu).toBeVisible();
  await expect(page.locator(".chat-composer").getByRole("button", { name: "Aggiungi foto, video o file" })).toHaveCount(0);
  await piu.click();
  await expect(page.getByRole("menuitem")).toHaveText(["Foto, video o file", "Link o note"]);
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
  await page.getByRole("button", { name: /^Salva \d+ (foto|file)$/ }).click();
  await expect(page.getByText("Salvato nell'archivio")).toBeVisible();
  // Anche un video, dallo stesso pulsante.
  await piu.click();
  const [chooser2] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: "Foto, video o file" }).click()]);
  await chooser2.setFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("00000018667479706d703432", "hex") });
  await page.getByRole("button", { name: /^Salva \d+ (foto|file)$/ }).click();
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
  await page.getByRole("button", { name: /^Salva \d+ (foto|file)$/ }).click();
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
  await page.getByRole("button", { name: /^Salva \d+ (foto|file)$/ }).click();
  await expect(page.getByText("Salvato nell'archivio")).toBeVisible();
  await page.getByRole("link", { name: "Archivio", exact: true }).click();
  const size = async (name) => (await page.getByRole("button", { name: new RegExp(`^${name},`) }).boundingBox());
  const r = await size("Ristoranti");
  for (const n of ["Eventi", "Foto e video", "File e note"]) {
    const b = await size(n);
    expect(Math.abs(b.width - r.width)).toBeLessThan(2);
    expect(Math.abs(b.height - r.height)).toBeLessThan(2);
  }
  // Riordino: File passa prima di Foto e video.
  const x0 = (await size("File e note")).y * 1000 + (await size("File e note")).x;
  await opzione(page, "Riordina i box");
  await page.getByRole("button", { name: "Sposta File e note prima" }).click();
  await page.getByRole("button", { name: "Sposta File e note prima" }).click();
  await page.getByRole("button", { name: "Fine" }).click();
  const x1 = (await size("File e note")).y * 1000 + (await size("File e note")).x;
  expect(x1).toBeLessThan(x0);
  await page.reload();
  const x2 = (await size("File e note")).y * 1000 + (await size("File e note")).x;
  expect(x2).toBe(x1);
  // Il box File mostra il documento.
  await page.getByRole("button", { name: /^File e note,/ }).click();
  await expect(page.getByRole("heading", { name: "File e note", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /nota\.pdf/ })).toBeVisible();
});

test("lista: lo swipe su una riga scopre Elimina, con Annulla", async ({ page }) => {
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "Nota" }).click();
  await apriAltri(page);
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
  const domande = ["Cosa ho salvato sul limone?", "Raccontami la ricetta lunga con il limone"];
  for (const [i, q] of domande.entries()) {
    await box.fill(q);
    await box.press("Enter");
    // Si aspetta la risposta di questa domanda, non quella della precedente.
    await expect(page.getByText("Risposta dai tuoi contenuti")).toHaveCount(i + 1);
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

test("chat: la risposta compare mentre l'AI la scrive, poi arrivano le fonti", async ({ page }) => {
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/");
  const box = page.getByLabel("Chiedi alla tua memoria");
  await box.fill("Scrivi piano piano: cosa ho salvato sul limone?");
  await box.press("Enter");
  const risposta = page.locator("[data-risposta]").last();
  // Prima l'inizio della risposta, mentre l'AI scrive: ancora senza fonti.
  await expect(risposta.getByText(/Hai salvato/)).toBeVisible();
  await expect(risposta.getByText("Cerco nella tua memoria…")).toHaveCount(0);
  await expect(risposta.getByRole("status")).toHaveText("Sto scrivendo la risposta…");
  await expect(risposta.getByRole("button", { name: /^Fonti/ })).toHaveCount(0);
  // Poi la risposta completa, con la citazione e le fonti.
  await expect(risposta.getByRole("button", { name: /^Fonti/ })).toBeVisible();
  await expect(risposta.getByText(/scorza di limone, burro e parmigiano/)).toBeVisible();
  await expect(risposta.getByRole("button", { name: "Fonte 1" }).first()).toBeVisible();
  await expect(risposta.getByText("Sto scrivendo la risposta…")).toHaveCount(0);
});

test("Aggiungi: i pulsanti non sono attaccati al titolo", async ({ page }) => {
  await page.goto("/aggiungi");
  const h = await page.getByRole("heading", { name: "Aggiungi", level: 1 }).boundingBox();
  const t = await page.getByRole("tab", { name: "Link" }).boundingBox();
  expect(t.y - (h.y + h.height)).toBeGreaterThanOrEqual(20);
});

test("chat: salendo compare la freccetta per tornare in basso", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/");
  const box = page.getByLabel("Chiedi alla tua memoria");
  for (const q of ["Cosa ho salvato sul limone?", "Raccontami la ricetta lunga con il limone", "E il sale?"]) {
    await box.fill(q);
    await box.press("Enter");
    await expect(page.getByText("Risposta dai tuoi contenuti").last()).toBeVisible();
  }
  const freccia = page.getByRole("button", { name: "Vai all'ultimo messaggio" });
  // Si aspetta che i riposizionamenti automatici dopo l'invio siano finiti.
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(freccia).toBeVisible();
  // Sta al centro, sopra il campo.
  const fb = await freccia.boundingBox();
  expect(Math.abs(fb.x + fb.width / 2 - page.viewportSize().width / 2)).toBeLessThan(4);
  await freccia.dispatchEvent("click");
  await expect(freccia).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.scrollY - window.innerHeight)).toBeLessThan(60);
});

test("chat: l'icona copia in basso a destra copia domanda e risposta; il testo resta selezionabile", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/");
  const box = page.getByLabel("Chiedi alla tua memoria");
  await box.fill("Cosa ho salvato sul limone?");
  await box.press("Enter");
  await expect(page.getByText("Risposta dai tuoi contenuti").last()).toBeVisible();
  await page.waitForTimeout(800);
  // Sui tuoi messaggi non c'è l'icona; la risposta si copia senza grassetti né citazioni.
  await expect(page.getByRole("button", { name: "Copia domanda" })).toHaveCount(0);
  await page.getByRole("button", { name: "Copia risposta" }).click();
  const copiato = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiato.length).toBeGreaterThan(10);
  expect(copiato).not.toMatch(/\*\*|\[\d+\]/);
  // Nessuna pillola con la pressione lunga; una parola si seleziona.
  const domanda = page.locator("ol p", { hasText: "Cosa ho salvato sul limone?" });
  const b = await domanda.boundingBox();
  await page.mouse.dblclick(b.x + 40, b.y + b.height / 2);
  const sel = await page.evaluate(() => String(window.getSelection()).trim());
  expect(sel.length).toBeGreaterThan(0);
  expect(sel.length).toBeLessThan("Cosa ho salvato sul limone?".length);
  await expect(page.getByRole("button", { name: "Copia messaggio" })).toHaveCount(0);
});

test("chat: i link nella risposta sono sottolineati e cliccabili, anche senza https; il punto finale resta fuori", async ({ page }) => {
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/");
  await page.route("**/api/ai", async (route) => {
    if (route.request().postDataJSON()?.action !== "ask") return route.continue();
    return route.fulfill({
      json: { answer: "Trovi tutto su developer.apple.com/design. Oppure su https://example.com/guida, grazie.", sufficient: true, sources: [], quotes: {}, consulted: 1 },
    });
  });
  const box = page.getByLabel("Chiedi alla tua memoria");
  await box.fill("dove sono le linee guida?");
  await box.press("Enter");
  const apple = page.getByRole("link", { name: "developer.apple.com/design" });
  await expect(apple).toHaveAttribute("href", "https://developer.apple.com/design");
  await expect(apple).toHaveAttribute("target", "_blank");
  await expect(apple).toHaveCSS("text-decoration-line", "underline");
  await expect(page.getByRole("link", { name: "https://example.com/guida" })).toHaveAttribute("href", "https://example.com/guida");
});

test("Aggiungi: più link incollati insieme, ognuno salvato a parte e i doppioni saltati", async ({ page }) => {
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/aggiungi");
  await page.getByLabel("Link", { exact: true }).fill(`Ricetta ${FIX}/ricetta\n${FIX}/trastevere\n${FIX}/trastevere/`);
  await expect(page.getByText("2 link", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/\/archivio/);
  await expect(page.getByText("1 link salvato, 1 già presente")).toBeVisible();
  // Con un solo link, Invio salva come prima.
  await page.goto("/aggiungi");
  await page.getByLabel("Link", { exact: true }).fill(`${FIX}/ricetta?x=1`);
  await page.getByLabel("Link", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/elemento\//);
});

test("chat: incollando un file nel campo compare l'anteprima, e solo con Salva viene archiviato", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Chiedi alla tua memoria").evaluate((el) => {
    const dt = new window.DataTransfer();
    dt.items.add(new window.File(["# Pagina\nTesto incollato con la parola zafferano"], "incollato.md", { type: "text/markdown" }));
    el.dispatchEvent(new window.ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText("Aggiungi altre")).toBeVisible();
  await expect(page.getByText("Salvato nell'archivio")).toHaveCount(0);
  await page.getByRole("button", { name: /^Salva 1/ }).click();
  await expect(page.getByText("Salvato nell'archivio")).toBeVisible();
  await page.goto("/archivio?q=zafferano");
  await expect(page.getByText("incollato.md")).toBeVisible();
});


test("più foto insieme: anteprima, si toglie una, si salvano le altre e restano dopo la riapertura", async ({ page }) => {
  await page.goto("/");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.getByRole("button", { name: "Aggiungi foto, video o file" }).click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("menuitem", { name: "Foto, video o file" }).click()]);
  await chooser.setFiles([
    { name: "uno.png", mimeType: "image/png", buffer: png },
    { name: "due.png", mimeType: "image/png", buffer: Buffer.concat([png, Buffer.from(" ")]) },
    { name: "tre.png", mimeType: "image/png", buffer: Buffer.concat([png, Buffer.from("  ")]) },
  ]);
  const dialog = page.getByRole("dialog", { name: "Anteprima prima di salvare" });
  await expect(dialog.getByRole("heading", { name: "3 foto da salvare" })).toBeVisible();
  await expect(dialog.locator("img")).toHaveCount(3);
  await dialog.getByRole("button", { name: "Togli due.png" }).click();
  await expect(dialog.getByRole("heading", { name: "2 foto da salvare" })).toBeVisible();
  await dialog.getByRole("button", { name: "Salva 2 foto" }).click();
  await expect(page.getByText("2 salvati nell'archivio")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.goto("/archivio?sezione=foto");
  await expect(page.getByRole("link", { name: "uno.png" })).toBeVisible();
  await expect(page.getByRole("link", { name: "tre.png" })).toBeVisible();
  await expect(page.getByRole("link", { name: "due.png" })).toHaveCount(0);
});

test("foto: lo swipe passa alla foto successiva/precedente; eliminandone una si passa alla successiva e Annulla la riapre", async ({ page }) => {
  await page.goto("/");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Scegli foto, video o file").setInputFiles(
    ["uno", "due", "tre"].map((n, i) => ({ name: `${n}.png`, mimeType: "image/png", buffer: Buffer.concat([png, Buffer.from(" ".repeat(i))]) })),
  );
  await page.getByRole("dialog", { name: "Anteprima prima di salvare" }).getByRole("button", { name: "Salva 3 foto" }).click();
  await expect(page.getByText("3 salvati nell'archivio")).toBeVisible();
  await page.getByRole("link", { name: "Archivio", exact: true }).click();
  await vista(page, "box");
  await page.getByRole("button", { name: /^Foto e video, 3 file/ }).click();
  await expect(page.locator("ul.grid-cols-3 a")).toHaveCount(3);
  const nomi = await page.locator("ul.grid-cols-3 a").evaluateAll((as) => as.map((a) => a.getAttribute("aria-label")));
  expect(nomi).toHaveLength(3);
  await page.locator("ul.grid-cols-3 a").first().click();
  const titolo = page.getByRole("heading", { level: 1 });
  const nome = (i) => new RegExp(nomi[i].replace(".png", ""), "i");
  await expect(titolo).toHaveText(nome(0));
  // Tocchi uno dopo l'altro sulla scheda: [tipo, x], tipo start/move/end.
  const tocchi = (...passi) =>
    page.locator(".carosello").evaluate((el, passi) => {
      const art = el.querySelector("article");
      for (const [tipo, x] of passi) {
        const t = new window.Touch({ identifier: 1, target: art, clientX: x, clientY: 300 });
        art.dispatchEvent(new window.TouchEvent(`touch${tipo}`, { touches: tipo === "end" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
      }
    }, passi);
  const spostamento = () =>
    page.locator(".carosello").evaluate((el) => {
      const t = window.getComputedStyle(el).transform;
      return t && t !== "none" ? new window.DOMMatrixReadOnly(t).m41 : 0;
    });

  // Trascinando, la scheda segue il dito e la successiva entra di lato, già
  // pronta e allineata (stessa altezza, 40 px più in là).
  await tocchi(["start", 200], ["move", 190], ["move", 150], ["move", 100]);
  expect(await spostamento()).toBe(-100);
  const vicina = page.locator(".anteprima-scheda.dopo h1");
  await expect(vicina).toHaveText(nome(1));
  await expect(page.locator(".anteprima-scheda.dopo")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".anteprima-scheda.prima")).toHaveCount(0);
  const qui = await page.locator("article h1").boundingBox();
  const la = await vicina.boundingBox();
  expect(Math.abs(la.y - qui.y)).toBeLessThan(1);
  expect(Math.abs(la.x - qui.x - (page.viewportSize().width - 32 + 40))).toBeLessThan(1);
  // Lasciando dopo pochi pixel torna al suo posto e la vicina sparisce.
  await tocchi(["move", 195], ["end", 195]);
  await expect(page.locator(".anteprima-scheda")).toHaveCount(0);
  await expect.poll(spostamento).toBe(0);
  await expect(titolo).toHaveText(nome(0));
  // Prima foto: verso destra non c'è nulla, la scheda si allunga appena (elastico).
  await tocchi(["start", 100], ["move", 110], ["move", 200], ["move", 300]);
  const elastico = await spostamento();
  expect(elastico).toBeGreaterThan(20);
  expect(elastico).toBeLessThan(150);
  await tocchi(["end", 300]);
  await expect(page.locator(".anteprima-scheda")).toHaveCount(0);
  await expect(titolo).toHaveText(nome(0));
  // Un gesto lungo passa alla successiva.
  await tocchi(["start", 250], ["move", 240], ["move", 150], ["move", 60], ["end", 60]);
  await expect(titolo).toHaveText(nome(1));
  await expect(page.locator(".anteprima-scheda")).toHaveCount(0);
  await tocchi(["start", 60], ["move", 70], ["move", 160], ["move", 250], ["end", 250]);
  await expect(titolo).toHaveText(nome(0));

  const swipe = (dx) =>
    page.locator("article").evaluate((el, d) => {
      const mk = (x, type) => {
        const t = new window.Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
        el.dispatchEvent(new window.TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true }));
      };
      mk(200, "touchstart");
      mk(200 + d, "touchend");
    }, dx);
  await swipe(-150);
  await expect(titolo).toHaveText(nome(1));
  await swipe(150);
  await expect(titolo).toHaveText(nome(0));
  // Eliminando la seconda si passa alla terza, senza tornare all'archivio.
  await swipe(-150);
  await expect(titolo).toHaveText(nome(1));
  await page.getByRole("button", { name: "Elimina" }).click();
  await expect(page).toHaveURL(/\/elemento\//);
  await expect(titolo).toHaveText(nome(2));
  // Annulla riapre la foto eliminata (non la successiva), di nuovo al suo posto.
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(titolo).toHaveText(nome(1));
  await expect(page.getByText("2 / 3")).toBeVisible();
  await swipe(-150);
  await expect(titolo).toHaveText(nome(2));
  await swipe(150);
  await expect(titolo).toHaveText(nome(1));
  await swipe(150);
  await expect(titolo).toHaveText(nome(0));
});

test("anteprima: un file non ammesso resta per riprovare, l'altro è salvato", async ({ page }) => {
  await page.goto("/");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Scegli foto, video o file").setInputFiles([
    { name: "ok.png", mimeType: "image/png", buffer: png },
    { name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") },
  ]);
  const dialog = page.getByRole("dialog", { name: "Anteprima prima di salvare" });
  await dialog.getByRole("button", { name: "Salva 2 file" }).click();
  await expect(dialog.getByText(/Tipo di file non supportato/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Togli ok.png" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Togli virus.exe" })).toBeVisible();
  await dialog.getByRole("button", { name: "Chiudi" }).click();
  await page.goto("/archivio?q=ok.png");
  await expect(page.getByText("ok.png").first()).toBeVisible();
});

test("note: il pulsante copia mette negli appunti solo il testo della propria nota", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const testi = ["Prima nota breve", "Seconda nota\n\nCon più paragrafi, emoji 🍝 e caratteri speciali: <b>&\"'</b>\n\n\nFine."];
  for (const [i, t] of testi.entries()) {
    await page.goto("/aggiungi");
    await page.getByRole("tab", { name: "Nota" }).click();
    await apriAltri(page);
    await page.getByLabel(/^Titolo/).fill(`Titolo ${i}`);
    await page.getByLabel("Testo").fill(t);
    await page.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(page).toHaveURL(/\/elemento\//);
  }
  await page.goto("/archivio");
  await vista(page, "lista");
  const copie = page.getByRole("button", { name: "Copia nota" });
  await expect(copie).toHaveCount(2);
  const url0 = page.url();
  for (const [i, t] of testi.entries()) {
    const riga = page.locator("ul.righe > li").filter({ hasText: `Titolo ${i}` });
    await riga.getByRole("button", { name: "Copia nota" }).click();
    await expect(riga.getByText("Nota copiata")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(t);
  }
  // Il tocco sul pulsante non apre la scheda.
  expect(page.url()).toBe(url0);
});

test("note: se la copia non riesce lo dice e non dichiara di aver copiato", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("negato")) }, configurable: true });
    document.execCommand = () => false;
  });
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "Nota" }).click();
  await apriAltri(page);
  await page.getByLabel(/^Titolo/).fill("Nota rifiutata");
  await page.getByLabel("Testo").fill("contenuto");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/\/elemento\//);
  await page.getByRole("button", { name: "Copia nota" }).click();
  await expect(page.getByText("Copia non riuscita")).toBeVisible();
  await expect(page.getByText("Nota copiata")).toHaveCount(0);
});

test("notifiche: lo script delle notifiche è servito e in modalità locale l'interruttore non compare", async ({ page, request }) => {
  const res = await request.get("/push-sw.js");
  expect(res.ok()).toBeTruthy();
  expect(await res.text()).toContain("notificationclick");
  await page.goto("/impostazioni");
  await expect(page.getByRole("heading", { name: "Archivio", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Notifiche" })).toHaveCount(0);
});

test("condivisione di più file: lo script del service worker è servito", async ({ request }) => {
  const res = await request.get("/share-target-sw.js");
  expect(res.ok()).toBeTruthy();
  expect(await res.text()).toContain("/condividi");
});

test("box File e note: le note stanno con i file, niente pulsante Nuova nota; data a destra e copia in basso con i tag", async ({ page }) => {
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "Nota" }).click();
  await apriAltri(page);
  await page.getByLabel(/^Titolo/).fill("Idea per il weekend");
  await page.getByLabel("Testo").fill("Gita al lago");
  await page.getByRole("textbox", { name: "Categorie" }).fill("Tempo libero");
  await page.getByRole("textbox", { name: "Categorie" }).press("Enter");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/\/elemento\//);
  await page.goto("/archivio");
  await vista(page, "box");
  await page.getByRole("button", { name: /^File e note,/ }).click();
  await expect(page.getByRole("heading", { name: "File e note", level: 1 })).toBeVisible();
  const riga = page.locator("ul.righe > li").filter({ hasText: "Idea per il weekend" });
  await expect(riga).toBeVisible();
  // La data sta a destra della riga; la copia in basso a destra, accanto ai tag.
  const rb = await riga.boundingBox();
  const data = await riga.locator("time").boundingBox();
  expect(data.x + data.width).toBeGreaterThan(rb.x + rb.width - 12);
  const copia = await riga.getByRole("button", { name: "Copia nota" }).boundingBox();
  const tag = await riga.getByText("Tempo libero").boundingBox();
  expect(copia.x).toBeGreaterThan(tag.x + tag.width);
  expect(copia.x + copia.width).toBeGreaterThan(rb.x + rb.width - 12);
  expect(Math.abs(copia.y + copia.height / 2 - (tag.y + tag.height / 2))).toBeLessThan(14);
  // Nessun pulsante "+ Nuova nota" nel box.
  await expect(page.getByRole("button", { name: "+ Nuova nota" })).toHaveCount(0);
});


test("scheda nota: copia a destra sulla riga di Nota; 'Nota copiata ✓' resta 20 secondi mentre l'icona resta quella di copia", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "Nota" }).click();
  await apriAltri(page);
  await page.getByLabel(/^Titolo/).fill("Nota lunga");
  await page.getByLabel("Testo").fill("contenuto da copiare");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/\/elemento\//);
  const titolo = await page.getByText("La tua nota", { exact: true }).boundingBox();
  const btn = page.getByRole("button", { name: "Copia nota" });
  const b0 = await btn.boundingBox();
  expect(b0.x + b0.width).toBeGreaterThan(page.viewportSize().width - 30);
  expect(Math.abs(b0.y + b0.height / 2 - (titolo.y + titolo.height / 2))).toBeLessThan(14);
  await btn.click();
  const msg = page.getByRole("status").filter({ hasText: "Nota copiata" });
  await expect(msg).toBeVisible();
  // Messaggio e icona sulla stessa riga; l'icona resta quella di copia.
  const m = await msg.boundingBox();
  expect(Math.abs(m.y + m.height / 2 - (b0.y + b0.height / 2))).toBeLessThan(14);
  await page.waitForTimeout(15_000);
  await expect(msg).toBeVisible();
  await expect(page.getByRole("button", { name: "Copia nota" })).toBeVisible();
  await expect(msg).toHaveCount(0, { timeout: 8000 });
});

test("campo di ricerca: la X di cancellazione è nera e spessa", async ({ page }) => {
  await page.goto("/archivio");
  await page.locator("#arch-q").fill("prova");
  const regola = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      for (const r of sheet.cssRules) if (r.cssText.includes("search-cancel-button")) return r.cssText;
    }
    return "";
  });
  expect(regola).toContain("0a0a0a");
});

test("preferiti: stellina su scheda e riga, niente box Preferiti nell'Archivio; + nella barra in ogni schermata, barra al centro", async ({ page }) => {
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "Nota" }).click();
  await apriAltri(page);
  await page.getByLabel(/^Titolo/).fill("Idea preferita");
  await page.getByLabel("Testo").fill("Da ritrovare");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/\/elemento\//);
  // Nella scheda: il + è nella barra, a destra; la barra resta al centro.
  const piu = page.getByRole("button", { name: "Aggiungi foto, video o file" });
  await expect(piu).toBeVisible();
  const nav = await page.getByRole("navigation", { name: "Navigazione principale" }).boundingBox();
  const vw = page.viewportSize().width;
  expect(Math.abs(nav.x + nav.width / 2 - vw / 2)).toBeLessThan(3);
  expect((await piu.boundingBox()).x).toBeGreaterThan(nav.x + nav.width);
  await page.getByRole("button", { name: "Aggiungi ai preferiti" }).click();
  await expect(page.getByRole("button", { name: "Togli dai preferiti" })).toBeVisible();
  // Anche nella Chat il + è nella barra, nello stesso punto.
  await page.goto("/");
  await expect(page.locator(".barra-piu button")).toHaveCount(1);
  await page.goto("/archivio");
  await vista(page, "box");
  // Nessun box Preferiti nell'Archivio: si ritrovano con il filtro.
  await expect(page.getByRole("button", { name: /^Preferiti,/ })).toHaveCount(0);
  await opzione(page, /^Filtri/);
  await page.locator("#f-preferiti").click();
  await page.getByRole("option", { name: "Solo preferiti" }).click();
  await vista(page, "lista");
  await expect(page.getByText("Idea preferita")).toBeVisible();
});

test("Aggiungi veloce: Salva sotto il campo, non fisso; basta incollare il testo e salvare, senza titolo né categorie", async ({ page }) => {
  await page.goto("/aggiungi");
  const salva = page.getByRole("button", { name: "Salva", exact: true });
  expect(await salva.evaluate((el) => { for (let n = el; n; n = n.parentElement) if (window.getComputedStyle(n).position === "sticky" || window.getComputedStyle(n).position === "fixed") return true; return false; })).toBe(false);
  // Titolo, categorie e tag stanno in un riquadro chiuso.
  await expect(page.getByLabel(/^Titolo/)).toBeHidden();
  const campo = await page.getByLabel("Link", { exact: true }).boundingBox();
  expect((await salva.boundingBox()).y - campo.y).toBeLessThan(220);
  await page.getByRole("tab", { name: "Nota" }).click();
  await page.getByLabel("Testo").fill("Idea veloce da ritrovare");
  await salva.click();
  await expect(page).toHaveURL(/\/elemento\//);
  await expect(page.getByText("Idea veloce da ritrovare").first()).toBeVisible();
});

test("Archivio: Preferiti non è tra le categorie ma nei Filtri, con 'Ordina per' (predefinito: più recenti)", async ({ page }) => {
  await page.goto("/aggiungi");
  await page.getByRole("tab", { name: "Nota" }).click();
  await page.getByLabel("Testo").fill("Nota con stella");
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  await expect(page).toHaveURL(/\/elemento\//);
  await page.getByRole("button", { name: "Aggiungi ai preferiti" }).click();
  await expect(page.getByText("Aggiunto ai preferiti")).toBeVisible();
  await page.goto("/archivio");
  await expect(page.getByRole("list", { name: "Categorie" }).getByRole("button", { name: /^Preferiti/ })).toHaveCount(0);
  await opzione(page, /^Filtri/);
  await expect(page.locator("#f-ordina-per")).toContainText("Più recenti");
  await page.locator("#f-preferiti").click();
  await page.getByRole("option", { name: "Solo preferiti" }).click();
  await expect(page.getByText("Nota con stella").first()).toBeVisible();
});

test("chat: domande d'esempio fatte con l'archivio; aiuto pratico oltre i contenuti con il percorso su Maps", async ({ page }) => {
  await page.route("**/api/geo", (route) => route.fulfill({ json: { found: null } }));
  await addLink(page, `${FIX}/trastevere`);
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await page.goto("/");
  const esempi = page.getByRole("list", { name: "Domande d'esempio" });
  await expect(esempi.getByRole("button", { name: /^Come arrivo a / })).toBeVisible();
  await page.getByLabel("Chiedi alla tua memoria").fill("Come arrivo da Termini al ristorante?");
  await page.getByRole("button", { name: "Invia" }).click();
  const aiuto = page.locator("[data-aiuto]");
  await expect(aiuto).toContainText("Oltre ai tuoi contenuti");
  await expect(aiuto).toContainText("prendi il tram 8 verso Trastevere.");
  const percorso = aiuto.getByRole("link", { name: /Percorso da Termini/ });
  await expect(percorso).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&origin=Termini&destination=Da\+Enzo/);
  await expect(percorso).toHaveAttribute("target", "_blank");
  // Solo link costruiti dall'app: niente altri indirizzi proposti dall'AI.
  await expect(aiuto.getByRole("link")).toHaveCount(1);
});
