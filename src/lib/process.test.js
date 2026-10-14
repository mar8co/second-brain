import { describe, expect, it, vi } from "vitest";

const extract = vi.hoisted(() => vi.fn());
const classify = vi.hoisted(() => vi.fn(async () => ({ summary: "", categories: [], tags: [] })));
vi.mock("./api.js", () => ({ api: { extract, classify } }));
const { classifyItem, processItem, waitForServer } = await import("./process.js");
const { extractionPatch, withoutAiFailure } = await import("./enrich.js");

const item = { id: "0b8a3c5e-1f2d-4c3b-9a8e-7d6c5b4a3f21", url: "https://www.instagram.com/reel/C9abc/", categories: [], tags: [] };

function fakeStore(mode, rows) {
  let n = 0;
  return {
    mode,
    updates: [],
    async update(id, patch) {
      this.updates.push(patch);
      return { ...item, ...patch };
    },
    async get() {
      return rows[Math.min(n++, rows.length - 1)];
    },
  };
}

describe("lettura del link dall'app", () => {
  it("modalità sincronizzata: il server lavora in background, l'app aspetta il risultato", async () => {
    extract.mockResolvedValueOnce({ background: true });
    const store = fakeStore("sync", [{ ...item, status: "processing" }, { ...item, status: "analyzed", extracted_text: "Testo" }]);
    const seen = [];
    let t = 0;
    const wait = (id, o) => waitForServer(id, { ...o, sleep: async () => (t += 4000), now: () => t });
    const out = await processItem(item, { store, onUpdate: (x) => seen.push(x.status), ai: true, categories: ["Ricette"], wait });
    expect(extract).toHaveBeenLastCalledWith(item.url, { id: item.id, ai: true, categories: ["Ricette"] });
    expect(out).toMatchObject({ status: "analyzed", extracted_text: "Testo" });
    expect(seen).toEqual(["processing", "analyzed"]);
    // Il risultato lo scrive il server: l'app non sovrascrive nulla.
    expect(store.updates).toEqual([{ status: "processing", status_detail: null }]);
  });

  it("lo stato di prima della lettura arriva al server e alla lettura locale", async () => {
    extract.mockResolvedValueOnce({ background: true });
    const sync = fakeStore("sync", [{ ...item, status: "analyzed" }]);
    await processItem({ ...item, status: "analyzed" }, { store: sync, onUpdate: () => {}, ai: false, wait: async () => ({ ...item, status: "analyzed" }) });
    expect(extract).toHaveBeenLastCalledWith(item.url, expect.objectContaining({ prev_status: "analyzed" }));
    extract.mockResolvedValueOnce({ text: "Didascalia", status: "partial" });
    const local = fakeStore("local", []);
    let row = { ...item, status: "analyzed", extracted_text: "Trascrizione completa e più lunga" };
    local.update = async function (id, patch) {
      this.updates.push(patch);
      return (row = { ...row, ...patch });
    };
    await processItem(row, { store: local, onUpdate: () => {}, ai: false });
    expect(local.updates.at(-1)).toMatchObject({ status: "analyzed" });
    expect(local.updates.at(-1)).not.toHaveProperty("extracted_text");
  });

  it("immagine salvata dall'app: con l'AI la legge il server, senza AI o in locale no", async () => {
    const photo = { id: item.id, type: "image", file_path: "u/x/foto.jpg", file_mime: "image/jpeg", status: "saved", categories: [], tags: [] };
    extract.mockClear();
    extract.mockResolvedValueOnce({ background: true });
    const sync = fakeStore("sync", [{ ...photo, status: "analyzed", extracted_text: "Locandina" }]);
    const out = await processItem(photo, { store: sync, onUpdate: () => {}, ai: true, categories: ["Eventi"], wait: async () => ({ ...photo, status: "analyzed", extracted_text: "Locandina" }) });
    expect(extract).toHaveBeenLastCalledWith(null, { id: photo.id, ai: true, categories: ["Eventi"], prev_status: "saved", file: true });
    expect(sync.updates[0]).toEqual({ status: "processing", status_detail: "Lettura dell'immagine in corso…" });
    expect(out.extracted_text).toBe("Locandina");
    extract.mockClear();
    await processItem(photo, { store: fakeStore("sync", []), onUpdate: () => {}, ai: false });
    await processItem(photo, { store: fakeStore("local", []), onUpdate: () => {}, ai: true });
    await processItem({ ...photo, extracted_text: "già letta" }, { store: fakeStore("sync", []), onUpdate: () => {}, ai: true });
    expect(extract).not.toHaveBeenCalled();
  });

  it("attesa oltre il limite: stato finale scritto dall'app, la scheda propone Rianalizza", async () => {
    extract.mockResolvedValueOnce({ background: true });
    let t = 0;
    const store = fakeStore("sync", [{ ...item, status: "processing" }]);
    const wait = (id, o) => waitForServer(id, { ...o, sleep: async () => (t += 4000), now: () => t, maxMs: 20_000 });
    const seen = [];
    const out = await processItem(item, { store, onUpdate: (x) => seen.push(x.status), ai: false, wait });
    expect(out.status).toBe("saved");
    expect(out.status_detail).toMatch(/non completata/);
    expect(seen).toEqual(["processing", "saved"]);
  });

  it("nessuna risposta dal database durante l'attesa: si ricontrolla prima di scrivere", async () => {
    extract.mockResolvedValueOnce({ background: true });
    const store = fakeStore("sync", [{ ...item, status: "analyzed", extracted_text: "Testo" }]);
    const out = await processItem(item, { store, onUpdate: () => {}, ai: false, wait: async () => null });
    expect(out.status).toBe("analyzed");
    expect(store.updates).toHaveLength(1);
  });

  it("app sospesa, ultimo controllo fallito: il risultato scritto dal server non viene sovrascritto", async () => {
    extract.mockResolvedValueOnce({ background: true });
    let t = 0;
    let row = { ...item, status: "processing" };
    let polls = 0;
    const store = {
      mode: "sync",
      updates: [],
      async update(id, patch) {
        this.updates.push(patch);
        row = { ...row, ...patch };
        return row;
      },
      async get() {
        polls++;
        if (polls === 2) {
          // Intanto il server ha finito; al ritorno dall'app sospesa il primo controllo fallisce.
          row = { ...row, status: "analyzed", extracted_text: "Testo", ai: { summary: "server" } };
          t += 400_000;
          throw new TypeError("Load failed");
        }
        return row;
      },
    };
    const wait = (id, o) => waitForServer(id, { ...o, sleep: async () => (t += 4000), now: () => t });
    const out = await processItem(item, { store, onUpdate: () => {}, ai: true, wait });
    expect(out).toMatchObject({ status: "analyzed", ai: { summary: "server" } });
    expect(store.updates).toEqual([{ status: "processing", status_detail: null }]);
  });

  it("tempo scaduto e database irraggiungibile: nessuna scrittura", async () => {
    extract.mockResolvedValueOnce({ background: true });
    const store = fakeStore("sync", []);
    store.get = async () => {
      throw new TypeError("Load failed");
    };
    await processItem(item, { store, onUpdate: () => {}, ai: false, wait: async () => ({ ...item, status: "processing" }) });
    expect(store.updates).toHaveLength(1);
  });

  it("modalità locale: nessun id, il risultato lo salva l'app", async () => {
    extract.mockResolvedValueOnce({ status: "analyzed", title: "T", text: "Testo", textSource: "pagina" });
    const store = fakeStore("local", []);
    await processItem(item, { store, onUpdate: () => {}, ai: false });
    expect(extract).toHaveBeenLastCalledWith(item.url, {});
    expect(store.updates[1]).toMatchObject({ status: "analyzed", extracted_text: "Testo" });
  });
});

