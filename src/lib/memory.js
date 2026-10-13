// Manutenzione della memoria, mentre l'app è aperta e l'AI è attiva:
//  - rielabora con l'AI gli elementi senza scheda di memoria (AI non riuscita
//    al salvataggio) o con la scheda della versione precedente;
//  - rilegge gli elementi rimasti "in elaborazione" (lavoro interrotto) e i
//    post social salvati prima della lettura completa (solo didascalia).
// Un elemento alla volta, con una pausa, per restare nei limiti gratuiti.

import { DIGEST_VERSION, hasContent } from "./enrich.js";

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

export function needsReread(item, now = Date.now()) {
  if (!item.url || item.file_path) return false;
  // Lavoro interrotto senza scrivere il risultato.
  if (item.status === "processing") return now - time(item.updated_at) > STALE_MS;
  // Post social letti prima della trascrizione: c'era solo la didascalia.
  if (item.extracted_text || !isSocialLink(item.url)) return false;
  return Boolean(item.processed_at) && time(item.processed_at) < time(FULL_READING_SINCE);
}

export function needsDigest(item, now = Date.now()) {
  if (item.status === "processing" || !hasContent(item) || needsReread(item, now)) return false;
  // Link non ancora letto: la rielaborazione arriva dopo la lettura.
  if (item.url && !item.file_path && !item.processed_at) return false;
  return !item.ai || !(Number(item.ai.v) >= DIGEST_VERSION);
}

const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms));

// Un giro di manutenzione. `tried`: elementi già tentati in questa sessione
// (nessun nuovo tentativo finché l'app non viene riaperta).
// Restituisce "done" (niente da fare), "stopped" (app chiusa o AI spenta) o
// "failed" (errori ripetuti: meglio aspettare prima di riprovare).
export async function runUpkeep({ getItems, digest, reread, isActive, tried, now = Date.now, sleep = sleepFor, gapMs = 6000, maxRereads = 5 }) {
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
        if (failures >= 3) return "failed";
        // Limite gratuito o servizio sovraccarico: pausa più lunga, poi si riprova.
        if (e?.status === 429 || e?.status === 503) {
          tried.delete(next.id);
          await sleep(60_000);
        }
      }
      await sleep(gapMs);
      continue;
    }
    const old = rereads < maxRereads && items.find((it) => !tried.has(it.id) && needsReread(it, now()));
    if (!old) return "done";
    tried.add(old.id);
    rereads += 1;
    // La rilettura comprende la rielaborazione dell'AI.
    await reread(old).catch(() => {});
    await sleep(gapMs);
  }
  return "stopped";
}
