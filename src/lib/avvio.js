// Schermata di avvio: resta finché qualcuno la "tiene" (accesso, prima
// lettura dell'archivio). Una volta chiusa non torna più fino alla riapertura.
const tenute = new Set();
const ascolta = new Set();
export function tieniAvvio(chiave, on) {
  const prima = tenute.size;
  if (on) tenute.add(chiave);
  else tenute.delete(chiave);
  if (tenute.size !== prima) ascolta.forEach((f) => f());
}
export const avvioTenuto = () => tenute.size > 0;
export function seguiAvvio(f) {
  ascolta.add(f);
  return () => ascolta.delete(f);
}
