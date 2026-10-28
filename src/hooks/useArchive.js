// Stato dell'archivio: elenco, operazioni e elaborazione in background.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyItem, processItem, recategorizeItem } from "../lib/process.js";
import { AI_LIMIT, needsReread, reanalysisReason, rereadLog, runUpkeep } from "../lib/memory.js";
import { hasContent, withoutAiFailure } from "../lib/enrich.js";
import { api } from "../lib/api.js";
import { storedUrl, thumbsToSave } from "../lib/thumbs.js";
import { EMBED_BATCH, embeddingText, needsEmbedding } from "../lib/embed.js";
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

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Scritture in fila per ogni elemento: una modifica calcolata dall'elemento
  // (updateWith) parte dalla versione più recente, anche da quella appena
  // scritta e non ancora mostrata, così non cancella una modifica dell'utente.
  const chains = useRef(new Map());
  const written = useRef(new Map());
  const enqueue = useCallback((id, job) => {
    const run = (chains.current.get(id) || Promise.resolve()).catch(() => {}).then(job);
    chains.current.set(id, run);
    return run;
  }, []);
  const write = useCallback(
    async (id, patch) => {
      const it = await store.update(id, patch);
      written.current.set(id, it);
      upsert(it);
      return it;
    },
    [store, upsert],
  );
  const update = useCallback((id, patch) => enqueue(id, () => write(id, patch)), [enqueue, write]);
  const updateWith = useCallback(
    (id, make) =>
      enqueue(id, async () => {
        const mine = written.current.get(id);
        const shown = itemsRef.current.find((x) => x.id === id);
        const base = mine && (!shown || String(mine.updated_at || "") >= String(shown.updated_at || "")) ? mine : shown;
        const patch = base ? make(base) : null;
        return patch ? write(id, patch) : null;
      }),
    [enqueue, write],
  );

  const remove = useCallback(
    async (item) => {
      await store.remove(item);
      setItems((list) => list.filter((x) => x.id !== item.id));
    },
    [store],
  );

  // Eliminazione con "Annulla": l'elemento sparisce subito e viene cancellato
  // davvero dopo qualche secondo (o subito se l'app va in background).
  // Restituisce la funzione che lo rimette com'era.
  const pendingRemovals = useRef(new Map());
  const [hidden, setHidden] = useState(() => new Set());
  const commitRemoval = useCallback(
    (id) => {
      const p = pendingRemovals.current.get(id);
      if (!p) return;
      clearTimeout(p.timer);
      pendingRemovals.current.delete(id);
      store
        .remove(p.item)
        .then(() => setItems((list) => list.filter((x) => x.id !== id)))
        .catch((e) => {
          console.warn("Eliminazione non riuscita", e);
          setError("Eliminazione non riuscita: l'elemento è ancora nell'archivio.");
        })
        .finally(() =>
          setHidden((h) => {
            const n = new Set(h);
            n.delete(id);
            return n;
          }),
        );
    },
    [store],
  );
  const removeSoon = useCallback(
    (item, delayMs = 5000) => {
      setHidden((h) => new Set(h).add(item.id));
      const timer = setTimeout(() => commitRemoval(item.id), delayMs);
      pendingRemovals.current.set(item.id, { item, timer });
      return () => {
        const p = pendingRemovals.current.get(item.id);
        if (!p) return false;
        clearTimeout(p.timer);
        pendingRemovals.current.delete(item.id);
        setHidden((h) => {
          const n = new Set(h);
          n.delete(item.id);
          return n;
        });
        return true;
      };
    },
    [commitRemoval],
  );
  useEffect(() => {
    const flush = () => {
      for (const id of [...pendingRemovals.current.keys()]) commitRemoval(id);
    };
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [commitRemoval]);

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

  // Tasto "Rianalizza": rilegge e rielabora in un colpo solo gli elementi non
  // analizzati pienamente o correttamente (vedi reanalysisReason). Uno alla
  // volta, con una pausa, e si ferma al limite gratuito dell'AI.
  const [reanalysis, setReanalysis] = useState(null);
  const reanalyzable = useMemo(
    () => (ai && store ? items.filter((it) => reanalysisReason(it) && !(it.file_path && store.mode !== "sync")) : []),
    [items, ai, store],
  );
  const reanalyzeAll = useCallback(async () => {
    const u = upkeep.current;
    if (!aiRef.current || u.reanalyzing) return null;
    const list = itemsRef.current.filter((it) => reanalysisReason(it) && !busy.current.has(it.id) && !(it.file_path && store.mode !== "sync"));
    if (!list.length) return { done: 0, total: 0, stopped: null };
    u.reanalyzing = true;
    // La manutenzione automatica li salta: ci pensa questo giro.
    for (const it of list) u.tried.add(it.id);
    let done = 0;
    let failed = 0;
    let stopped = null;
    setReanalysis({ done, total: list.length });
    try {
      for (const listed of list) {
        if (!aiRef.current) {
          stopped = "ai";
          break;
        }
        let item = itemsRef.current.find((x) => x.id === listed.id) || listed;
        if (store.get) {
          item = (await store.get(item.id).catch(() => null)) || null;
          if (!item) continue;
          upsert(item);
        }
        const reason = reanalysisReason(item);
        if (!reason || busy.current.has(item.id)) {
          done += 1;
          setReanalysis({ done, total: list.length });
          continue;
        }
        let after = null;
        try {
          if (reason === "digest") {
            busy.current.add(item.id);
            try {
              after = await classifyItem(item, { store, categories: catRef.current, apply: !item.ai, keepApplied: true });
              if (after) upsert(after);
            } finally {
              busy.current.delete(item.id);
            }
          } else {
            after = await runProcess(item, { apply: !item.ai });
          }
        } catch (e) {
          if (e?.status === 429) {
            stopped = "limit";
            break;
          }
          failed += 1;
        }
        if (after && AI_LIMIT.test(withoutAiFailure(after.status_detail) || "")) {
          stopped = "limit";
          break;
        }
        if (after && reason !== "digest" && needsReread(after)) failed += 1;
        done += 1;
        setReanalysis({ done, total: list.length });
        await new Promise((r) => setTimeout(r, 2500));
      }
    } finally {
      u.reanalyzing = false;
      setReanalysis(null);
    }
    return { done, total: list.length, failed, stopped };
  }, [store, upsert, runProcess]);

  // Ricerca per significato: un gruppo di elementi alla volta riceve il suo
  // vettore (Gemini Embedding, gratuito). Si ferma al limite gratuito (6 ore)
  // o a un errore (10 minuti) e riprende da solo.
  const embedBusy = useRef(false);
  const embedPause = useRef(0);
  const [embedRound, setEmbedRound] = useState(0);
  useEffect(() => {
    if (store?.mode !== "sync" || !store.setEmbedding || !ai || loading || embedBusy.current || Date.now() < embedPause.current) return;
    const list = items.filter(needsEmbedding).slice(0, EMBED_BATCH);
    if (!list.length) return;
    embedBusy.current = true;
    (async () => {
      const { vectors } = await api.embed(list.map(embeddingText));
      for (let i = 0; i < list.length; i++) {
        const cur = itemsRef.current.find((x) => x.id === list[i].id);
        if (!cur || !vectors[i]) continue;
        await store.setEmbedding(cur.id, vectors[i]);
        upsert(await store.update(cur.id, { ai: { ...(cur.ai || {}), emb_at: new Date().toISOString() } }));
      }
      return list.length === EMBED_BATCH;
    })()
      .then((more) => {
        if (more) setEmbedRound((n) => n + 1);
      })
      .catch((e) => {
        embedPause.current = Date.now() + (e?.status === 429 ? 6 * 60 * 60_000 : 10 * 60_000);
      })
      .finally(() => {
        embedBusy.current = false;
      });
  }, [store, ai, loading, items, upsert, embedRound]);

  // Copia durevole delle miniature dei link (le copertine dei social scadono):
  // una alla volta, in silenzio, solo con l'archivio sincronizzato. Al massimo
  // due tentativi per elemento su questo dispositivo.
  const thumbsBusy = useRef(false);
  const thumbsLive = useRef(true);
  const [thumbRound, setThumbRound] = useState(0);
  useEffect(() => {
    thumbsLive.current = true;
    return () => {
      thumbsLive.current = false;
    };
  }, [store]);
  useEffect(() => {
    if (store?.mode !== "sync" || loading || thumbsBusy.current) return;
    const KEY = "sb-miniature-tentativi";
    let tries = {};
    try {
      tries = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch {
      /* archivio del browser non disponibile: si conta solo in questa sessione */
    }
    const list = thumbsToSave(items, tries).slice(0, 12);
    if (!list.length) return;
    thumbsBusy.current = true;
    (async () => {
      for (const it of list) {
        if (!thumbsLive.current) break;
        tries[it.id] = (tries[it.id] || 0) + 1;
        try {
          localStorage.setItem(KEY, JSON.stringify(tries));
        } catch {
          /* come sopra */
        }
        try {
          const { path } = await api.thumb(it.id, it.image_url);
          const cur = itemsRef.current.find((x) => x.id === it.id);
          if (path && cur && cur.image_url === it.image_url) upsert(await store.update(it.id, { image_url: storedUrl(path) }));
        } catch (e) {
          if (e?.status === 401) break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    })().finally(() => {
      thumbsBusy.current = false;
      // Ne restano altre: nuovo giro.
      if (thumbsLive.current && list.length === 12) setThumbRound((n) => n + 1);
    });
  }, [store, loading, items, upsert, thumbRound]);

  // "Ricategorizza tutto": rifà la scheda dell'AI di ogni elemento con contenuto
  // e riassegna le categorie secondo le regole attuali (togliendo solo quelle
  // che l'AI aveva assegnato, non quelle scelte dall'utente). Uno alla volta,
  // con una pausa, e si ferma al limite gratuito dell'AI.
  const [recategorizing, setRecategorizing] = useState(null);
  const recategorizeAll = useCallback(async () => {
    const u = upkeep.current;
    if (!aiRef.current || u.reanalyzing || u.recategorizing) return null;
    const list = itemsRef.current.filter((it) => hasContent(it) && it.status !== "processing" && !busy.current.has(it.id) && !(it.file_path && store.mode !== "sync"));
    if (!list.length) return { done: 0, total: 0, failed: 0, stopped: null };
    u.recategorizing = true;
    let done = 0;
    let failed = 0;
    let stopped = null;
    setRecategorizing({ done, total: list.length });
    try {
      for (const listed of list) {
        if (!aiRef.current) {
          stopped = "ai";
          break;
        }
        const current = () => itemsRef.current.find((x) => x.id === listed.id) || null;
        const item = current();
        if (!item || busy.current.has(item.id)) {
          done += 1;
          continue;
        }
        busy.current.add(item.id);
        try {
          const out = await recategorizeItem(item, { store, categories: catRef.current, current });
          if (out) upsert(out);
        } catch (e) {
          if (e?.status === 429) {
            stopped = "limit";
            break;
          }
          failed += 1;
        } finally {
          busy.current.delete(item.id);
        }
        done += 1;
        setRecategorizing({ done, total: list.length });
        await new Promise((r) => setTimeout(r, 2500));
      }
    } finally {
      u.recategorizing = false;
      setRecategorizing(null);
    }
    return { done, total: list.length, failed, stopped };
  }, [store, upsert]);

  // Gli elementi in attesa di eliminazione non si vedono da nessuna parte.
  const visible = useMemo(() => (hidden.size ? items.filter((x) => !hidden.has(x.id)) : items), [items, hidden]);

  return { items: visible, loading, error, reload, add, update, updateWith, remove, removeSoon, reprocess, classify, categories, reanalysis, reanalyzable, reanalyzeAll, recategorizing, recategorizeAll };
}
