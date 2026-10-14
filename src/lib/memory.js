// Manutenzione della memoria, mentre l'app è aperta e l'AI è attiva:
//  - rielabora con l'AI gli elementi senza scheda di memoria (AI non riuscita
//    al salvataggio) o con la scheda della versione precedente;
//  - rilegge gli elementi rimasti "in elaborazione" (lavoro interrotto), i
//    post social salvati prima della lettura completa (solo didascalia) e
//    quelli la cui lettura non è riuscita per un motivo momentaneo.
// Un elemento alla volta, con una pausa, per restare nei limiti gratuiti.

import { DIGEST_VERSION, hasContent, withoutAiFailure } from "./enrich.js";

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

export function needsReread(item, now = Date.now()) {
  if (!item.url || item.file_path) return false;
  // Lavoro interrotto senza scrivere il risultato.
  if (item.status === "processing") return now - time(item.updated_at) > STALE_MS;
  // Post social senza trascrizione né testo delle slide.
  if (item.extracted_text || !isSocialLink(item.url)) return false;
  // L'avviso di una rielaborazione dell'AI non riuscita non conta qui.
  if (TEMPORARY.test(withoutAiFailure(item.status_detail) || "")) return true;
  // Letti prima della trascrizione dal link: c'era solo la didascalia.
  return Boolean(item.processed_at) && time(item.processed_at) < time(FULL_READING_SINCE);
}

export function needsDigest(item, now = Date.now()) {
  if (item.status === "processing" || !hasContent(item) || needsReread(item, now)) return false;
  // Link non ancora letto: la rielaborazione arriva dopo la lettura.
  if (item.url && !item.file_path && !item.processed_at) return false;
  return !item.ai || !(Number(item.ai.v) >= DIGEST_VERSION);
}

const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms));

// Ogni rilettura automatica usa una lettura di Apify (crediti gratuiti
// limitati): al massimo 3 per elemento, contate su questo dispositivo.
export const MAX_AUTO_REREADS = 3;
const LOG_KEY = "second-brain-rereads";

export function rereadLog(storage = globalThis.localStorage) {
  let data = {};
  try {
    const parsed = JSON.parse(storage?.getItem(LOG_KEY) || "{}");
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {
    /* archivio del browser non disponibile: si conta solo in questa sessione */
  }
  return {
    count: (id) => Number(data[id]) || 0,
    add(id) {
      data[id] = (Number(data[id]) || 0) + 1;
      try {
        storage?.setItem(LOG_KEY, JSON.stringify(data));
      } catch {
        /* come sopra */
      }
    },
  };
}

// Un giro di manutenzione. `tried`: elementi già tentati in questa sessione
// (nessun nuovo tentativo finché l'app non viene riaperta).
// Restituisce "done" (niente da fare), "stopped" (app chiusa o AI spenta) o
// "failed" (errori ripetuti: meglio aspettare prima di riprovare).
export async function runUpkeep({ getItems, digest, reread, isActive, tried, log = rereadLog(null), now = Date.now, sleep = sleepFor, gapMs = 6000, maxRereads = 5 }) {
  let failures = 0;
  let rereads = 0;
  while (isActive()) {
    const items = getItems();
    const next = items.find((it) => !tried.has(it.id) && needsDigest(it, now()));
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
        if (failures >= 3) return "failed";
        if (transient) await sleep(60_000);
      }
      await sleep(gapMs);
      continue;
    }
    const old = rereads < maxRereads && items.find((it) => !tried.has(it.id) && log.count(it.id) < MAX_AUTO_REREADS && needsReread(it, now()));
    if (!old) return "done";
    tried.add(old.id);
    rereads += 1;
    // La rilettura comprende la rielaborazione dell'AI. Restituisce l'elemento
    // dopo la lettura, o null se non serviva più. Se il post resta da
    // rileggere (Apify o AI non disponibili) si smette di spendere letture.
    const after = await reread(old, () => log.add(old.id)).catch(() => old);
    if (after && needsReread(after, now())) {
      failures += 1;
      if (failures >= 2) return "failed";
    } else failures = 0;
    await sleep(gapMs);
  }
  return "stopped";
}
