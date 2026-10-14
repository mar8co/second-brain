// Posti per la Mappa. Due fonti:
//  - il posto dell'elemento (link di Google o Apple Maps, con le coordinate
//    lette dal link; se c'è solo il nome, la posizione si cerca);
//  - i posti citati nel contenuto (ristoranti, bar, musei… di un Reel), che
//    l'AI ricava nella scheda di memoria (ai.places): la posizione si cerca
//    con OpenStreetMap dal nome e dall'indirizzo, quindi è approssimativa.
// La posizione trovata (o il fatto che non c'è) si salva nell'elemento: ogni
// posto si cerca una volta sola.

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const hasCoords = (p) => p && finite(p.lat) && finite(p.lng);
const text = (v) => (typeof v === "string" ? v.trim() : "");

export function mapPoints(item) {
  const out = [];
  const p = item.place;
  if (hasCoords(p)) {
    out.push({ key: `${item.id}:posto`, item, name: text(p.name) || text(item.title) || "Posto", address: text(p.label), lat: p.lat, lng: p.lng, approx: Boolean(p.geocoded) });
  }
  const places = Array.isArray(item.ai?.places) ? item.ai.places : [];
  places.forEach((pl, i) => {
    if (!pl || !hasCoords(pl.geo)) return;
    // Lo stesso posto del link delle mappe non si ripete.
    if (out.length && text(pl.name).toLowerCase() === out[0].name.toLowerCase()) return;
    out.push({ key: `${item.id}:${i}`, item, name: text(pl.name), address: text(pl.address), lat: pl.geo.lat, lng: pl.geo.lng, approx: true });
  });
  return out;
}

// Posti di cui cercare ancora la posizione: { item, target, place }, target =
// "posto" (il posto dell'elemento) o l'indice in ai.places.
export function geocodeQueue(items) {
  const queue = [];
  for (const item of items) {
    const p = item.place;
    if (p && text(p.name) && !hasCoords(p) && !p.geo_at) queue.push({ item, target: "posto", place: { name: text(p.name), address: "" } });
    const places = Array.isArray(item.ai?.places) ? item.ai.places : [];
    places.forEach((pl, i) => {
      if (pl && text(pl.name) && !("geo" in pl)) queue.push({ item, target: i, place: { name: text(pl.name), address: text(pl.address) } });
    });
  }
  return queue;
}

// Modifica da salvare nell'elemento con il risultato della ricerca (found =
// { lat, lng, label } oppure null se il posto non si trova).
export function geoPatch(item, target, found, now = new Date()) {
  const at = now.toISOString();
  if (target === "posto") {
    return { place: found ? { ...item.place, lat: found.lat, lng: found.lng, label: found.label || null, geocoded: true, geo_at: at } : { ...item.place, geo_at: at } };
  }
  const places = (item.ai?.places || []).map((pl, i) => (i === target ? { ...pl, geo: found ? { lat: found.lat, lng: found.lng, label: found.label || null } : null, geo_at: at } : pl));
  return { ai: { ...item.ai, places } };
}

// Distanza in km (formula dell'emisenoverso).
export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function formatDistance(km) {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

// Link per le indicazioni: Mappe di Apple su iPhone, altrimenti Google Maps.
export function directionsUrl(point, apple = /iPhone|iPad|Macintosh/.test(globalThis.navigator?.userAgent || "")) {
  const ll = `${point.lat},${point.lng}`;
  return apple
    ? `https://maps.apple.com/?${new URLSearchParams({ q: point.name, ll })}`
    : `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: `${point.name} ${ll}` })}`;
}
