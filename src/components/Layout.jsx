// Struttura della pagina: intestazione, contenuto, barra in basso.
// Il titolo della pagina non sta nell'intestazione: è il primo elemento della
// pagina, enorme.

export function Testata({ onBack, left, right }) {
  return (
    <header className="testata">
      {onBack ? (
        <button type="button" onClick={onBack} className="tondo text-[1.7rem] font-semibold" aria-label="Indietro">
          <span aria-hidden="true" className="-mt-1 -translate-x-px">‹</span>
        </button>
      ) : (
        left || <span />
      )}
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}

const TABS = [
  ["/", "Chat"],
  ["/archivio", "Archivio"],
];

// Pillola nera flottante con la scheda attiva accesa in chiaro. Solo parole.
export function BottomNav({ path, navigate }) {
  return (
    <nav aria-label="Navigazione principale" className="schede bottom-nav">
      {TABS.map(([to, label]) => {
        const chat = path === "/" || path === "/chiedi";
        const active = to === "/" ? chat : !chat; // le pagine interne restano su Archivio
        return (
          <a
            key={to}
            href={to}
            onClick={(e) => {
              e.preventDefault();
              navigate(to);
            }}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}

export function Page({ children }) {
  return <main className="pagina">{children}</main>;
}
