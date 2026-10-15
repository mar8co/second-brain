// Indirizzo temporaneo dei file salvati (foto, video), per mostrarne la
// copertina senza aprire la scheda. Lo store lo mette a disposizione di tutta l'app.
import { createContext, useContext, useEffect, useState } from "react";

export const FileStoreContext = createContext(null);

// Copertina possibile per questo elemento? Solo foto e video caricati.
export const hasFileCover = (item) => Boolean(item?.file_path) && /^(image|video)\//.test(item.file_mime || "");

export function useFileUrl(item, enabled = true) {
  const store = useContext(FileStoreContext);
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    if (enabled && store && hasFileCover(item)) store.fileUrl(item).then((u) => alive && setUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, store, item?.id, item?.file_path]); // eslint-disable-line react-hooks/exhaustive-deps
  return url;
}
