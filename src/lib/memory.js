// Manutenzione della memoria, mentre l'app è aperta e l'AI è attiva:
//  - rielabora con l'AI gli elementi senza scheda di memoria (AI non riuscita
//    al salvataggio) o con la scheda della versione precedente;
//  - rilegge gli elementi rimasti "in elaborazione" (lavoro interrotto), i
//    post social salvati prima della lettura completa (solo didascalia),
//    quelli la cui lettura non è riuscita per un motivo momentaneo, quelli
//    letti prima che si salvasse chi li ha pubblicati e le immagini (o i PDF
//    senza testo) che l'AI non ha ancora letto.
// Un elemento alla volta, con una pausa, per restare nei limiti gratuiti.

import { DIGEST_VERSION, hasContent, unreadFile, withoutAiFailure } from "./enrich.js";

// Da questo momento i post social vengono trascritti e letti dal solo link.
export const FULL_READING_SINCE = "2026-10-13T11:00:00Z";
export const STALE_MS = 10 * 60_000;

const SOCIAL_HOST = /(^|\.)(instagram\.com|instagr\.am|tiktok\.com|facebook\.com|fb\.watch|youtube\.com|youtu\.be)$/i;

function isSocialLink(url) {
  try {
    return SOCIAL_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

const time = (v) => {
  const t = Date.parse(v || "");
  return Number.isFinite(t) ? t : 0;
};

// Lettura del post non riuscita per un motivo momentaneo (limite o
// sovraccarico dell'AI, Apify lento o occupato, lavoro interrotto): il post
// resta da rileggere. Non i crediti di Apify esauriti: tornano solo a fine mese.
const TEMPORARY = /Limite gratuito|sovraccaric|Errore temporaneo|Impossibile contattare|Apify non risponde|Troppi link letti insieme|Troppe richieste|troppo lentamente|tempo esaurito|Analisi non completata|Analisi non riuscita|Analisi non eseguita/i;

// Perché rileggere un elemento: "stale" (lavoro interrotto), "temporary"
// (lettura non riuscita per poco), "old" (solo didascalia, letto prima della
// trascrizione), "author" (manca chi l'ha pubblicato), "file" (immagine o PDF
// senza testo non ancora letto dall'AI); null se non serve.
export function rereadReason(item, now = Date.now()) {
  if (item.status === "processing") return (item.url || item.file_path) && now - time(item.updated_at) > STALE_MS ? "stale" : null;
  // Immagini e PDF senza testo salvati prima che l'AI li leggesse, o la cui
  // lettura non è riuscita.
  if (item.file_path) return unreadFile(item) ? "file" : null;
  if (!item.url) return null;
  if (!isSocialLink(item.url) || !item.processed_at) return null;
  if (!item.extracted_text) {
    // L'avviso di una rielaborazione dell'AI non riuscita non conta qui.
    if (TEMPORARY.test(withoutAiFailure(item.status_detail) || "")) return "temporary";
    if (time(item.processed_at) < time(FULL_READING_SINCE)) return "old";
  }
  // Letti prima che si salvassero autore e data: una nuova lettura li aggiunge.
  // Se l'ultima lettura non è riuscita per poco, valgono i tentativi normali.
  if (!item.author && item.status !== "inaccessible") return TEMPORARY.test(withoutAiFailure(item.status_detail) || "") ? "temporary" : "author";
  return null;
}

export const needsReread = (item, now = Date.now()) => Boolean(rereadReason(item, now));

// Ogni rilettura automatica usa una lettura di Apify (crediti gratuiti
// limitati): al massimo 3 per elemento, contate su questo dispositivo; una
// sola per aggiungere l'autore.
export const MAX_AUTO_REREADS = 3;
export const rereadLimit = (reason) => (reason === "author" ? 1 : reason === "file" ? 2 : MAX_AUTO_REREADS);

// `canReread(item)`: la rilettura può ancora avvenire (limiti non raggiunti).
export function needsDigest(item, now = Date.now(), canReread = () => true) {
  if (item.status === "processing" || !hasContent(item)) return false;
  // La rilettura comprende la rielaborazione: si aspetta lei, se ci sarà.
  if (needsReread(item, now) && canReread(item)) return false;
  // Link non ancora letto: la rielaborazione arriva dopo la lettura.
  if (item.url && !item.file_path && !item.processed_at) return false;
  return !item.ai || !(Number(item.ai.v) >= DIGEST_VERSION);
}

// Perché il tasto "Rianalizza" tocca un elemento (senza i limiti della
// manutenzione automatica): un motivo di rilettura, un link mai letto, una
// lettura non riuscita per poco, una scheda di memoria mancante; altrimenti
// null. "digest" = basta la rielaborazione dell'AI, senza rileggere il link.
// I link che richiedono accesso ("inaccessible") non si rileggono.
export function reanalysisReason(item, now = Date.now()) {
  if (item.status === "processing") return rereadReason(item, now);
  const reread = rereadReason(item, now);
  if (reread) return reread;
  if (item.file_path) return needsDigest(item, now, () => false) ? "digest" : null;
  if (item.url && item.status !== "inaccessible") {
    if (!item.processed_at) return "unread";
    if (!item.extracted_text && TEMPORARY.test(withoutAiFailure(item.status_detail) || "")) return "temporary";
  }
  return needsDigest(item, now, () => false) ? "digest" : null;
}

const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms));

