// Struttura della pagina: barra superiore, contenuto, navigazione in basso.
import { Archive, ChevronLeft, MessageCircle } from "lucide-react";

export function TopBar({ title, onBack, left, right }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/90 pt-safe backdrop-blur">
      <div className="mx-auto flex h-12 max-w-2xl items-center gap-2 px-3">
        {onBack ? (
          <button type="button" onClick={onBack} className="btn -ml-2 px-2 text-accent" aria-label="Indietro">
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
        ) : (
          left || <span className="w-1" />
        )}
        <h1 className="flex-1 truncate text-[17px] font-semibold">{title}</h1>
        {right}
      </div>
    </header>
  );
}

const TABS = [
  ["/", "Chat", MessageCircle],
  ["/archivio", "Archivio", Archive],
];

export function BottomNav({ path, navigate }) {
  return (
    <nav aria-label="Navigazione principale" className="bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-safe backdrop-blur">
      <ul className="mx-auto grid max-w-2xl grid-cols-2">
        {TABS.map(([to, label, Icon]) => {
          const active = to === "/" ? path === "/" : path.startsWith(to);
          return (
            <li key={to}>
              <a
                href={to}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(to);
                }}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-accent" : "text-muted"}`}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
                <span>{label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Page({ children }) {
  return <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">{children}</main>;
}
