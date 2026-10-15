// Aggiungi: link, nota o file in pochi secondi.
//
// Accetta parametri nell'URL per i Comandi Rapidi iOS e per la condivisione:
//   /aggiungi?url=<link>   /aggiungi?text=<testo>   &title=<titolo>
// Se `text` contiene un link (come quando Instagram condivide "… https://…"),
// il link viene estratto e il resto del testo diventa la nota.
import { useMemo, useRef, useState } from "react";
import { Page, Testata } from "../components/Layout.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { PAGE } from "../lib/colors.js";
import { ChipEditor, ErrorBox, TypeIcon } from "../components/ui.jsx";
import { typeLabel } from "../lib/format.js";
import { detectType, displayHost, extractUrl } from "../lib/detect.js";
import { ACCEPTED_MIME, TYPES } from "../lib/constants.js";
import { extractFileText, fileMime, isImage, validateFile, withMime } from "../lib/files.js";

function initialFromQuery(query) {
  const url = extractUrl(query.get("url") || "") || extractUrl(query.get("text") || "");
  let note = query.get("text") || "";
  if (url && note) note = note.replace(/\bhttps?:\/\/\S+/i, "").trim();
  const mode = query.get("mode") || (url ? "link" : note ? "note" : "link");
  return { url: url || query.get("url") || "", note, title: query.get("title") || "", mode };
}

const MODES = [
  ["link", "Link"],
  ["note", "Nota"],
  ["file", "File"],
];

