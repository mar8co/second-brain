// Ricerca testuale e filtri, interamente nel client.
//
// Perché nel client: un archivio personale ha centinaia o poche migliaia di
// elementi, già scaricati per la home. Cercare in memoria è istantaneo, funziona
// offline e allo stesso modo in modalità locale e con Supabase.

// Parole troppo comuni per contare nella ricerca (soprattutto per le domande
// in linguaggio naturale: "dove avevo salvato quel ristorante?").
const STOPWORDS = new Set(
  (
    "a ad al allo ai agli all alla alle anche avevo avere aveva che chi con come cosa cose " +
    "da dal dallo dai dagli dall dalla dalle del dello dei degli dell della delle di dove e ed " +
    "era ero gli ha hai ho i il in io la le lo li ma me mi mio mia miei mie ne nel nello nei negli " +
    "nell nella nelle no non o per piu più qual quale quali quando quanto quel quello quella " +
    "quelli quelle questo questa questi queste qui se sei si sia sono su sul sullo sui sugli " +
    "sull sulla sulle ti tra fra tu un uno una uno salvato salvata salvati salvate trovare " +
    "trova ricordi ricordo cerca cercavo c ci cè l un' po the of and to for is in on"
  ).split(/\s+/),
);

// minuscolo, senza accenti, solo lettere/numeri.
export function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Riduzione molto semplice per l'italiano: toglie la vocale finale delle parole
// lunghe, così "ristorante"/"ristoranti", "ricetta"/"ricette" coincidono.
export function stem(token) {
  if (token.length >= 5 && /[aeiou]$/.test(token)) return token.slice(0, -1);
  return token;
}

export function tokenize(s, { dropStopwords = false } = {}) {
  const out = normalize(s).split(" ").filter(Boolean);
  return dropStopwords ? out.filter((t) => !STOPWORDS.has(t) && t.length > 1) : out;
}

// Campi cercati e loro peso nel punteggio.
const FIELDS = [
  ["title", 6],
  ["tags", 5],
  ["categories", 5],
  ["author", 5],
  ["ai_keywords", 4],
  ["ai_entities", 4],
  ["description", 3],
  ["note", 3],
  ["place", 4],
  ["url", 2],
  ["ai_summary", 2],
  ["ai_points", 2],
  ["extracted_text", 1],
  ["file_name", 2],
];

// Il campo `ai` è JSON libero nel database: si usano solo liste di testi.
const asList = (v) => (Array.isArray(v) ? v : []);
const texts = (v) => asList(v).filter((x) => typeof x === "string");

function fieldText(item, field) {
  switch (field) {
    case "tags":
    case "categories":
      return (item[field] || []).join(" ");
    case "place":
      return item.place?.name || "";
    case "ai_summary":
      return item.ai?.summary || "";
    // Scheda di memoria dell'AI: parole chiave (anche sinonimi), persone e
    // organizzazioni, punti chiave.
    case "ai_keywords":
      return texts(item.ai?.keywords).join(" ");
    case "ai_entities":
      return texts(asList(item.ai?.entities).map((e) => e?.name)).join(" ");
    case "ai_points":
      return texts(item.ai?.points).join(" ");
    default:
      return item[field] || "";
  }
}

// Indice per elemento (token "stemmati" per campo), calcolato una volta sola e
// memorizzato per riferimento all'oggetto: gli elementi sono immutabili nello
// stato React, quindi un elemento modificato è un nuovo oggetto → nuovo indice.
const indexCache = new WeakMap();
function indexOf(item) {
  let idx = indexCache.get(item);
  if (!idx) {
    idx = FIELDS.map(([f, w]) => [new Set(tokenize(fieldText(item, f)).map(stem)), w]);
    indexCache.set(item, idx);
  }
  return idx;
}

