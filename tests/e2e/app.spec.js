import { expect, test } from "@playwright/test";

const FIX = "http://127.0.0.1:4599";

// Ogni test parte da un archivio locale vuoto (IndexedDB nuovo per contesto).

async function addLink(page, url, note) {
  await page.goto("/aggiungi");
  await page.getByLabel("Link", { exact: true }).fill(url);
  if (note) await page.getByLabel("Nota (facoltativa)").fill(note);
  await page.getByRole("button", { name: "Salva", exact: true }).click();
}

test("home vuota con invito a salvare", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Second Brain" })).toBeVisible();
  await expect(page.getByText("L'archivio è vuoto")).toBeVisible();
  await expect(page.getByText("Modalità locale")).toBeVisible();
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
  await page.goto("/");
  await expect(page.getByText("Idea regalo per Giulia")).toBeVisible();
  await expect(page.getByRole("link", { name: "Acquisti 1" })).toBeVisible();

  await page.getByText("Idea regalo per Giulia").click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Elimina" }).click();
  await expect(page).toHaveURL(/\/archivio$/);
  await expect(page.getByText("Ancora niente qui")).toBeVisible();
});

test("link leggibile: Analizzato, testo estratto e proposte AI accettabili", async ({ page }) => {
  await addLink(page, `${FIX}/ricetta`);
  await expect(page.getByRole("heading", { name: "Pasta al limone in 10 minuti" })).toBeVisible();
  await expect(page.getByText("Analizzato", { exact: true })).toBeVisible();
  await expect(page.getByText("Cucina di prova")).toBeVisible();
  await expect(page.getByRole("link", { name: "Apri l'originale" })).toHaveAttribute("href", `${FIX}/ricetta`);

  // Testo estratto con la sua fonte
  await page.getByText("Testo estratto").click();
  await expect(page.getByText(/fonte: testo della pagina/)).toBeVisible();

  // Proposte AI: etichettate, non applicate finché non le accetto
  await expect(page.getByText("Generato dall'AI · da verificare")).toBeVisible();
  await expect(page.getByText("Ricetta veloce di pasta al limone.")).toBeVisible();
  await expect(page.getByText("Nessuna", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accetta tutte" }).click();
  await expect(page.locator("li.chip", { hasText: "Ricette" })).toBeVisible();
  await expect(page.locator("li.chip", { hasText: "#pasta" })).toBeVisible();
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

  // Filtro per tipo
  await page.getByLabel("Cerca nell'archivio").fill("");
  await page.getByRole("button", { name: /Filtri/ }).click();
  await page.getByLabel("Tipo").selectOption("note");
  await expect(page.getByText("1 elemento")).toBeVisible();
  await expect(page.getByText("Trattoria Da Enzo")).toBeVisible();

  // Domanda con risposta basata sulle fonti
  await page.goto("/");
  await page.getByLabel("Cerca o fai una domanda").fill("come si fa la pasta al limone?");
  await page.getByRole("button", { name: "Chiedi", exact: true }).click();
  await expect(page).toHaveURL(/\/chiedi\?q=/);
  await expect(page.getByText("Risposta generata dall'AI dai tuoi elementi")).toBeVisible();
  await expect(page.getByText(/scorza di limone/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fonti usate" })).toBeVisible();
  await page.getByRole("link", { name: /Pasta al limone in 10 minuti/ }).click();
  await expect(page).toHaveURL(/\/elemento\//);

  // Domanda senza riscontri nell'archivio
  await page.goto("/chiedi");
  await page.getByLabel("La tua domanda").fill("orari della palestra?");
  await page.getByRole("button", { name: "Chiedi" }).click();
  await expect(page.getByText("Nell'archivio non trovo nulla su questo.")).toBeVisible();
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
