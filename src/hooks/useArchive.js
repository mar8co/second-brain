// Stato dell'archivio: elenco, operazioni e elaborazione in background.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyItem, processItem } from "../lib/process.js";
import { DEFAULT_CATEGORIES } from "../lib/constants.js";

const byDate = (a, b) => new Date(b.created_at) - new Date(a.created_at);

export function useArchive(store, { ai }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Valori letti dall'elaborazione in background: sempre gli ultimi.
  const aiRef = useRef(ai);
  useEffect(() => {
    aiRef.current = ai;
  }, [ai]);

  const reload = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      setItems((await store.list()).sort(byDate));
    } catch (e) {
      setError(e.message || "Impossibile caricare l'archivio.");
    } finally {
      setLoading(false);
    }
  }, [store]);

  // Primo caricamento.
  useEffect(() => {
    let alive = true;
    store
      .list()
      .then((list) => alive && setItems(list.sort(byDate)))
      .catch((e) => alive && setError(e.message || "Impossibile caricare l'archivio."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [store]);

  const upsert = useCallback((it) => {
    setItems((list) => {
      const i = list.findIndex((x) => x.id === it.id);
      if (i === -1) return [it, ...list].sort(byDate);
      const next = list.slice();
      next[i] = it;
      return next;
    });
  }, []);

  const categories = useMemo(() => {
    const s = new Set(DEFAULT_CATEGORIES);
    for (const it of items) for (const c of it.categories || []) s.add(c);
    return [...s];
  }, [items]);
  const catRef = useRef(categories);
  useEffect(() => {
    catRef.current = categories;
  }, [categories]);

  const runProcess = useCallback(
    (item) =>
      processItem(item, { store, onUpdate: upsert, ai: aiRef.current, categories: catRef.current }).catch((e) => {
        // L'elemento è comunque salvato: mostriamo l'errore nello stato.
        console.warn("Elaborazione non riuscita", e);
      }),
    [store, upsert],
  );

  const add = useCallback(
    async (item, file) => {
      const created = await store.create(item, file);
      upsert(created);
      runProcess(created); // in background: l'utente non aspetta
      return created;
    },
    [store, upsert, runProcess],
  );

  const update = useCallback(
    async (id, patch) => {
      const it = await store.update(id, patch);
      upsert(it);
      return it;
    },
    [store, upsert],
  );

  const remove = useCallback(
    async (item) => {
      await store.remove(item);
      setItems((list) => list.filter((x) => x.id !== item.id));
    },
    [store],
  );

  const reprocess = useCallback((item) => runProcess(item), [runProcess]);

  const classify = useCallback(
    async (item) => {
      const it = await classifyItem(item, { store, categories: catRef.current });
      upsert(it);
      return it;
    },
    [store, upsert],
  );

  return { items, loading, error, reload, add, update, remove, reprocess, classify, categories };
}
