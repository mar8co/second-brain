// Radice dell'app: sceglie l'archivio (locale o Supabase), gestisce accesso,
// navigazione e notifiche brevi.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BottomNav } from "./components/Layout.jsx";
import Avvio from "./components/Avvio.jsx";
import { tieniAvvio } from "./lib/avvio.js";
import { useRoute } from "./hooks/useRoute.js";
import { useAuth } from "./hooks/useAuth.js";
import { useArchive } from "./hooks/useArchive.js";
import { useAiStatus } from "./hooks/useAiStatus.js";
import { useSettings } from "./hooks/useSettings.js";
import { isSyncMode, supabase } from "./lib/supabase.js";
import { FileStoreContext } from "./lib/fileurl.js";
import { PreferitiContext } from "./lib/preferiti.js";
import { createLocalStore } from "./lib/store/local.js";
import { createRemoteStore } from "./lib/store/remote.js";
import { startChatSync, stopChatSync } from "./lib/chatlog.js";
import { takeSharedFiles } from "./lib/shared.js";
import FilePreview from "./components/FilePreview.jsx";
import Chat from "./views/Chat.jsx";
import Archive from "./views/Archive.jsx";
import Add from "./views/Add.jsx";
import Detail from "./views/Detail.jsx";
import Settings from "./views/Settings.jsx";
import Login from "./views/Login.jsx";
import NuovaPassword from "./views/NuovaPassword.jsx";

export default function App() {
  const auth = useAuth();
  // All'apertura la schermata di avvio copre tutto finché non c'è l'accesso e
  // la prima lettura dell'archivio (tenuta da Shell).
  useLayoutEffect(() => tieniAvvio("accesso", Boolean(isSyncMode && auth.loading)), [auth.loading]);
  let page;
  if (isSyncMode && auth.loading) page = null;
  else if (isSyncMode && auth.recovery) page = <NuovaPassword setNewPassword={auth.setNewPassword} />;
  else if (isSyncMode && !auth.session) page = <Login signIn={auth.signIn} resetPassword={auth.resetPassword} />;
  else page = <Shell auth={auth} />;
  return (
    <>
      {page}
      <Avvio />
    </>
  );
}

function Shell({ auth }) {
  const route = useRoute();
  // La chat segue l'account: si carica dal server all'accesso, si svuota all'uscita.
  const userId = auth.session?.user?.id || null;
  useEffect(() => {
    if (!isSyncMode) return undefined;
    if (userId) startChatSync(supabase, userId);
    else stopChatSync();
    return undefined;
  }, [userId]);
  const { path, query, navigate, back } = route;
  const store = useMemo(() => (isSyncMode ? createRemoteStore(supabase) : createLocalStore()), []);
  const aiStatus = useAiStatus(true);
  const [settings, setSettings] = useSettings();
  const archive = useArchive(store, { ai: Boolean(aiStatus.ai && settings.autoAi) });
  useLayoutEffect(() => {
    tieniAvvio("archivio", archive.loading);
    return () => tieniAvvio("archivio", false);
  }, [archive.loading]);

  // Avviso breve: 2,4 s, oppure 5 s se ha un'azione ("Annulla"). Un nuovo
  // avviso sostituisce il precedente.
  const [toastMsg, setToastMsg] = useState(null);
  const timer = useRef(null);
  const toast = useCallback((text, { action } = {}) => {
    setToastMsg({ text, action, key: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(null), action ? 5000 : 2400);
  }, []);

  const togglePreferito = useCallback(
    async (it) => {
      try {
        await archive.update(it.id, { favorite: !it.favorite });
        toast(it.favorite ? "Tolto dai preferiti" : "Aggiunto ai preferiti");
      } catch (e) {
        toast(e?.message || "Preferito non salvato");
      }
    },
    [archive.update, toast], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // File arrivati dal menu Condividi di Android: anteprima prima di salvarli.
  const [condivisi, setCondivisi] = useState(null);
  useEffect(() => {
    if (query.get("condivisi") !== "1") return;
    takeSharedFiles().then((files) => {
      if (files.length) setCondivisi(files);
      else toast("Nessun file ricevuto dalla condivisione");
    });
    navigate("/", { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openItem = useCallback((it) => navigate(`/elemento/${it.id}`), [navigate]);
  const common = { archive, query, navigate, back, openItem, toast, ai: aiStatus.ai };

  let view;
  const m = path.match(/^\/elemento\/([\w-]+)$/);
  if (m) view = <Detail key={m[1]} id={m[1]} store={store} {...common} />;
  else if (path === "/aggiungi") view = <Add {...common} />;
  else if (path === "/archivio") view = <Archive store={store} {...common} />;
  else if (path === "/impostazioni")
    view = (
      <Settings {...common} store={store} syncMode={isSyncMode} session={auth.session} signOut={auth.signOut} aiStatus={aiStatus} settings={settings} setSettings={setSettings} />
    );
  // "/" e il vecchio "/chiedi?q=…" portano alla chat.
  else view = <Chat key="chat" {...common} syncMode={isSyncMode} />;

  return (
    <FileStoreContext.Provider value={store}>
      <PreferitiContext.Provider value={togglePreferito}>
      {view}
      {condivisi && <FilePreview initial={condivisi} archive={archive} toast={toast} onClose={() => setCondivisi(null)} />}
      <BottomNav path={path} navigate={navigate} archive={archive} toast={toast} />
      <div role="status" aria-live="polite">
        {toastMsg && (
          <div
            key={toastMsg.key}
            className="brindisi"
            // Swipe verso l'alto: l'avviso segue il dito e, lasciato, sparisce.
            onTouchStart={(e) => {
              e.currentTarget.dataset.y = e.touches[0].clientY;
              e.currentTarget.style.transition = "none";
            }}
            onTouchMove={(e) => {
              const dy = Math.min(0, e.touches[0].clientY - Number(e.currentTarget.dataset.y));
              e.currentTarget.style.transform = `translateY(${dy}px)`;
              e.currentTarget.style.opacity = String(1 + dy / 120);
            }}
            onTouchEnd={(e) => {
              const el = e.currentTarget;
              const dy = e.changedTouches[0].clientY - Number(el.dataset.y);
              el.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
              if (dy < -30) {
                el.style.transform = "translateY(-140px)";
                el.style.opacity = "0";
                clearTimeout(timer.current);
                timer.current = setTimeout(() => setToastMsg(null), 200);
              } else {
                el.style.transform = "";
                el.style.opacity = "";
              }
            }}
          >
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
      </PreferitiContext.Provider>
    </FileStoreContext.Provider>
  );
}
