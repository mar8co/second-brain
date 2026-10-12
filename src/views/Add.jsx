// Aggiungi: link, nota o file in pochi secondi.
//
// Accetta parametri nell'URL per i Comandi Rapidi iOS e per la condivisione:
//   /aggiungi?url=<link>   /aggiungi?text=<testo>   &title=<titolo>
// Se `text` contiene un link (come quando Instagram condivide "… https://…"),
// il link viene estratto e il resto del testo diventa la nota.
import { useMemo, useRef, useState } from "react";
import { ClipboardPaste, FileUp, Link2, StickyNote } from "lucide-react";
import { Page, TopBar } from "../components/Layout.jsx";
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
  ["link", "Link", Link2],
  ["note", "Nota", StickyNote],
  ["file", "File", FileUp],
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
    <>
      <TopBar title="Aggiungi" onBack={() => back("/")} />
      <Page>
        <form onSubmit={save} noValidate className="space-y-5">
          <div role="tablist" aria-label="Cosa vuoi salvare" className="grid grid-cols-3 gap-1 rounded-xl bg-sunken p-1">
            {MODES.map(([k, label, Icon]) => (
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
                className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg text-sm font-medium ${mode === k ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>

          {mode === "link" && (
            <div>
              <label htmlFor="add-url" className="label">Link</label>
              <div className="flex gap-2">
                <input
                  id="add-url"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus={!init.url}
                  className="input"
                  placeholder="https://www.instagram.com/reel/…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  aria-describedby="url-help"
                />
                <button type="button" className="btn-ghost shrink-0 px-3" onClick={paste} aria-label="Incolla dagli appunti">
                  <ClipboardPaste className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <p id="url-help" className="mt-1.5 text-sm text-muted">
                {cleanUrl ? <>Da <strong>{displayHost(cleanUrl)}</strong>: leggerò titolo e testo pubblici dopo il salvataggio.</> : "Incolla un link: articoli, Reel, video, posti di Google o Apple Maps…"}
              </p>
            </div>
          )}

          {mode === "file" && (
            <div>
              <label htmlFor="add-file" className="label">File (immagini, PDF, testo · max 15 MB)</label>
              <input
                id="add-file"
                ref={fileRef}
                type="file"
                accept={[...ACCEPTED_MIME, ".md", ".heic"].join(",")}
                className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-accent file:px-4 file:py-2.5 file:font-medium file:text-accent-ink"
                onChange={(e) => pickFile(e.target.files?.[0] || null)}
              />
              {file && <p className="mt-1.5 text-sm text-muted">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
            </div>
          )}

          <div>
            <label htmlFor="add-title" className="label">Titolo {mode === "note" ? "" : "(facoltativo)"}</label>
            <input id="add-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === "link" ? "Lo leggo dal link se lo lasci vuoto" : ""} maxLength={300} />
          </div>

          <div>
            <label htmlFor="add-note" className="label">{mode === "note" ? "Testo" : "Nota (facoltativa)"}</label>
            <textarea
              id="add-note"
              className="input min-h-[110px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={mode === "link" ? "Perché lo salvi? Es. “ricetta pasta al limone da provare”" : "Scrivi qui…"}
              maxLength={20000}
            />
            {mode === "link" && /instagram/i.test(cleanUrl || "") && (
              <p className="mt-1.5 text-sm text-muted">Instagram di solito non permette di leggere il contenuto senza accesso: una nota ti aiuterà a ritrovarlo.</p>
            )}
          </div>

          <fieldset>
            <legend className="label">Tipo</legend>
            <div className="flex flex-wrap gap-1.5">
              {typeChoices.map((t) => (
                <button key={t} type="button" aria-pressed={type === t} className={type === t ? "chip-on" : "chip"} onClick={() => setTypeOverride(t)}>
                  <TypeIcon type={t} className="h-4 w-4" /> {typeLabel(t)}
                </button>
              ))}
              {!typeChoices.includes(type) && (
                <span className="chip-on"><TypeIcon type={type} className="h-4 w-4" /> {TYPES[type]?.label}</span>
              )}
            </div>
          </fieldset>

          <ChipEditor label="Categorie" values={categories} onChange={setCategories} suggestions={archive.categories} placeholder="Scegli o scrivi e premi Invio" />
          <ChipEditor label="Tag" values={tags} onChange={setTags} lowercase placeholder="es. pasta, roma, regalo" />

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] -mx-4 bg-bg/95 px-4 py-3 backdrop-blur">
            <button type="submit" className="btn-primary w-full min-h-[52px] text-[17px]" disabled={saving}>
              {saving ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </form>
      </Page>
    </>
  );
}