describe("scheda di memoria dell'AI", () => {
  const digest = { summary: "Workshop gratuito.", points: ["Mario Rossi organizza un workshop."], entities: [{ name: "Mario Rossi", kind: "persona" }], keywords: ["corso"], categories: ["Tecnologia"], tags: ["ia"], model: "m" };
  const store = { updates: [], async update(id, patch) { this.updates.push(patch); return { id, ...patch }; } };

  it("nuovo salvataggio: scheda completa, categorie e tag assegnati, avviso di AI fallita tolto", async () => {
    classify.mockResolvedValueOnce(digest);
    const it = { id: "w", categories: ["Lavoro"], tags: [], status_detail: "Letto in parte: video lungo. AI non disponibile: Impossibile contattare il servizio AI." };
    const out = await classifyItem(it, { store, categories: [], apply: true });
    expect(out.ai).toMatchObject({ v: 2, summary: "Workshop gratuito.", points: ["Mario Rossi organizza un workshop."], entities: [{ name: "Mario Rossi", kind: "persona" }], keywords: ["corso"], applied: true });
    expect(out.categories).toEqual(["Lavoro", "Tecnologia"]);
    expect(out.status_detail).toBe("Letto in parte: video lungo.");
  });

  it("aggiornamento di una scheda vecchia: categorie e tag non cambiano, resta il segno dell'AI", async () => {
    classify.mockResolvedValueOnce(digest);
    const it = { id: "w", categories: ["Lavoro"], tags: ["x"], ai: { summary: "vecchio", applied: true } };
    store.updates = [];
    const out = await classifyItem(it, { store, categories: [], keepApplied: true });
    expect(store.updates[0]).not.toHaveProperty("categories");
    expect(store.updates[0]).not.toHaveProperty("status_detail");
    expect(out.ai).toMatchObject({ v: 2, applied: true });
  });

  it("elemento eliminato durante la rielaborazione: nessuna scrittura", async () => {
    classify.mockResolvedValueOnce(digest);
    store.updates = [];
    expect(await classifyItem({ id: "w" }, { store, categories: [], current: () => null })).toBeNull();
    expect(store.updates).toEqual([]);
  });

  it("le categorie scelte dall'utente durante la rielaborazione restano", async () => {
    classify.mockResolvedValueOnce(digest);
    const out = await classifyItem({ id: "w", categories: [] }, { store, categories: [], apply: true, current: () => ({ id: "w", categories: ["Mie"], tags: [] }) });
    expect(out.categories).toEqual(["Mie", "Tecnologia"]);
  });

  it("toglie solo l'avviso dell'AI dal dettaglio", () => {
    expect(withoutAiFailure("AI non disponibile: limite raggiunto.")).toBeNull();
    expect(withoutAiFailure("Letto in parte. AI non disponibile: x")).toBe("Letto in parte.");
    expect(withoutAiFailure("Letto in parte.")).toBe("Letto in parte.");
    expect(withoutAiFailure(null)).toBeNull();
  });
});

