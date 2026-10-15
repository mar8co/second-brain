// Calendario "second-brain" (.ics): un evento per ogni evento con data, tutto il giorno.
// Colore del calendario #ffb5d0 (Apple e Google lo leggono dalle proprietà sotto).
export const ICS_COLOR = "#ffb5d0";

const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/[;,]/g, "\\$&").replace(/\r?\n/g, "\\n");
const compact = (d) => d.replace(/-/g, "");
// Giorno dopo (la fine di un evento tutto il giorno è esclusiva).
function nextDay(d) {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
// Righe lunghe: si spezzano a 73 caratteri come richiede lo standard.
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  out.push(rest);
  return out;
}

// `events`: [{ key, name, date, end_date, place, items }]; senza data si saltano.
export function buildIcs(events, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//second-brain//IT",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:second-brain",
    `X-APPLE-CALENDAR-COLOR:${ICS_COLOR}`,
    `COLOR:${ICS_COLOR}`,
    `X-WR-CALDESC:Eventi salvati in second-brain`,
  ];
  for (const e of events.filter((x) => x.date)) {
    const src = (e.items || []).map((it) => it.url).find((u) => /^https?:\/\//.test(u || ""));
    const uid = `${compact(e.date)}-${encodeURIComponent(e.key).replace(/%/g, "").slice(0, 60)}@second-brain`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(e.end_date || e.date))}`,
      `SUMMARY:${esc(`🎟️ ${e.name}`)}`,
      ...(e.place ? [`LOCATION:${esc(e.place)}`] : []),
      ...(src ? [`URL:${src}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.flatMap(fold).join("\r\n")}\r\n`;
}
