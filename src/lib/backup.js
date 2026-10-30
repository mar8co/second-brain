// Backup completo in un file .zip: i contenuti, la chat, le preferenze di
// questo telefono e i file caricati (foto, PDF). Lo zip è "senza compressione"
// (foto e PDF sono già compressi): basta un piccolo scrittore, senza librerie.
import { safeFileName } from "./store/remote.js";

// --- zip (metodo 0, "stored") ---

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Data e ora nel formato MS-DOS usato dagli zip.
function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

// files: [{ name, data: Uint8Array }] → Uint8Array dello zip.
export function zipBytes(files, now = new Date()) {
  const enc = new TextEncoder();
  const { time, date } = dosTime(now);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomi in UTF-8
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// --- contenuto del backup ---

// Preferenze di questo telefono da salvare (non le copie temporanee come gli
// indirizzi firmati dei file o i tentativi di rilettura).
const NON_PREFERENZE = /^(sb-url-|sb-miniature-tentativi|second-brain-rereads|sb-chat-v1$)/;
export function preferenze(storage = globalThis.localStorage) {
  const out = {};
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!/^(sb-|second-brain)/.test(k) || NON_PREFERENZE.test(k)) continue;
      const v = storage.getItem(k);
      try {
        out[k] = JSON.parse(v);
      } catch {
        out[k] = v;
      }
    }
  } catch {
    /* senza localStorage: niente preferenze */
  }
  return out;
}

// Nome del file dentro lo zip: files/<id>-<nome>.
export const nomeNelBackup = (item) => `files/${item.id}-${safeFileName(item.file_name || "file")}`;

// Crea il backup. `scarica(item)` restituisce i byte del file (Uint8Array) o
// lancia un errore; `avanzamento(fatti, totale)` per mostrare a che punto è.
export async function creaBackup({ items, chat, prefs, scarica, avanzamento = () => {}, now = new Date() }) {
  const conFile = items.filter((it) => it.file_path);
  const files = [];
  const mancanti = [];
  let fatti = 0;
  avanzamento(0, conFile.length);
  for (const it of conFile) {
    try {
      files.push({ name: nomeNelBackup(it), data: await scarica(it) });
    } catch (e) {
      mancanti.push({ id: it.id, file_name: it.file_name || null, errore: e?.message || "non scaricato" });
    }
    avanzamento(++fatti, conFile.length);
  }
  const dati = {
    exported_at: now.toISOString(),
    versione: 2,
    items,
    chat,
    preferenze: prefs,
    file: files.map((f) => f.name),
    file_mancanti: mancanti,
  };
  const json = new TextEncoder().encode(JSON.stringify(dati, null, 2));
  return { zip: zipBytes([{ name: "backup.json", data: json }, ...files], now), salvati: files.length, mancanti: mancanti.length };
}