function tokenScore(idx, qt) {
  let best = 0;
  for (const [tokens, w] of idx) {
    if (tokens.has(qt)) {
      best = Math.max(best, w * 2);
      continue;
    }
    // Prefisso: "ricet" trova "ricetta". Solo da 3 lettere per evitare rumore.
    if (qt.length >= 3) {
      for (const t of tokens) {
        if (t.startsWith(qt)) {
          best = Math.max(best, w);
          break;
        }
      }
    }
  }
  return best;
}

// Punteggio di un elemento per i token della query.
// mode "all": ogni token deve comparire (ricerca classica);
// mode "any": basta un token (per raccogliere i candidati di una domanda).
export function scoreItem(item, queryTokens, mode = "all") {
  if (!queryTokens.length) return 0;
  const idx = indexOf(item);
  let total = 0;
  let matched = 0;
  for (const qt of queryTokens) {
    const s = tokenScore(idx, qt);
    if (s > 0) matched += 1;
    else if (mode === "all") return 0;
    total += s;
  }
  return matched ? total * (matched / queryTokens.length) : 0;
}

// Valore del filtro Categoria per gli elementi che non ne hanno nessuna.
export const NO_CATEGORY = "Senza categoria";
// Come "Senza categoria": un valore speciale del filtro Categoria, per i preferiti.
export const PREFERITI = "Preferiti";

export function matchesFilters(item, f = {}) {
  if (f.type && item.type !== f.type) return false;
  if (f.category) {
    const cats = item.categories || [];
    if (f.category === PREFERITI) {
      if (!item.favorite) return false;
    } else if (f.category === NO_CATEGORY ? cats.length > 0 : !cats.includes(f.category)) return false;
  }
  if (f.tag && !(item.tags || []).includes(f.tag)) return false;
  if (f.status && item.status !== f.status) return false;
  if (f.author && item.author !== f.author) return false;
  if (f.site && item.site_name !== f.site) return false;
  const t = new Date(item.created_at).getTime();
  if (f.from && t < new Date(`${f.from}T00:00:00`).getTime()) return false;
  if (f.to && t > new Date(`${f.to}T23:59:59.999`).getTime()) return false;
  return true;
}

const byDateDesc = (a, b) => new Date(b.created_at) - new Date(a.created_at);

// Ricerca + filtri. Senza testo: elementi filtrati dal più recente.
export function searchItems(items, query, filters = {}) {
  const pool = items.filter((it) => matchesFilters(it, filters));
  const tokens = tokenize(query).map(stem);
  if (!tokens.length) return [...pool].sort(byDateDesc);
  return pool
    .map((it) => ({ it, s: scoreItem(it, tokens, "all") }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || byDateDesc(a.it, b.it))
    .map((r) => r.it);
}

// Candidati per una domanda in linguaggio naturale: tolte le parole vuote,
// basta che compaia una parola chiave; ordinati per pertinenza.
export function retrieveForQuestion(items, question, limit = 12) {
  const tokens = [...new Set(tokenize(question, { dropStopwords: true }).map(stem))];
  if (!tokens.length) return [];
  return items
    .map((it) => ({ it, s: scoreItem(it, tokens, "any") }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || byDateDesc(a.it, b.it))
    .slice(0, limit)
    .map((r) => r.it);
}

// Conteggi per categoria/tag (home e filtri).
export function countBy(items, field) {
  const m = new Map();
  for (const it of items) for (const v of it[field] || []) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"));
}

// Elementi raggruppati per categoria, per i box dell'Archivio: [[categoria,
// elementi]], dalla più piena; un elemento con più categorie sta in ognuna.
// "Senza categoria" in fondo.
export function groupByCategory(items) {
  const m = new Map();
  const none = [];
  for (const it of items) {
    const cats = it.categories || [];
    if (!cats.length) none.push(it);
    for (const c of cats) m.set(c, [...(m.get(c) || []), it]);
  }
  const out = [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "it"));
  return none.length ? [...out, [NO_CATEGORY, none]] : out;
}

// Conteggi di un campo a valore singolo (autore, sito), dal più frequente.
export function countValues(items, field) {
  const m = new Map();
  for (const it of items) if (it[field]) m.set(it[field], (m.get(it[field]) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"));
}
