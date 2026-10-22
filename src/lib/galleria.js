// Elenco ordinato degli elementi della galleria da cui si è aperta una scheda:
// serve per scorrere con lo swipe tra foto e video e per passare al successivo
// dopo un'eliminazione. Si tiene anche nel browser (sessione) per la riapertura.

const KEY = "sb-galleria";
let ids = null;
let box = null;
const BKEY = "sb-galleria-box";

function read() {
  if (ids) return ids;
  try {
    const parsed = JSON.parse(globalThis.sessionStorage?.getItem(KEY) || "[]");
    ids = Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    ids = [];
  }
  return ids;
}

function write(next) {
  ids = next;
  try {
    globalThis.sessionStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* archivio del browser non disponibile: l'elenco vale solo in questa sessione */
  }
}

export function setGalleria(list, colore = null) {
  box = colore;
  try {
    globalThis.sessionStorage?.setItem(BKEY, JSON.stringify(colore));
  } catch {
    /* solo in questa sessione */
  }
  write([...new Set(list)]);
}

// Colore del box da cui si è aperta la scheda: resta lo stesso mentre si scorre.
export function coloreGalleria(id) {
  if (!read().includes(id)) return null;
  if (!box) {
    try {
      box = JSON.parse(globalThis.sessionStorage?.getItem(BKEY) || "null");
    } catch {
      box = null;
    }
  }
  return box;
}

// Elemento precedente e successivo di `id` nell'elenco; null se non c'è o l'elenco non lo contiene.
export function vicini(id) {
  const list = read();
  const i = list.indexOf(id);
  if (i < 0) return { prev: null, next: null, pos: 0, tot: 0 };
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null, pos: i + 1, tot: list.length };
}

export const togliDallaGalleria = (id) => write(read().filter((x) => x !== id));
