// Archivio locale (IndexedDB): usato quando Supabase non è configurato.
// I dati restano solo in questo browser: niente sincronizzazione né backup
// automatico (vedi "Esporta archivio" nelle impostazioni).

import { newId, sanitizeItem } from "../item.js";

const DB_NAME = "second-brain";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    Promise.resolve(fn(t)).then((v) => (out = v), reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Transazione annullata"));
  });
}

const reqP = (r) => new Promise((res, rej) => ((r.onsuccess = () => res(r.result)), (r.onerror = () => rej(r.error))));

export function createLocalStore() {
  let dbp = null;
  const db = () => (dbp ||= openDb());
  const urls = new Map();

  return {
    mode: "local",

    async list() {
      const d = await db();
      return tx(d, ["items"], "readonly", (t) => reqP(t.objectStore("items").getAll()));
    },

    async create(item, file) {
      const d = await db();
      const now = new Date().toISOString();
      const row = {
        categories: [],
        tags: [],
        status: "saved",
        ...sanitizeItem(item),
        id: item.id || newId(),
        created_at: now,
        updated_at: now,
      };
      if (file) {
        row.file_path = `local/${row.id}`;
        row.file_name = file.name;
        row.file_mime = file.type;
        row.file_size = file.size;
      }
      await tx(d, ["items", "files"], "readwrite", (t) => {
        t.objectStore("items").put(row);
        if (file) t.objectStore("files").put({ id: row.id, blob: file });
      });
      return row;
    },

    async update(id, patch) {
      const d = await db();
      return tx(d, ["items"], "readwrite", async (t) => {
        const s = t.objectStore("items");
        const cur = await reqP(s.get(id));
        if (!cur) throw new Error("Elemento non trovato.");
        const next = { ...cur, ...sanitizeItem(patch), id, updated_at: new Date().toISOString() };
        s.put(next);
        return next;
      });
    },

    async remove(item) {
      const d = await db();
      await tx(d, ["items", "files"], "readwrite", (t) => {
        t.objectStore("items").delete(item.id);
        t.objectStore("files").delete(item.id);
      });
      if (urls.has(item.id)) URL.revokeObjectURL(urls.get(item.id));
      urls.delete(item.id);
    },

    async fileUrl(item) {
      if (!item.file_path) return null;
      if (urls.has(item.id)) return urls.get(item.id);
      const d = await db();
      const rec = await tx(d, ["files"], "readonly", (t) => reqP(t.objectStore("files").get(item.id)));
      if (!rec?.blob) return null;
      const u = URL.createObjectURL(rec.blob);
      urls.set(item.id, u);
      return u;
    },
  };
}
