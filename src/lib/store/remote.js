// Archivio sincronizzato su Supabase (tabella `items` + bucket privato `files`).
// Le regole RLS (supabase/schema.sql) garantiscono che ogni utente veda solo
// le proprie righe e i propri file.

import { newId, sanitizeItem } from "../item.js";
import { storedPath } from "../thumbs.js";

const BUCKET = "files";

// Nome file sicuro per il percorso nello Storage.
export function safeFileName(name) {
  const base = String(name || "file")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-100);
  return base || "file";
}

export function createRemoteStore(supabase) {
  const signed = new Map(); // id → { url, exp }
  const signedPaths = new Map(); // percorso → { url, exp }

  async function uid() {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) throw new Error("Sessione scaduta: accedi di nuovo.");
    return data.user.id;
  }

  function check(error, msg) {
    if (error) throw new Error(`${msg}: ${error.message}`);
  }

  return {
    mode: "sync",

    async list() {
      // Paginazione a blocchi da 1000 (limite predefinito di PostgREST).
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("items")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + 999);
        check(error, "Impossibile caricare l'archivio");
        out.push(...data);
        if (data.length < 1000) break;
      }
      return out;
    },

    async create(item, file) {
      const id = item.id || newId();
      const row = { categories: [], tags: [], status: "saved", ...sanitizeItem(item), id };
      delete row.created_at;
      delete row.updated_at;
      let path = null;
      if (file) {
        path = `${await uid()}/${id}/${safeFileName(file.name)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        check(error, "Caricamento del file non riuscito");
        Object.assign(row, { file_path: path, file_name: file.name, file_mime: file.type, file_size: file.size });
      }
      const { data, error } = await supabase.from("items").insert(row).select().single();
      if (error && path) await supabase.storage.from(BUCKET).remove([path]);
      check(error, "Salvataggio non riuscito");
      return data;
    },

    async get(id) {
      const { data, error } = await supabase.from("items").select("*").eq("id", id).single();
      check(error, "Impossibile leggere l'elemento");
      return data;
    },

    async update(id, patch) {
      const clean = sanitizeItem(patch);
      delete clean.id;
      delete clean.created_at;
      delete clean.updated_at;
      const { data, error } = await supabase.from("items").update(clean).eq("id", id).select().single();
      check(error, "Modifica non riuscita");
      return data;
    },

    async remove(item) {
      const paths = [item.file_path, storedPath(item.image_url)].filter(Boolean);
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      const { error } = await supabase.from("items").delete().eq("id", item.id);
      check(error, "Eliminazione non riuscita");
      signed.delete(item.id);
    },

    // Indirizzo firmato di un file dell'archivio dato il percorso (miniature copiate).
    async signedUrl(path) {
      if (!path) return null;
      const c = signedPaths.get(path);
      if (c && c.exp > Date.now() + 60_000) return c.url;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (error) return null;
      signedPaths.set(path, { url: data.signedUrl, exp: Date.now() + 3600_000 });
      return data.signedUrl;
    },

    async fileUrl(item) {
      if (!item.file_path) return null;
      const c = signed.get(item.id);
      if (c && c.exp > Date.now() + 60_000) return c.url;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(item.file_path, 3600);
      if (error) return null;
      signed.set(item.id, { url: data.signedUrl, exp: Date.now() + 3600_000 });
      return data.signedUrl;
    },
  };
}
