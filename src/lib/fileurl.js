// Indirizzo temporaneo dei file salvati (foto, video), per mostrarne la
// copertina senza aprire la scheda. Lo store lo mette a disposizione di tutta l'app.
import { createContext, useContext, useEffect, useState } from "react";
import { isStoredThumb, storedPath } from "./thumbs.js";

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

// Indirizzo da mostrare per la copertina di un link: quello del CDN, oppure,
// se la miniatura è stata copiata nell'archivio, un indirizzo firmato (null
// finché non è pronto).
export function useCoverUrl(item) {
  const store = useContext(FileStoreContext);
  const raw = item?.image_url || null;
  const [signed, setSigned] = useState({ raw: null, url: null });
  useEffect(() => {
    let alive = true;
    if (isStoredThumb(raw) && store?.signedUrl) {
      store
        .signedUrl(storedPath(raw))
        .then((url) => alive && setSigned({ raw, url }))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [raw, store]);
  if (!isStoredThumb(raw)) return raw;
  return signed.raw === raw ? signed.url : null;
}