describe("dati del post letti dalla fonte", () => {
  it("autore, data e luogo del post; il luogo non sostituisce titolo né posto scelti", () => {
    const r = { title: "Workshop IA", author: "Mario Rossi (@mario.ai)", publishedAt: "2026-09-10T08:00:00.000Z", place: { name: "Talent Garden", lat: null, lng: null }, status: "analyzed" };
    expect(extractionPatch({}, r)).toMatchObject({ title: "Workshop IA", author: "Mario Rossi (@mario.ai)", published_at: "2026-09-10T08:00:00.000Z", place: { name: "Talent Garden" } });
    expect(extractionPatch({ place: { name: "Mio posto" } }, r)).not.toHaveProperty("place");
    // Nuova lettura senza testo: resta quello letto prima, con immagine e sito.
    const kept = extractionPatch(
      { extracted_text: "Trascrizione di prima", text_source: "trascrizione dell'AI (video)", image_url: "https://cdn.test/c.jpg", site_name: "Instagram" },
      { text: null, status: "partial", detail: "Ho letto solo la didascalia, non il contenuto: trascrizione non riuscita (Apify non risponde)." },
    );
    expect(kept).not.toHaveProperty("extracted_text");
    expect(kept).not.toHaveProperty("text_source");
    expect(kept).toMatchObject({ status: "partial", image_url: "https://cdn.test/c.jpg", site_name: "Instagram" });
    expect(kept.status_detail).toMatch(/^Nuova lettura non completa, resta il testo letto in precedenza: Ho letto solo/);
    // Il testo tenuto mantiene il suo stato: una trascrizione completa resta "analizzata".
    expect(extractionPatch({ extracted_text: "Trascrizione di prima" }, { text: null, status: "inaccessible" }, { prevStatus: "analyzed" }).status).toBe("analyzed");
    expect(extractionPatch({ extracted_text: "Trascrizione di prima", status: "analyzed" }, { text: null, status: "inaccessible" }).status).toBe("analyzed");
    expect(extractionPatch({ extracted_text: "Trascrizione di prima" }, { text: null, status: "inaccessible" }, { prevStatus: "inaccessible" }).status).toBe("partial");
    // Nuova lettura incompleta e più corta (solo didascalia): resta la trascrizione.
    const longer = "Trascrizione completa del video sul workshop di intelligenza artificiale";
    const shorter = extractionPatch({ extracted_text: longer }, { text: "Didascalia", status: "partial", detail: "Ho letto solo la didascalia." }, { prevStatus: "analyzed" });
    expect(shorter).not.toHaveProperty("extracted_text");
    expect(shorter).toMatchObject({ status: "analyzed", status_detail: "Nuova lettura incompleta e più corta della precedente: resta il testo letto prima." });
    // Lettura completa, anche se più corta, o incompleta ma più lunga: sostituisce.
    expect(extractionPatch({ extracted_text: longer }, { text: "Testo nuovo", status: "analyzed" }).extracted_text).toBe("Testo nuovo");
    expect(extractionPatch({ extracted_text: "Breve" }, { text: "Testo nuovo più lungo", status: "partial" }).extracted_text).toBe("Testo nuovo più lungo");
    // Luogo di un post senza titolo: non diventa il titolo (una nuova lettura potrà darne uno).
    expect(extractionPatch({}, { place: { name: "Talent Garden", lat: null, lng: null }, status: "partial" })).not.toHaveProperty("title");
    // Link delle mappe: il nome del posto resta il titolo.
    expect(extractionPatch({}, { place: { name: "Trattoria", lat: 1, lng: 2 }, status: "analyzed" }).title).toBe("Trattoria");
  });
});

