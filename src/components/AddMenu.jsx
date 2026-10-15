// Tondo + a destra della barra: un piccolo menu per aggiungere foto, file o
// scrivere a mano. Foto e file si salvano subito, senza cambiare schermata.
import { useEffect, useRef, useState } from "react";
import { FileText, Image, PencilLine, Plus } from "lucide-react";
import { ACCEPTED_MIME } from "../lib/constants.js";
import { saveFiles, uploadMessage } from "../lib/upload.js";

export default function AddMenu({ archive, navigate, toast }) {
  const [open, setOpen] = useState(false);
  const photoRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const pick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    toast(files.length === 1 ? "Salvo…" : `Salvo ${files.length} file…`);
    const r = await saveFiles(files, archive.add);
    toast(uploadMessage(r));
  };

  const choose = (fn) => {
    setOpen(false);
    fn();
  };

  const row = "flex w-full whitespace-nowrap items-center gap-3 px-4 py-3 text-left text-[0.95rem] font-extrabold tracking-[-0.02em]";
  return (
    <div className="piu-barra">
      {open && <div className="fixed inset-0 z-[1]" aria-hidden="true" data-chiudi-menu onClick={() => setOpen(false)} />}
      <input ref={photoRef} type="file" accept="image/*" multiple hidden aria-label="Scegli le foto" onChange={pick} />
      <input ref={fileRef} type="file" accept={[...ACCEPTED_MIME, ".md", ".heic"].join(",")} multiple hidden aria-label="Scegli i file" onChange={pick} />
      {open && (
        <div role="menu" aria-label="Aggiungi" className="absolute bottom-[calc(100%+10px)] right-0 z-[2] min-w-[15rem] overflow-hidden rounded-2xl border-[1.5px] border-[#0a0a0a] bg-white text-[#0a0a0a]">
          <button type="button" role="menuitem" className={`${row} border-b border-[rgb(10_10_10/0.15)]`} onClick={() => choose(() => photoRef.current?.click())}>
            <Image className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" /> Foto
          </button>
          <button type="button" role="menuitem" className={`${row} border-b border-[rgb(10_10_10/0.15)]`} onClick={() => choose(() => fileRef.current?.click())}>
            <FileText className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" /> File
          </button>
          <button type="button" role="menuitem" className={row} onClick={() => choose(() => navigate("/aggiungi"))}>
            <PencilLine className="h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" /> Aggiungi manualmente
          </button>
        </div>
      )}
      <button type="button" className="piu-tondo relative z-[2]" aria-label="Foto, file o nota" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Plus className="h-7 w-7" strokeWidth={2.8} aria-hidden="true" />
      </button>
    </div>
  );
}
