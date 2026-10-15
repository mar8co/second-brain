// Tondo + accanto al campo della chat: un piccolo menu per aggiungere foto, video,
// file o scrivere a mano. Foto, video e file si salvano subito, senza cambiare schermata.
import { useEffect, useRef, useState } from "react";
import { FileText, Link2, Plus } from "lucide-react";
import { ACCEPTED_MIME } from "../lib/constants.js";
import { saveFiles, uploadMessage } from "../lib/upload.js";

export default function AddMenu({ archive, navigate, toast }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef(null);

  const root = useRef(null);
  // Finché il menu è aperto, un tocco fuori lo chiude e basta: non arriva a ciò che sta sotto.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onClick = (e) => {
      if (root.current?.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick, true);
    };
  }, [open]);

  const pick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    toast(files.length === 1 ? "Salvo…" : `Salvo ${files.length} file…`);
    const r = await saveFiles(files, archive.add);
    toast(uploadMessage(r));
  };

  // Il tocco non sposta il fuoco nel modulo della chat: la barra e il campo non
  // cambiano posizione sotto il dito (avverrebbe con la tastiera chiusa).
  const keepLayout = (e) => e.preventDefault();

  const choose = (fn) => {
    setOpen(false);
    fn();
  };

  const row = "flex w-full whitespace-nowrap items-center gap-3 px-4 py-3 text-left text-[0.95rem] font-extrabold tracking-[-0.02em]";
  return (
    <div className="piu-barra" ref={root} onMouseDown={keepLayout}>
      <input ref={fileRef} type="file" accept={[...ACCEPTED_MIME, ".md", ".heic", "image/*", "video/*"].join(",")} multiple hidden aria-label="Scegli foto, video o file" onChange={pick} />
      {open && (
        <div role="menu" aria-label="Aggiungi foto, video o file" className="absolute bottom-[calc(100%+10px)] left-0 z-[2] min-w-[15rem] overflow-hidden rounded-2xl border-[1.5px] border-[#0a0a0a] bg-white text-[#0a0a0a]">
          <button type="button" role="menuitem" className={`${row} border-b border-[rgb(10_10_10/0.15)]`} onClick={() => choose(() => fileRef.current?.click())}>
            <FileText className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" /> Foto, video o file
          </button>
          <button type="button" role="menuitem" className={row} onClick={() => choose(() => navigate("/aggiungi"))}>
            <Link2 className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" /> Link
          </button>
        </div>
      )}
      <button type="button" className="piu-tondo" aria-label="Aggiungi foto, video o file" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Plus className="h-6 w-6" strokeWidth={2.8} aria-hidden="true" />
      </button>
    </div>
  );
}
