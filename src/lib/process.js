// Elaborazione di un elemento dopo il salvataggio: lettura del link (server)
// ed eventuali proposte dell'AI. Ogni passaggio aggiorna lo stato visibile.
//
// I dati letti dalla fonte riempiono i campi "verificati" (titolo,
// descrizione, testo estratto) senza sovrascrivere ciò che l'utente ha scritto;
// categorie e tag dell'AI vengono assegnati (con traccia in `ai.applied`).

import { api } from "./api.js";
import { aiFromDigest, aiPayload, extractionPatch, hasContent, withoutAiFailure } from "./enrich.js";

export { aiPayload, extractionPatch };

// Rielaborazione dell'AI: scheda di memoria (riassunto, punti chiave,
// persone, parole chiave) più categorie e tag.
// apply=true (dopo un nuovo salvataggio): categorie e tag dell'AI vengono
// assegnati subito, marcati come tali; altrimenti restano proposte.
// keepApplied=true (aggiornamento di una scheda vecchia): resta il segno
// "assegnati dall'AI" se c'era, senza toccare categorie e tag.
// current(): l'elemento com'è ora (può essere cambiato durante la chiamata
// all'AI); null se è stato eliminato, e allora non si scrive nulla.
export async function classifyItem(item, { store, categories, apply = false, keepApplied = false, current }) {
  const r = await api.classify(aiPayload(item), categories);
  if (current) {
    const sent = item;
    item = current();
    if (!item) return null;
    // Cambiato durante la chiamata (nuova lettura in corso, testo diverso,
    // scheda già rifatta): il risultato descrive il contenuto vecchio.
    const same = (k) => (item[k] ?? null) === (sent[k] ?? null);
    const changed = item.status === "processing" || !["title", "description", "note", "extracted_text", "author"].every(same) || (item.ai?.generated_at ?? null) !== (sent.ai?.generated_at ?? null);
    if (changed) return item;
  }
  const patch = {};
  // L'avviso di un tentativo precedente non riuscito non serve più.
  const detail = withoutAiFailure(item.status_detail);
  if (detail !== (item.status_detail ?? null)) patch.status_detail = detail;
  if (!apply) return store.update(item.id, { ...patch, ai: aiFromDigest(r, { applied: keepApplied && Boolean(item.ai?.applied) }) });
  return store.update(item.id, {
    ...patch,
    ai: aiFromDigest(r, { applied: true }),
    categories: [...(item.categories || []), ...r.categories.filter((c) => !(item.categories || []).includes(c))],
    tags: [...(item.tags || []), ...r.tags.filter((t) => !(item.tags || []).includes(t))],
  });
}

// Attende che il server finisca la lettura in background (stato diverso da
// "in elaborazione"). Se l'app va in background il controllo riprende al ritorno.
export async function waitForServer(id, { store, onUpdate, everyMs = 4000, maxMs = 330_000, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const until = now() + maxMs;
  let cur = null;
  while (now() < until) {
    await sleep(everyMs);
    try {
      cur = await store.get(id);
    } catch {
      continue;
    }
    if (cur && cur.status !== "processing") {
      onUpdate(cur);
      return cur;
    }
  }
  return cur;
}

// apply=false (riletture automatiche di elementi che hanno già una scheda):
// categorie e tag dell'AI restano proposte, quelli dell'utente non cambiano.
export async function processItem(item, { store, onUpdate, ai, categories = [], apply = true, wait = waitForServer }) {
  let cur = item;
  if (item.url && !item.file_path) {
    cur = await store.update(item.id, { status: "processing", status_detail: null });
    onUpdate(cur);
    let patch;
    try {
      // Modalità sincronizzata: per i post social il server lavora in
      // background, scrive lui il risultato (AI compresa) e qui si aspetta.
      const opts = store.mode === "sync" ? { id: item.id, ai: Boolean(ai), categories, ...(apply ? {} : { apply: false }) } : {};
      const r = await api.extract(item.url, opts);
      if (r?.background) {
        const done = await wait(item.id, { store, onUpdate });
        if (done && done.status !== "processing") return done;
        // Tempo scaduto: si ricontrolla (l'ultimo controllo può essere vecchio
        // o fallito). Se il database non risponde non si scrive nulla.
        const last = await store.get(item.id).catch(() => null);
        if (!last) return done || cur;
        if (last.status !== "processing") {
          onUpdate(last);
          return last;
        }
        // Il lavoro sul server si è interrotto senza scrivere (dura al massimo
        // 5 minuti): stato finale, così la scheda propone "Rianalizza".
        patch = { status: "saved", status_detail: "Analisi non completata: puoi riprovare dalla scheda.", processed_at: new Date().toISOString() };
      } else patch = extractionPatch(cur, r);
    } catch (e) {
      patch = {
        status: "saved",
        status_detail: `Analisi non eseguita: ${e.message} Puoi riprovare dalla scheda.`,
        processed_at: new Date().toISOString(),
      };
    }
    cur = await store.update(item.id, patch);
    onUpdate(cur);
  }
  if (ai && hasContent(cur)) {
    try {
      cur = await classifyItem(cur, { store, categories, apply, keepApplied: true });
      onUpdate(cur);
    } catch {
      /* le proposte AI sono facoltative: l'elemento resta valido senza */
    }
  }
  return cur;
}
