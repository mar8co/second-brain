// Cerca la via dei locali che hanno solo la città (OpenStreetMap, tramite
// /api/geo) mentre è aperto il box Ristoranti: uno alla volta, una richiesta al
// secondo, e il risultato si salva nell'elemento (ogni locale si cerca una volta).
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { streetPatch, streetQueue } from "../lib/spots.js";

export function useStreets(archive, active) {
  const queue = useMemo(() => (active ? streetQueue(archive.items) : []), [archive.items, active]);
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
        for (const t of next.targets) {
          const fresh = latest.current.items.find((it) => it.id === t.id);
          const patch = fresh && streetPatch(fresh, t.index, t.name, found);
          if (patch) await latest.current.update(fresh.id, patch);
        }
      } catch {
        // Servizio non raggiungibile o troppe richieste: ci si ferma, resta "Cerca su Maps".
        if (mounted.current) setStopped(true);
      } finally {
        busy.current = false;
        setTimeout(() => mounted.current && setTick((t) => t + 1), 1100);
      }
    })();
  }, [queue, stopped, archive.loading, tick]);
}
