// Indirizzo temporaneo dei file salvati (foto, video), per mostrarne la
// copertina senza aprire la scheda. Lo store lo mette a disposizione di tutta l'app.
import { createContext, useContext, useEffect, useState } from "react";
import { isStoredThumb, storedPath } from "./thumbs.js";

export const FileStoreContext = createContext(null);

// Copertina possibile per questo elemento? Solo foto e video caricati.
export const hasFileCover = (item) => Boolean(item?.file_path) && /^(image|video)\//.test(item.file_mime || "");

// Indirizzi già ottenuti in questa sessione (file per id, miniature salvate
// per indirizzo): una scheda che si apre li ha subito, senza un istante vuoto
// al posto della foto (per esempio arrivando con lo swipe).
const noti = new Map();
const firmati = new Map();
export const urlNoto = (item) => (item?.id ? noti.get(item.id) || null : null);

export async function leggiFileUrl(store, item) {
  const u = await store.fileUrl(item);
  if (u && item?.id) noti.set(item.id, u);
  return u;
}

// Prepara la copertina di una scheda vicina: indirizzo e immagine già
// scaricata, così con lo swipe entra già pronta.
export function precarica(store, item) {
  if (!store || !item) return;
  const scarica = (u) => {
    if (!u || typeof Image === "undefined") return;
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.decoding = "async";
    img.src = u;
  };
  if (item.file_path) leggiFileUrl(store, item).then((u) => /^image\//.test(item.file_mime || "") && scarica(u)).catch(() => {});
  const raw = item.image_url;
  if (!raw) return;
  if (!isStoredThumb(raw)) scarica(raw);
  else if (store.signedUrl) {
    store
      .signedUrl(storedPath(raw))
      .then((u) => {
        if (u) firmati.set(raw, u);
        scarica(u);
      })
      .catch(() => {});
  }
}

export function useFileUrl(item, enabled = true) {
  const store = useContext(FileStoreContext);
  const [url, setUrl] = useState(() => (enabled && hasFileCover(item) ? urlNoto(item) : null));
  useEffect(() => {
    let alive = true;
    if (enabled && store && hasFileCover(item)) leggiFileUrl(store, item).then((u) => alive && setUrl(u)).catch(() => {});
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
  const [signed, setSigned] = useState(() => (firmati.has(raw) ? { raw, url: firmati.get(raw) } : { raw: null, url: null }));
  useEffect(() => {
    let alive = true;
    if (isStoredThumb(raw) && store?.signedUrl) {
      store
        .signedUrl(storedPath(raw))
        .then((url) => {
          if (url) firmati.set(raw, url);
          if (alive) setSigned({ raw, url });
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [raw, store]);
  if (!isStoredThumb(raw)) return raw;
  return signed.raw === raw ? signed.url : null;
}