const LOG_KEY = "second-brain-rereads";
const PAUSE_KEY = "second-brain-rereads-paused";

// Limite gratuito dell'AI raggiunto (si azzera una volta al giorno): senza AI
// una rilettura non trascrive nulla, quindi niente letture di Apify per ore.
export const AI_LIMIT_PAUSE_MS = 6 * 60 * 60_000;
export const AI_LIMIT = /Limite gratuito/i;

// Riletture fatte per elemento e pausa delle riletture, salvate nel browser.
export function rereadLog(storage = globalThis.localStorage) {
  let data = {};
  let pausedUntil = 0;
  try {
    const parsed = JSON.parse(storage?.getItem(LOG_KEY) || "{}");
    if (parsed && typeof parsed === "object") data = parsed;
    pausedUntil = Number(storage?.getItem(PAUSE_KEY)) || 0;
  } catch {
    /* archivio del browser non disponibile: si conta solo in questa sessione */
  }
  const save = (key, value) => {
    try {
      storage?.setItem(key, value);
    } catch {
      /* come sopra */
    }
  };
  return {
    count: (id) => Number(data[id]) || 0,
    add(id, n = 1) {
      data[id] = Math.max(0, (Number(data[id]) || 0) + n);
      save(LOG_KEY, JSON.stringify(data));
    },
    pausedUntil: () => pausedUntil,
    pause(until) {
      pausedUntil = until;
      save(PAUSE_KEY, String(until));
    },
  };
}

// Un giro di manutenzione. `tried`: elementi già tentati in questa sessione
// (nessun nuovo tentativo finché l'app non viene riaperta).
// Restituisce "done" (niente da fare), "stopped" (app chiusa o AI spenta) o
// "failed" (errori ripetuti: meglio aspettare prima di riprovare).
export async function runUpkeep({ getItems, digest, reread, isActive, tried, log = rereadLog(null), now = Date.now, sleep = sleepFor, gapMs = 6000, maxRereads = 20 }) {
  let failures = 0;
  let rereads = 0;
  const canReread = (it) => {
    const reason = rereadReason(it, now());
    return Boolean(reason) && !tried.has(it.id) && log.count(it.id) < rereadLimit(reason);
  };
  const pauseRereads = (ms) => log.pause(Math.max(log.pausedUntil(), now() + ms));
  while (isActive()) {
    const items = getItems();
    // Riletture sospese dopo il limite dell'AI, anche tra un'apertura e l'altra
    // (una pausa più lunga del massimo viene ignorata).
    const until = log.pausedUntil();
    const paused = until > now() && until - now() <= AI_LIMIT_PAUSE_MS;
    // Gli elementi da rileggere aspettano la rilettura anche oltre il numero
    // massimo di questo giro: arriverà al prossimo.
    const willReread = (it) => !paused && canReread(it);
    const rereadsOn = !paused && rereads < maxRereads;
    const next = items.find((it) => !tried.has(it.id) && needsDigest(it, now(), willReread));
    if (next) {
      tried.add(next.id);
      try {
        await digest(next);
        failures = 0;
      } catch (e) {
        // AI non configurata: inutile continuare.
        if (e?.code === "ai_disabled") return "failed";
        failures += 1;
        // Offline, limite gratuito o servizio sovraccarico: l'elemento resta da
        // rielaborare, anche dopo la pausa per errori ripetuti.
        const transient = e?.status === 0 || e?.status === 429 || e?.status === 503;
        if (transient) tried.delete(next.id);
        // Limite dell'AI: anche le riletture aspettano (userebbero Apify per niente).
        if (e?.status === 429) pauseRereads(60 * 60_000);
        if (failures >= 3) return "failed";
        if (transient) await sleep(60_000);
      }
      await sleep(gapMs);
      continue;
    }
    const old = rereadsOn && items.find(canReread);
    if (!old) return "done";
    tried.add(old.id);
    rereads += 1;
    // La rilettura comprende la rielaborazione dell'AI. Restituisce l'elemento
    // dopo la lettura, o null se non serviva più. Se il post resta da
    // rileggere (Apify o AI non disponibili) si smette di spendere letture.
    const after = await reread(old, () => log.add(old.id)).catch(() => old);
    if (after && needsReread(after, now())) {
      // Limite gratuito dell'AI: la lettura di Apify è andata sprecata. Il
      // tentativo non conta per l'elemento e le riletture si fermano per ore.
      if (after !== old && AI_LIMIT.test(withoutAiFailure(after.status_detail) || "")) {
        log.add(old.id, -1);
        pauseRereads(AI_LIMIT_PAUSE_MS);
        continue;
      }
      failures += 1;
      if (failures >= 2) return "failed";
    } else failures = 0;
    await sleep(gapMs);
  }
  return "stopped";
}
