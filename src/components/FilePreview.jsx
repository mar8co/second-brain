// Anteprima prima del salvataggio: foto, video e file scelti (o condivisi da un'altra
// app). Si può togliere qualcosa, aggiungerne altri e vedere quanti se ne salvano.
// Quelli non salvati restano qui per riprovare; il resto è già nell'archivio.
import { useEffect, useState } from "react";
import { FileText, Film, X } from "lucide-react";
import { fileMime, isImage, isVideo } from "../lib/files.js";
import { mergeFiles, saveFiles, uploadMessage } from "../lib/upload.js";

function Miniatura({ file }) {
  const [rotta, setRotta] = useState(false);
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!isImage(fileMime(file))) return undefined;
    const u = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (url && !rotta) return <img src={url} alt="" onError={() => setRotta(true)} className="h-full w-full object-cover" />;
  const Icon = isVideo(fileMime(file)) ? Film : FileText;
  return <Icon className="h-7 w-7" strokeWidth={2} aria-hidden="true" />;
}

export default function FilePreview({ initial, archive, toast, onClose }) {
  const [files, setFiles] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const n = files.length;
  const soloFoto = files.length > 0 && files.every((f) => isImage(fileMime(f)));
  const unita = soloFoto ? "foto" : "file";

  const save = async () => {
    if (!n || saving) return;
    setSaving(true);
    const r = await saveFiles(files, archive.add);
    setSaving(false);
    toast(uploadMessage(r));
    if (!r.failed.length) return onClose();
    // Restano solo quelli non riusciti, ognuno con il suo motivo.
    const motivi = {};
    r.failed.forEach((f, i) => {
      motivi[f.name] = (r.errors[i] || "").replace(`${f.name}: `, "");
    });
    setErrors(motivi);
    setFiles(r.failed);
    return undefined;
  };

  const add = (e) => {
    const more = [...(e.target.files || [])];
    e.target.value = "";
    if (more.length) setFiles((cur) => mergeFiles(cur, more));
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-[rgb(10_10_10/0.45)]" role="dialog" aria-modal="true" aria-label="Anteprima prima di salvare">
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-[1.5px] border-b-0 border-[#0a0a0a] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-[#0a0a0a]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[1.25rem] font-extrabold tracking-[-0.03em]">{n === 0 ? "Nessun file" : `${n} ${unita} da salvare`}</h2>
          <button type="button" className="grid h-9 w-9 place-items-center" aria-label="Chiudi" disabled={saving} onClick={onClose}>
            <X className="h-5 w-5" strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>
        {n === 0 ? (
          <p className="mt-3 font-medium">Hai tolto tutto. Aggiungi altri file oppure chiudi.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-3 gap-2">
            {files.map((f) => (
              <li key={`${f.name}|${f.size}|${f.lastModified}`} className="relative">
                <div className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-[#efede8]">
                  <Miniatura file={f} />
                </div>
                <button
                  type="button"
                  aria-label={`Togli ${f.name}`}
                  disabled={saving}
                  onClick={() => setFiles((cur) => cur.filter((x) => x !== f))}
                  className="absolute -right-1 -top-1 grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-[#0a0a0a] bg-white"
                >
                  <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                </button>
                <p className="mt-1 truncate text-[0.7rem] font-semibold">{f.name}</p>
                {errors[f.name] && <p className="text-[0.7rem] font-bold text-[#e02a0d]">{errors[f.name]}</p>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="bottone" disabled={!n || saving} onClick={save}>
            {saving ? "Salvo…" : Object.keys(errors).length ? `Riprova (${n})` : `Salva ${n} ${unita}`}
          </button>
          <label className={`pillola cursor-pointer ${saving ? "opacity-50" : ""}`}>
            + Aggiungi altri
            <input key={seq} type="file" multiple hidden disabled={saving} aria-label="Aggiungi altri file" accept="image/*,video/*,.pdf,.txt,.md,.csv,.json,.heic" onChange={(e) => { add(e); setSeq((x) => x + 1); }} />
          </label>
        </div>
      </div>
    </div>
  );
}
