// Cerca la via dei locali che hanno solo la città (OpenStreetMap, tramite
// /api/geo) mentre è aperto il box Ristoranti: uno alla volta, una richiesta al
// secondo, e il risultato si salva nell'elemento (ogni locale si cerca una volta).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { queryOf, sedePatch, streetPatch, streetQueue } from "../lib/spots.js";
import { normalize } from "../lib/search.js";

export function useStreets(archive, active) {
  // Locali già provati in questa visita: se l'AI non risponde non si riprova
  // a raffica (si riprova alla prossima apertura o con "Ricerca di nuovo").
  const [provati, setProvati] = useState(() => new Set());
  const queue = useMemo(
    () => (active ? streetQueue(archive.items).filter((q) => !provati.has(`${normalize(q.name)}|${q.sede || ""}`)) : []),
    [archive.items, active, provati],
  );
  const [stopped, setStopped] = useState(false);
  const [tick, setTick] = useState(0);
  const busy = useRef(false);
  const latest = useRef(archive);
  useEffect(() => {
    latest.current = archive;
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (stopped || busy.current || archive.loading || !queue.length) return;
    const next = queue[0];
    busy.current = true;
    (async () => {
      try {
        const found = (await api.geo({ name: next.name, address: next.address })).found || null;
        // Il risultato va a tutti i contenuti che citano quel locale, partendo
        // dalla versione più recente (se l'AI ha rifatto la scheda, si salta).
        // La modifica si calcola al momento di scrivere, dalla versione più
        // recente: se nel frattempo l'utente ha cambiato le sedi, valgono le sue.
        for (const t of next.targets) {
          await latest.current.updateWith(t.id, (fresh) =>
            t.sede ? sedePatch(fresh, t.index, t.name, t.sede, found) : queryOf(fresh, t.index) === next.address ? streetPatch(fresh, t.index, t.name, found) : null,
          );
        }
      } catch {
        // Servizio non raggiungibile o troppe richieste: ci si ferma, resta "Cerca su Maps".
        if (mounted.current) setStopped(true);
      } finally {
        busy.current = false;
        if (mounted.current) setProvati((cur) => new Set(cur).add(`${normalize(next.name)}|${next.sede || ""}`));
        setTimeout(() => mounted.current && setTick((t) => t + 1), 1100);
      }
    })();
  }, [queue, stopped, archive.loading, tick]);
  // Locali ancora da cercare (per mostrare "Cerco via e quartiere…").
  const cerca = useMemo(() => new Set(stopped ? [] : queue.map((q) => normalize(q.name))), [queue, stopped]);
  // "Ricerca di nuovo via e quartiere": il locale torna cercabile subito.
  const riprova = useCallback((name) => {
    const k = normalize(name);
    setStopped(false);
    setProvati((cur) => new Set([...cur].filter((x) => !x.startsWith(`${k}|`))));
  }, []);
  return { cerca, fermo: stopped, riprova };
}