describe("riletture automatiche e cambiamenti durante l'AI", () => {
  it("rilettura con apply=false: il server non assegna categorie, l'app neppure", async () => {
    extract.mockResolvedValueOnce({ background: true });
    const store = fakeStore("sync", [{ ...item, status: "analyzed" }]);
    let t = 0;
    const wait = (id, o) => waitForServer(id, { ...o, sleep: async () => (t += 4000), now: () => t });
    await processItem(item, { store, onUpdate: () => {}, ai: true, categories: [], apply: false, wait });
    expect(extract).toHaveBeenLastCalledWith(item.url, { id: item.id, ai: true, categories: [], apply: false });

    extract.mockResolvedValueOnce({ title: "Pagina", status: "analyzed", text: "testo" });
    classify.mockResolvedValueOnce({ summary: "s", points: [], entities: [], keywords: [], categories: ["Nuova"], tags: ["nuovo"] });
    const local = fakeStore("local", []);
    await processItem({ ...item, categories: ["Mia"] }, { store: local, onUpdate: () => {}, ai: true, categories: [], apply: false });
    const last = local.updates.at(-1);
    expect(last).not.toHaveProperty("categories");
    expect(last.ai).toMatchObject({ categories: ["Nuova"] });
    expect(last.ai.applied).toBeUndefined();
  });

  it("elemento riletto o modificato durante la rielaborazione: il risultato vecchio non si scrive", async () => {
    const store = { updates: [], async update(id, patch) { this.updates.push(patch); return { id, ...patch }; } };
    for (const now of [{ id: "w", status: "processing" }, { id: "w", extracted_text: "nuovo testo" }, { id: "w", ai: { generated_at: "2026-10-14T10:00:00Z" } }]) {
      classify.mockResolvedValueOnce({ summary: "vecchio" });
      const out = await classifyItem({ id: "w" }, { store, categories: [], current: () => now });
      expect(out).toBe(now);
    }
    expect(store.updates).toEqual([]);
  });
});

describe("rilettura automatica in modalità locale", () => {
  it("categorie assegnate dall'AI: il segno resta, nessuna nuova categoria", async () => {
    extract.mockResolvedValueOnce({ title: "Pagina", status: "analyzed", text: "testo" });
    classify.mockResolvedValueOnce({ summary: "s", points: [], entities: [], keywords: [], categories: ["Nuova"], tags: ["nuovo"] });
    const local = fakeStore("local", []);
    const old = { ...item, categories: ["Mia"], ai: { summary: "vecchia", categories: ["Mia"], applied: true } };
    local.update = async function (id, patch) {
      this.updates.push(patch);
      return { ...old, ...patch };
    };
    await processItem(old, { store: local, onUpdate: () => {}, ai: true, categories: [], apply: false });
    const last = local.updates.at(-1);
    expect(last).not.toHaveProperty("categories");
    expect(last.ai).toMatchObject({ applied: true, categories: ["Nuova"] });
  });
});
