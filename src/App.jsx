// Radice dell'app: sceglie l'archivio (locale o Supabase), gestisce accesso,
// navigazione e notifiche brevi.
import { useCallback, useMemo, useRef, useState } from "react";
import { BottomNav } from "./components/Layout.jsx";
import { Spinner } from "./components/ui.jsx";
import { useRoute } from "./hooks/useRoute.js";
import { useAuth } from "./hooks/useAuth.js";
import { useArchive } from "./hooks/useArchive.js";
import { useAiStatus } from "./hooks/useAiStatus.js";
import { useSettings } from "./hooks/useSettings.js";
import { isSyncMode, supabase } from "./lib/supabase.js";
import { createLocalStore } from "./lib/store/local.js";
import { createRemoteStore } from "./lib/store/remote.js";
import Chat from "./views/Chat.jsx";
import Archive from "./views/Archive.jsx";
import Add from "./views/Add.jsx";
import Detail from "./views/Detail.jsx";
import Settings from "./views/Settings.jsx";
import Login from "./views/Login.jsx";

export default function App() {
  const auth = useAuth();
  if (isSyncMode && auth.loading) return <Spinner label="Avvio…" />;
  if (isSyncMode && !auth.session) return <Login signIn={auth.signIn} />;
  return <Shell auth={auth} />;
}

function Shell({ auth }) {
  const route = useRoute();
  const { path, query, navigate, back } = route;
  const store = useMemo(() => (isSyncMode ? createRemoteStore(supabase) : createLocalStore()), []);
  const aiStatus = useAiStatus(true);
  const [settings, setSettings] = useSettings();
  const archive = useArchive(store, { ai: Boolean(aiStatus.ai && settings.autoAi) });

  // Avviso breve: 2,4 s, oppure 5 s se ha un'azione ("Annulla"). Un nuovo
  // avviso sostituisce il precedente.
  const [toastMsg, setToastMsg] = useState(null);
  const timer = useRef(null);
  const toast = useCallback((text, { action } = {}) => {
    setToastMsg({ text, action, key: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(null), action ? 5000 : 2400);
  }, []);

  const openItem = useCallback((it) => navigate(`/elemento/${it.id}`), [navigate]);
  const common = { archive, query, navigate, back, openItem, toast, ai: aiStatus.ai };

  let view;
  const m = path.match(/^\/elemento\/([\w-]+)$/);
  if (m) view = <Detail key={m[1]} id={m[1]} store={store} {...common} />;
  else if (path === "/aggiungi") view = <Add {...common} />;
  else if (path === "/archivio") view = <Archive {...common} />;
  else if (path === "/impostazioni")
    view = (
      <Settings {...common} syncMode={isSyncMode} session={auth.session} signOut={auth.signOut} aiStatus={aiStatus} settings={settings} setSettings={setSettings} />
    );
  // "/" e il vecchio "/chiedi?q=…" portano alla chat.
  else view = <Chat key="chat" {...common} syncMode={isSyncMode} />;

  // Barra in basso solo sulle schermate principali.
  const chat = path === "/" || path === "/chiedi";
  const main = chat || path === "/archivio";
  // L'avviso sta appena sopra la barra (e sopra il campo della chat).
  const toastBottom = chat ? "calc(150px + env(safe-area-inset-bottom))" : main ? "calc(84px + env(safe-area-inset-bottom))" : "calc(24px + env(safe-area-inset-bottom))";
  return (
    <>
      {view}
      {main && <BottomNav path={path} navigate={navigate} />}
      <div role="status" aria-live="polite">
        {toastMsg && (
          <div key={toastMsg.key} className="brindisi" style={{ bottom: toastBottom }}>
            <span>{toastMsg.text}</span>
            {toastMsg.action && (
              <button
                type="button"
                onClick={() => {
                  clearTimeout(timer.current);
                  setToastMsg(null);
                  toastMsg.action.run();
                }}
              >
                {toastMsg.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
