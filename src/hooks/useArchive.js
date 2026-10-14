// Stato dell'archivio: elenco, operazioni e elaborazione in background.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyItem, processItem } from "../lib/process.js";
import { needsReread, rereadLog, runUpkeep } from "../lib/memory.js";
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

  // Quando l'app torna in primo piano ricarico in silenzio: gli elementi
  // salvati da Comandi Rapidi (o da un altro dispositivo) compaiono da soli.
  useEffect(() => {
    if (store?.mode !== "sync") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      store
        .list()
        .then((list) => setItems(list.sort(byDate)))
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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

  // Elementi con un lavoro in corso in questa sessione: la manutenzione della
  // memoria li salta (niente doppie chiamate all'AI).
  const busy = useRef(new Set());

  // apply=false: le categorie e i tag dell'AI restano proposte.
  const runProcess = useCallback(
    (item, { apply = true } = {}) => {
      busy.current.add(item.id);
      return processItem(item, { store, onUpdate: upsert, ai: aiRef.current, categories: catRef.current, apply })
        .catch((e) => {
          // L'elemento è comunque salvato: mostriamo l'errore nello stato.
          console.warn("Elaborazione non riuscita", e);
        })
        .finally(() => busy.current.delete(item.id));
    },
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
    async (item, { apply = false } = {}) => {
      busy.current.add(item.id);
      try {
        const it = await classifyItem(item, { store, categories: catRef.current, apply });
        upsert(it);
        return it;
      } finally {
        busy.current.delete(item.id);
      }
    },
    [store, upsert],
  );

  // Manutenzione della memoria (src/lib/memory.js): rielabora con l'AI gli
  // elementi senza scheda e rilegge quelli rimasti a metà. Parte quando
  // l'archivio è caricato e a ogni cambiamento, se non è già in corso; dopo
  // errori ripetuti aspetta qualche minuto.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const upkeep = useRef({ running: false, tried: new Set(), pausedUntil: 0, store: null, log: rereadLog() });
  useEffect(() => {
    const u = upkeep.current;
    u.store = store;
    return () => {
      u.store = null;
    };
  }, [store]);
  useEffect(() => {
    const u = upkeep.current;
    if (!ai || loading || !store || u.running || Date.now() < u.pausedUntil) return;
    u.running = true;
    runUpkeep({
      getItems: () => itemsRef.current.filter((x) => !busy.current.has(x.id)),
      isActive: () => u.store === store && Boolean(aiRef.current) && document.visibilityState === "visible",
      tried: u.tried,
      log: u.log,
      digest: async (item) => {
        // Senza scheda: categorie e tag assegnati come per un nuovo salvataggio.
        const current = () => itemsRef.current.find((x) => x.id === item.id) || null;
        busy.current.add(item.id);
        try {
          const it = await classifyItem(item, { store, categories: catRef.current, apply: !item.ai, keepApplied: true, current });
          if (it) upsert(it);
        } finally {
          busy.current.delete(item.id);
        }
      },
      reread: async (item, markAttempt) => {
        // La copia in memoria può essere vecchia: un salvataggio da Comandi
        // Rapidi (o da un altro dispositivo) può essere già finito sul server.
        let fresh = item;
        if (store.get) {
          fresh = await store.get(item.id).catch(() => null);
          if (!fresh) return null;
          upsert(fresh);
        }
        if (!needsReread(fresh)) return null;
        // Immagini e PDF li legge solo il server (archivio sincronizzato).
        if (fresh.file_path && store.mode !== "sync") return null;
        markAttempt();
        // Categorie e tag dell'AI assegnati solo se l'elemento non ne ha mai avuti.
        const out = await runProcess(fresh, { apply: !fresh.ai });
        // Errore imprevisto: conta come rilettura non riuscita.
        return out ?? item;
      },
    })
      .then((how) => {
        if (how === "failed") u.pausedUntil = Date.now() + 5 * 60_000;
      })
      .catch((e) => console.warn("Manutenzione della memoria interrotta", e))
      .finally(() => {
        u.running = false;
      });
  }, [ai, loading, store, items, upsert, runProcess]);

  return { items, loading, error, reload, add, update, remove, reprocess, classify, categories };
}