export default function Add({ archive, query, navigate, back, toast }) {
  const init = useMemo(() => initialFromQuery(query), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState(init.mode);
  const [url, setUrl] = useState(init.url);
  const [title, setTitle] = useState(init.title);
  const [note, setNote] = useState(init.note);
  const [typeOverride, setTypeOverride] = useState(null);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  usePageColor(PAGE.add);

  const cleanUrl = extractUrl(url);
  const autoType =
    mode === "link" ? detectType(cleanUrl) : mode === "file" ? (file && isImage(fileMime(file)) ? "image" : "file") : "note";
  const type = typeOverride || autoType;
  const typeChoices = mode === "link" ? ["link", "social", "video", "place", "shopping"] : mode === "note" ? ["note", "shopping", "place"] : ["file", "image"];

  const pickFile = (f) => {
    setError(null);
    if (!f) return setFile(null);
    const err = validateFile(f);
    if (err) {
      setFile(null);
      setError(err);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      const u = extractUrl(t);
      if (u) setUrl(u);
      else setError("Negli appunti non c'è un link.");
    } catch {
      setError("Non riesco a leggere gli appunti: incolla il link nel campo.");
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    const base = { title: title.trim() || null, note: note.trim() || null, categories, tags, type };
    let item;
    let upload = null;
    if (mode === "link") {
      if (!cleanUrl) return setError("Inserisci un link valido (es. https://…).");
      item = { ...base, url: cleanUrl, status: "processing" };
    } else if (mode === "note") {
      if (!note.trim() && !title.trim()) return setError("Scrivi almeno un titolo o un testo.");
      // Una nota può contenere un link: lo conserviamo come originale, senza leggerlo.
      item = { ...base, url: extractUrl(note) || null, status: "saved", status_detail: "Nota scritta da te.", text_source: "inserito da te" };
    } else {
      if (!file) return setError("Scegli un file da caricare.");
      upload = withMime(file);
      const ex = await extractFileText(upload);
      item = {
        ...base,
        extracted_text: ex.text,
        text_source: ex.source,
        status: ex.status,
        status_detail: ex.detail,
        processed_at: new Date().toISOString(),
      };
    }
    setSaving(true);
    try {
      const created = await archive.add(item, upload);
      toast("Salvato nell'archivio");
      navigate(`/elemento/${created.id}`, { replace: true });
    } catch (err) {
      setError(err.message || "Salvataggio non riuscito.");
      setSaving(false);
    }
  };

  return (
    <Page>
      <Testata onBack={() => back("/")} />
      <h1 className="gigante">Aggiungi</h1>
      <form onSubmit={save} noValidate className="space-y-6">
        <div role="tablist" aria-label="Cosa vuoi salvare" className="grid grid-cols-3 gap-1.5">
          {MODES.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => {
                setMode(k);
                setTypeOverride(null);
                setError(null);
              }}
              className={`pillola${mode === k ? " attiva" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "link" && (
          <div>
            <label htmlFor="add-url" className="etichetta">Link</label>
            <div className="flex items-end gap-2">
              <input
                id="add-url"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                autoFocus={!init.url}
                className="campo"
                placeholder="https://www.instagram.com/reel/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-describedby="url-help"
              />
              <button type="button" className="pillola mb-1.5" onClick={paste} aria-label="Incolla dagli appunti">
                Incolla
              </button>
            </div>
            <p id="url-help" className="micro mt-1.5 text-[0.8rem]">
              {cleanUrl ? <>Da <strong className="font-bold text-inchiostro">{displayHost(cleanUrl)}</strong>: leggerò titolo e testo pubblici dopo il salvataggio.</> : "Incolla un link: articoli, Reel, video, posti di Google o Apple Maps…"}
            </p>
          </div>
        )}

        {mode === "file" && (
          <div>
            <label htmlFor="add-file" className="etichetta">File (immagini, PDF, testo · max 15 MB)</label>
            <input
              id="add-file"
              ref={fileRef}
              type="file"
              accept={[...ACCEPTED_MIME, ".md", ".heic"].join(",")}
              className="mt-1.5 block w-full text-sm font-semibold file:mr-3 file:min-h-[44px] file:rounded-full file:border-0 file:bg-inchiostro file:px-5 file:font-bold file:text-sfondo"
              onChange={(e) => pickFile(e.target.files?.[0] || null)}
            />
            {file && <p className="micro mt-1.5 text-[0.8rem]">{file.name} · <span className="num">{(file.size / 1024 / 1024).toFixed(1)} MB</span></p>}
          </div>
        )}

        <div>
          <label htmlFor="add-title" className="etichetta">Titolo {mode === "note" ? "" : "(facoltativo)"}</label>
          <input id="add-title" className="campo" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === "link" ? "Lo leggo dal link se lo lasci vuoto" : ""} maxLength={300} autoComplete="off" />
        </div>

        <div>
          <label htmlFor="add-note" className="etichetta">{mode === "note" ? "Testo" : "Nota (facoltativa)"}</label>
          <textarea
            id="add-note"
            className="campo min-h-[110px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "link" ? "Perché lo salvi? Es. “ricetta pasta al limone da provare”" : "Scrivi qui…"}
            maxLength={20000}
          />
          {mode === "link" && /instagram/i.test(cleanUrl || "") && (
            <p className="micro mt-1.5 text-[0.8rem]">Instagram di solito non permette di leggere il contenuto senza accesso: una nota ti aiuterà a ritrovarlo.</p>
          )}
        </div>

        <fieldset>
          <legend className="etichetta">Tipo</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {typeChoices.map((t) => (
              <button key={t} type="button" aria-pressed={type === t} className={`pillola${type === t ? " attiva" : ""}`} onClick={() => setTypeOverride(t)}>
                <TypeIcon type={t} className="h-4 w-4" /> {typeLabel(t)}
              </button>
            ))}
            {!typeChoices.includes(type) && (
              <span className="pillola attiva"><TypeIcon type={type} className="h-4 w-4" /> {TYPES[type]?.label}</span>
            )}
          </div>
        </fieldset>

        <ChipEditor label="Categorie" values={categories} onChange={setCategories} suggestions={archive.categories} placeholder="Scegli o scrivi e premi Invio" />
        <ChipEditor label="Tag" values={tags} onChange={setTags} lowercase placeholder="es. pasta, roma, regalo" />

        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="sticky bottom-0 -mx-4 bg-sfondo px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
          <button type="submit" className="bottone grande-azione" disabled={saving}>
            {saving ? "Salvo…" : "Salva"}
          </button>
        </div>
      </form>
    </Page>
  );
}
