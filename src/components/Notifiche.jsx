// Campanella delle notifiche degli eventi (notifiche push), in alto a destra
// in Impostazioni. Solo con
// l'archivio sincronizzato e un browser che le supporta.
import { useContext, useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
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

  const toggle = async () => {
    if (!supported) return toast("Questo browser non supporta le notifiche.");
    if (needsHome) return toast("Su iPhone aggiungi prima l'app alla schermata Home e aprila da lì.");
    setBusy(true);
    try {
      if (on) {
        await disablePush(store);
        setOn(false);
        toast("Notifiche disattivate");
      } else {
        await enablePush(store);
        setOn(true);
        toast("Notifiche attivate");
      }
    } catch (e) {
      toast(e.message || "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  };

  const Icona = on ? Bell : BellOff;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Notifiche"
      className={`tondo !border-2 ${on ? "!bg-[#ffb5d0]" : ""}`}
      onClick={toggle}
      disabled={busy}
    >
      <Icona className="h-[18px] w-[18px]" fill={on ? "currentColor" : "none"} strokeWidth={2.6} aria-hidden="true" />
    </button>
  );
}
