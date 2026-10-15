// Aggiornamento dell'app installata (PWA). Il service worker nuovo si scarica da
// solo, ma la pagina già aperta continua con i file vecchi finché non si
// riapre: su iPhone l'app resta in memoria e le modifiche sembrano "non
// arrivare". Qui: si cerca una versione nuova ogni volta che l'app torna in
// primo piano, e quando il service worker nuovo prende il controllo la pagina
// si ricarica da sola, senza interrompere chi sta scrivendo.

export function watchForUpdates({ sw = globalThis.navigator?.serviceWorker, doc = globalThis.document, reload = () => globalThis.location.reload() } = {}) {
  if (!sw || !doc) return;
  const hadController = Boolean(sw.controller);
  let reloading = false;
  const go = () => {
    if (reloading) return;
    reloading = true;
    reload();
  };
  const typing = () => {
    const el = doc.activeElement;
    return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
  };

  // Al primo avvio (nessun controller prima) non c'è nulla da ricaricare.
  sw.addEventListener("controllerchange", () => {
    if (!hadController) return;
    if (doc.visibilityState === "hidden" || !typing()) go();
    else doc.addEventListener("visibilitychange", () => doc.visibilityState === "hidden" && go(), { once: true });
  });

  // Tornando in primo piano si controlla se c'è una versione nuova.
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState !== "visible") return;
    sw.getRegistration?.().then((reg) => reg?.update?.()).catch(() => {});
  });
}
