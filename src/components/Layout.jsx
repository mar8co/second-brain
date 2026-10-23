import AddMenu from "./AddMenu.jsx";

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

// Pillola nera flottante al centro con la scheda attiva accesa in chiaro (solo parole);
// fuori dalla Chat, a destra, il tondo + per aggiungere foto, file, link o note.
export function BottomNav({ path, navigate, archive, toast }) {
  const chat = path === "/" || path === "/chiedi";
  return (
    <div className="barra-in-basso bottom-nav">
      <span aria-hidden="true" />
      <nav aria-label="Navigazione principale" className="schede">
        {TABS.map(([to, label]) => {
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
      <div className="barra-piu">{!chat && path !== "/aggiungi" && <AddMenu archive={archive} navigate={navigate} toast={toast} grande dalDestra />}</div>
    </div>
  );
}

export function Page({ children }) {
  return <main className="pagina">{children}</main>;
}
