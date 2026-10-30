// Domande sull'archivio sincronizzato, preparate qui: il telefono manda solo la
// domanda (e i turni precedenti), il server legge l'archivio dal database con
// il token dell'utente (le regole RLS limitano ai suoi contenuti), cerca per
// significato e per parole, e conta posti ed eventi su tutto l'archivio.
import { createClient } from "@supabase/supabase-js";
import { COLUMNS } from "../src/lib/item.js";
import { scegliPerDomanda } from "../src/lib/scelta.js";
import { eventsOf, restaurantsOf } from "../src/lib/spots.js";

// Archivio dell'utente: tutti gli elementi (senza i vettori) e ricerca per
// significato con la funzione SQL match_items.
export function archiveDb(env, authHeader) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const cols = COLUMNS.join(",");
  return {
    async list() {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("items").select(cols).order("created_at", { ascending: false }).range(from, from + 999);
        if (error) throw new Error(error.message);
        out.push(...data);
        if (data.length < 1000) break;
      }
      return out;
    },
    async match(vector, k = 20) {
      const { data, error } = await supabase.rpc("match_items", { q: vector, k });
      if (error) throw new Error(error.message);
      return (data || []).map((r) => r.id);
    },
  };
}

// Oggi in Italia (AAAA-MM-GG).
const oggi = (now) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(now);

const conta = (list) => {
  const m = new Map();
  for (const v of list) if (v) m.set(v, (m.get(v) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"));
};

// Numeri esatti calcolati su tutto l'archivio, per le domande "quanti",
// "quali", "che eventi ho": l'AI li riceve già contati invece di stimarli.
export function numeriArchivio(items, now = new Date()) {
  const righe = [`Elementi salvati: ${items.length}`];
  righe.push(`Per tipo: ${conta(items.map((i) => i.type)).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  const cat = conta(items.flatMap((i) => (Array.isArray(i.categories) && i.categories.length ? i.categories : ["Senza categoria"])));
  righe.push(`Per categoria: ${cat.map(([k, n]) => `${k} ${n}`).join(", ")}`);
  const locali = restaurantsOf(items, "nome");
  righe.push(`Ristoranti e locali (nome, città o indirizzo, quanti contenuti lo citano): ${locali.length}`);
  for (const r of locali.slice(0, 300)) righe.push(`- ${r.name}${r.citta || r.address ? ` — ${r.citta || r.address}` : ""} (${r.items.length})`);
  const { upcoming, undated, past } = eventsOf(items, oggi(now));
  const ev = (e) => `- ${e.name}${e.date ? ` — ${e.date}${e.end_date ? ` → ${e.end_date}` : ""}` : ""}${e.place ? ` — ${e.place}` : ""}`;
  righe.push(`Eventi in programma: ${upcoming.length}`, ...upcoming.slice(0, 100).map(ev));
  if (undated.length) righe.push(`Eventi senza data: ${undated.length}`, ...undated.slice(0, 50).map(ev));
  righe.push(`Eventi passati: ${past.length}`, ...past.slice(0, 50).map(ev));
  return righe.join("\n");
}

// Elementi e turni per la domanda. `near`: ricerca per significato (id dal più
// vicino), può mancare. → { details, memory, total, numeri }
export function preparaDomanda(items, question, { history = [], near = [], now = new Date() } = {}) {
  const turni = (Array.isArray(history) ? history : [])
    .filter((t) => t && typeof t.q === "string")
    .slice(-4)
    .map((t) => ({ q: t.q, a: typeof t.a === "string" ? t.a : "", sources: Array.isArray(t.sources) ? t.sources.filter((id) => typeof id === "string").slice(0, 12) : [] }));
  // Le schede brevi arrivano tutte, in ordine di vicinanza: lo spazio lo
  // divide prepareAsk (schede intere finché ci stanno, poi una riga per gli altri).
  const { details, memory } = scegliPerDomanda(items, question, { history: turni, near, memoryBudget: Infinity });
  return { details, memory, total: items.length, numeri: numeriArchivio(items, now), turni };
}
