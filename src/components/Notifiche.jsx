// Interruttore dei promemoria degli eventi (notifiche push). Solo con
// l'archivio sincronizzato e un browser che le supporta.
import { useContext, useEffect, useState } from "react";
import { FileStoreContext } from "../lib/fileurl.js";
import { disablePush, enablePush, isIos, isStandalone, pushEnabled, pushSupported } from "../lib/push.js";

export default function Notifiche({ toast }) {
  const store = useContext(FileStoreContext);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    pushEnabled().then((v) => alive && setOn(v));
    return () => {
      alive = false;
    };
  }, []);
  if (!store?.savePushSubscription) return null;

  const supported = pushSupported();
  const needsHome = isIos() && !isStandalone();
  const hint = !supported
    ? "Questo browser non supporta le notifiche."
    : needsHome
      ? "Su iPhone aggiungi prima l'app alla schermata Home e aprila da lì."
      : on
        ? "Ricevi una notifica la mattina degli eventi di oggi e di domani."
        : "Una notifica la mattina degli eventi di oggi e di domani.";

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        await disablePush(store);
        setOn(false);
        toast("Promemoria disattivati");
      } else {
        await enablePush(store);
        setOn(true);
        toast("Promemoria attivati");
      }
    } catch (e) {
      toast(e.message || "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 className="sezione">Promemoria</h2>
      <button type="button" role="switch" aria-checked={on} className="riga-interruttore border-y border-riga" onClick={toggle} disabled={!supported || busy}>
        <span>
          <b className="block font-extrabold tracking-[-0.02em]">Eventi in arrivo</b>
          <span className="micro">{hint}</span>
        </span>
        <i aria-hidden="true" />
      </button>
    </section>
  );
}
