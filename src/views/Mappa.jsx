// Mappa: i posti salvati (link delle mappe) e quelli citati nei contenuti
// (ristoranti, bar, musei… di un Reel), con "Vicino a me" e le indicazioni.
// La cartina è di OpenStreetMap (tessere ufficiali, gratuite e senza chiave).
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed, Settings } from "lucide-react";
import { Page, Testata } from "../components/Layout.jsx";
import { Thumb } from "../components/ItemCard.jsx";
import { EmptyState, Spinner } from "../components/ui.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { PAGE, itemColor } from "../lib/colors.js";
import { api } from "../lib/api.js";
import { displayTitle } from "../lib/item.js";
import { directionsUrl, distanceKm, formatDistance, geoPatch, geocodeQueue, mapPoints } from "../lib/places.js";

const ITALIA = { center: [42.5, 12.5], zoom: 5 };
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export default function Mappa({ archive, navigate, openItem }) {
  const { items, loading } = archive;
  usePageColor(PAGE.map);
  const searching = useGeocoding(archive);
  const points = useMemo(() => items.flatMap(mapPoints), [items]);
  const [selected, setSelected] = useState(null);
  const [me, setMe] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(null);
  const sorted = useMemo(() => {
    const list = points.map((p) => ({ ...p, km: me ? distanceKm(me, p) : null }));
    return me ? list.sort((a, b) => a.km - b.km) : list;
  }, [points, me]);
  const current = sorted.find((p) => p.key === selected) || null;

  const locate = () => {
    if (!navigator.geolocation) return setLocError("Il telefono non dà la posizione a questa app.");
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        setLocError(err.code === 1 ? "Posizione non consentita: puoi attivarla nelle impostazioni di Safari." : "Posizione non disponibile ora.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <Page>
      <Testata
        right={
          <button type="button" className="tondo" aria-label="Impostazioni" onClick={() => navigate("/impostazioni")}>
            <Settings className="h-[18px] w-[18px]" strokeWidth={2.6} aria-hidden="true" />
          </button>
        }
      />
      <h1 className="gigante">Mappa</h1>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <div className="relative">
            <Cartina points={points} selected={selected} onSelect={setSelected} me={me} />
            <button type="button" className="tondo nero absolute right-3 top-3 z-[500] h-11 w-11" aria-label="Vicino a me" onClick={locate} disabled={locating}>
              <LocateFixed className={`h-5 w-5${locating ? " pulsa" : ""}`} strokeWidth={2.6} aria-hidden="true" />
            </button>
          </div>
          {locError && <p className="errore mt-2 text-[0.9rem]">{locError}</p>}
          {searching > 0 && (
            <p className="micro mt-2 font-semibold" role="status">
              Cerco la posizione di <span className="num">{searching}</span> {searching === 1 ? "posto" : "posti"}…
            </p>
          )}

          {current && <Scelto point={current} onOpen={() => openItem(current.item)} onClose={() => setSelected(null)} />}

          {points.length === 0 ? (
            searching ? null : (
              <EmptyState title="Ancora nessun posto">
                Qui compaiono i link di Google Maps o Apple Maps che salvi e i posti citati nei tuoi contenuti, come i ristoranti di un Reel.
              </EmptyState>
            )
          ) : (
            <>
              <h2 className="sezione">
                <span className="num">{points.length === 1 ? "1 posto" : `${points.length} posti`}</span>
                {me && <span>dal più vicino</span>}
              </h2>
              <ul className="righe">
                {sorted.map((p) => (
                  <li key={p.key}>
                    <button type="button" className="flex w-full items-center gap-3 py-3 text-left active:opacity-70" aria-pressed={p.key === selected} onClick={() => setSelected(p.key)}>
                      <Thumb item={p.item} size="h-12 w-12" />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[1.1rem] font-extrabold leading-tight tracking-[-0.03em]">{p.name}</b>
                        <span className="micro block truncate">{p.address || displayTitle(p.item)}</span>
                      </span>
                      {p.km !== null && <span className="num shrink-0 text-[0.85rem] font-bold">{formatDistance(p.km)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {points.some((p) => p.approx) && (
                <p className="micro mt-3">Le posizioni dei posti citati nei contenuti sono cercate su OpenStreetMap a partire dal nome: possono essere approssimative.</p>
              )}
            </>
          )}
        </>
      )}
    </Page>
  );
}

// Il posto toccato: da quale contenuto viene, aprirlo, indicazioni.
function Scelto({ point, onOpen, onClose }) {
  return (
    <section className="card-bianca mt-3 p-4" aria-label={`Posto: ${point.name}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[1.35rem] font-extrabold leading-[1.05] tracking-[-0.04em]">{point.name}</p>
          {point.address && <p className="micro mt-1">{point.address}</p>}
          <p className="mt-1.5 line-clamp-2 text-[0.9rem] font-semibold leading-snug">Da: {displayTitle(point.item)}</p>
        </div>
        <button type="button" className="tondo h-8 w-8 text-base" aria-label="Chiudi" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="bottone chiaro" onClick={onOpen}>
          Apri
        </button>
        <a className="bottone" href={directionsUrl(point)} target="_blank" rel="noopener noreferrer">
          Indicazioni
        </a>
      </div>
    </section>
  );
}

// Cartina Leaflet: un pallino per posto, col colore del contenuto; il posto
// scelto è più grande e nero. Si inquadrano tutti i posti; "Vicino a me"
// centra sulla posizione.
function Cartina({ points, selected, onSelect, me }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const meLayer = useRef(null);
  const framed = useRef(false);

  useEffect(() => {
    const m = L.map(box.current, { zoomControl: false, attributionControl: true, center: ITALIA.center, zoom: ITALIA.zoom });
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    m.attributionControl.setPrefix(false);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layer.current.clearLayers();
    for (const p of points) {
      const on = p.key === selected;
      const icon = L.divIcon({
        className: "",
        html: `<span class="pin${on ? " scelto" : ""}" style="--c:${itemColor(p.item)}"></span>`,
        iconSize: on ? [30, 30] : [22, 22],
        iconAnchor: on ? [15, 15] : [11, 11],
      });
      const mk = L.marker([p.lat, p.lng], { icon, title: p.name, keyboard: true, zIndexOffset: on ? 1000 : 0 });
      mk.on("click", () => onSelect(p.key));
      mk.addTo(layer.current);
    }
    if (!framed.current && points.length) {
      framed.current = true;
      if (points.length === 1) m.setView([points[0].lat, points[0].lng], 15);
      else m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 15 });
    }
  }, [points, selected, onSelect]);

  useEffect(() => {
    const p = points.find((x) => x.key === selected);
    if (p && map.current) map.current.flyTo([p.lat, p.lng], Math.max(map.current.getZoom(), 14), { duration: 0.4 });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m || !me) return;
    meLayer.current?.remove();
    meLayer.current = L.marker([me.lat, me.lng], { icon: L.divIcon({ className: "", html: '<span class="pin-io"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }), title: "Tu sei qui", interactive: false }).addTo(m);
    m.flyTo([me.lat, me.lng], 14, { duration: 0.5 });
  }, [me]);

  return <div ref={box} className="cartina" role="region" aria-label="Mappa dei posti" />;
}

// Cerca la posizione dei posti nuovi, uno alla volta (OpenStreetMap chiede al
// massimo una richiesta al secondo) e la salva nell'elemento. Si ferma se il
// servizio non risponde. Restituisce quanti posti restano da cercare.
function useGeocoding(archive) {
  const queue = useMemo(() => geocodeQueue(archive.items), [archive.items]);
  const [stopped, setStopped] = useState(false);
  const [tick, setTick] = useState(0);
  const busy = useRef(false);
  const cache = useRef(new Map());
  // Posti saltati (la scheda dell'AI è cambiata nel frattempo): al giro dopo.
  const [skipped, setSkipped] = useState(() => new Set());
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
    if (stopped || busy.current || archive.loading) return;
    const next = queue.find((e) => !skipped.has(`${e.item.id}:${e.target}`));
    if (!next) return;
    busy.current = true;
    const key = `${next.item.id}:${next.target}`;
    (async () => {
      let asked = false;
      try {
        const q = `${next.place.name}|${next.place.address}`.toLowerCase();
        let found = cache.current.get(q);
        if (found === undefined) {
          asked = true;
          found = (await api.geo(next.place)).found || null;
          cache.current.set(q, found);
        }
        // Si parte dalla versione più recente dell'elemento; se nel frattempo
        // l'AI ha rifatto la scheda, quel posto si cerca al giro dopo.
        const fresh = latest.current.items.find((it) => it.id === next.item.id);
        const same = next.target === "posto" ? fresh?.place?.name === next.item.place?.name : fresh?.ai?.places?.[next.target]?.name === next.place.name;
        if (fresh && same) await latest.current.update(fresh.id, geoPatch(fresh, next.target, found));
        else if (mounted.current) setSkipped((prev) => new Set(prev).add(key));
      } catch {
        if (mounted.current) setStopped(true);
      } finally {
        busy.current = false;
        // Una richiesta al secondo al massimo.
        setTimeout(() => mounted.current && setTick((t) => t + 1), asked ? 1100 : 0);
      }
    })();
  }, [queue, stopped, skipped, archive.loading, tick]);

  return stopped ? 0 : queue.filter((e) => !skipped.has(`${e.item.id}:${e.target}`)).length;
}
