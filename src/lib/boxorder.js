// Ordine dei box dell'Archivio, scelto da Marco e ricordato su questo telefono.
// `ids`: i box che ci sono ora, nell'ordine di partenza; `saved`: l'ordine scelto.
// Quelli scelti vengono per primi, i nuovi box restano in coda.
export function orderBoxes(ids, saved) {
  const have = new Set(ids);
  const first = (saved || []).filter((id, i, a) => have.has(id) && a.indexOf(id) === i);
  const rest = ids.filter((id) => !first.includes(id));
  return [...first, ...rest];
}

// Sposta un box di un posto (dir -1 = prima, 1 = dopo).
export function moveBox(order, id, dir) {
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const KEY = "sb-ordine-box";
export function readOrder() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function saveOrder(order) {
  try {
    localStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    // senza memoria del browser l'ordine vale solo per questa visita
  }
}
