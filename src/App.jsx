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
import Home from "./views/Home.jsx";
import Archive from "./views/Archive.jsx";
import Add from "./views/Add.jsx";
import Detail from "./views/Detail.jsx";
import Ask from "./views/Ask.jsx";
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

  const [toastMsg, setToastMsg] = useState(null);
  const timer = useRef(null);
  const toast = useCallback((m) => {
    setToastMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const openItem = useCallback((it) => navigate(`/elemento/${it.id}`), [navigate]);
  const common = { archive, query, navigate, back, openItem, toast, ai: aiStatus.ai };

  let view;
  const m = path.match(/^\/elemento\/([\w-]+)$/);
  if (m) view = <Detail key={m[1]} id={m[1]} store={store} {...common} />;
  else if (path === "/aggiungi") view = <Add {...common} />;
  else if (path === "/archivio") view = <Archive {...common} />;
  else if (path === "/chiedi") view = <Ask {...common} />;
  else if (path === "/impostazioni")
    view = (
      <Settings {...common} syncMode={isSyncMode} session={auth.session} signOut={auth.signOut} aiStatus={aiStatus} settings={settings} setSettings={setSettings} />
    );
  else view = <Home {...common} syncMode={isSyncMode} />;

  return (
    <>
      {view}
      <BottomNav path={path} navigate={navigate} />
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
        {toastMsg && <div className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg shadow-lg">{toastMsg}</div>}
      </div>
    </>
  );
}
