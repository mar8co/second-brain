// Calcoli del calendario dei filtri: giorni come "AAAA-MM-GG" nell'ora locale,
// settimana da lunedì, sempre 42 caselle (la griglia non cambia altezza).

export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
export const GIORNI_SETTIMANA = ["L", "M", "M", "G", "V", "S", "D"];

const due = (n) => String(n).padStart(2, "0");

export function isoDay(d) {
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}

export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// Le 42 caselle del mese (anno, mese 0-11), dal lunedì della prima settimana.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const shift = (first.getDay() + 6) % 7; // lunedì = 0
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - shift + i));
}

// Un tocco nel calendario: il primo tocco fissa l'inizio, il secondo la fine
// (anche prima dell'inizio: si scambiano; due volte lo stesso = un giorno solo).
export function pickDay({ from }, day, phase) {
  if (phase !== "fine" || !from) return { from: day, to: "", phase: "fine" };
  if (day < from) return { from: day, to: from, phase: "inizio" };
  return { from, to: day, phase: "inizio" };
}

const breve = (d, withYear) => `${d.getDate()} ${MESI_BREVI[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;

// "12 – 20 ott 2026", "dal 12 ott 2026", "fino al 20 ott 2026", "12 ott 2026".
export function formatRange(from, to) {
  const a = parseDay(from);
  const b = parseDay(to);
  if (a && b) {
    if (from === to) return breve(a, true);
    if (a.getFullYear() !== b.getFullYear()) return `${breve(a, true)} – ${breve(b, true)}`;
    if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${breve(b, true)}`;
    return `${breve(a, false)} – ${breve(b, true)}`;
  }
  if (a) return `dal ${breve(a, true)}`;
  if (b) return `fino al ${breve(b, true)}`;
  return "";
}
