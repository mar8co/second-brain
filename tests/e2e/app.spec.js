import { expect, test } from "@playwright/test";

const FIX = "http://127.0.0.1:4599";

// Ogni test parte da un archivio locale vuoto (IndexedDB nuovo per contesto).

async function addLink(page, url, note) {
  await page.goto("/aggiungi");
  await page.getByLabel("Link", { exact: true }).fill(url);
  if (note) await page.getByLabel("Nota (facoltativa)").fill(note);
  await page.getByRole("button", { name: "Salva", exact: true }).click();
}

test("chat vuota; barra con solo Chat e Archivio; ingranaggio → Impostazioni; Aggiungi manualmente in Archivio", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Second Brain" })).toBeVisible();
  await expect(page.getByText("La chat è vuota")).toBeVisible();
  await expect(page.getByText("Modalità locale")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navigazione principale" });
  await expect(nav.getByRole("link")).toHaveText(["Chat", "Archivio"]);
  await page.getByRole("button", { name: "Impostazioni" }).click();
  await expect(page).toHaveURL(/\/impostazioni$/);
  await expect(page.getByRole("button", { name: "Aggiungi manualmente" })).toHaveCount(0);
  await page.goto("/archivio");
  await page.getByRole("button", { name: "Aggiungi manualmente" }).click();
  await expect(page).toHaveURL(/\/aggiungi$/);
});

test("link incollato nella chat: salvato e mostrato come messaggio", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Chiedi o cerca nei tuoi contenuti").fill(`${FIX}/ricetta`);
  await page.getByRole("button", { name: "Invia" }).click();
  await expect(page.getByText("Salvato nell'archivio")).toBeVisible();
  await expect(page.getByRole("link", { name: /Pasta al limone in 10 minuti/ })).toBeVisible();
  await expect(page.getByText("Oggi")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ricette 1" })).toBeVisible();
});

test("trascrizione incollata a mano su un link: salvata e mostrata come testo estratto", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Chiedi o cerca nei tuoi contenuti").fill(`${FIX}/ricetta`);
  await page.getByRole("button", { name: "Invia" }).click();
  await page.getByRole("link", { name: /Pasta al limone in 10 minuti/ }).click();
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
  await page.goto("/");
  await expect(page.getByText("Idea regalo per Giulia")).toBeVisible();
  await expect(page.getByRole("button", { name: "Acquisti 1" })).toBeVisible();

  await page.getByText("Idea regalo per Giulia").click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Elimina" }).click();
  await expect(page).toHaveURL(/\/archivio$/);
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
  await expect(page.locator("li.chip", { hasText: "Parmigiano" })).toBeVisible();
  await expect(page.locator("li.chip", { hasText: "Ricette" })).toBeVisible();
  await expect(page.locator("li.chip", { hasText: "#pasta" })).toBeVisible();
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
  await expect(page.locator("li.chip", { hasText: "Ricette" })).toBeVisible();
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

  // Domanda nella chat: risposta basata sulle fonti, che si possono aprire
  await page.goto("/");
  const box = page.getByLabel("Chiedi o cerca nei tuoi contenuti");
  await box.fill("come si fa la pasta al limone?");
  await box.press("Enter");
  await expect(page.getByText("come si fa la pasta al limone?")).toBeVisible();
  await expect(page.getByText("Risposta dai tuoi contenuti")).toBeVisible();
  await expect(page.getByText(/scorza di limone, burro/)).toBeVisible();
  await expect(page.getByText("Fonti", { exact: true })).toBeVisible();

  // Domanda con parole diverse da quelle del contenuto: risponde dalle schede di memoria
  await box.fill("mi serve un primo piatto veloce, cosa avevo salvato?");
  await box.press("Enter");
  await expect(page.getByText(/c'è un primo piatto veloce/)).toBeVisible();

  // Domanda senza riscontri nell'archivio
  await box.fill("orari della palestra?");
  await page.getByRole("button", { name: "Invia" }).click();
  await expect(page.getByText(/I tuoi contenuti non bastano per rispondere/)).toBeVisible();

  // La cronologia resta dopo il ricaricamento; il filtro per categoria nasconde le domande
  await page.reload();
  await expect(page.getByText("orari della palestra?")).toBeVisible();
  await page.getByRole("button", { name: "Tutto" }).waitFor();
  await page.locator("main a", { hasText: "Pasta al limone in 10 minuti" }).last().click();
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
