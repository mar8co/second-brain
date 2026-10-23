// Aggiungi: link o nota in pochi secondi (foto, video e file si aggiungono dal + della chat).
//
// Accetta parametri nell'URL per i Comandi Rapidi iOS e per la condivisione:
//   /aggiungi?url=<link>   /aggiungi?text=<testo>   &title=<titolo>
// Se `text` contiene un link (come quando Instagram condivide "… https://…"),
// il link viene estratto e il resto del testo diventa la nota.
import { useMemo, useState } from "react";
import { Page, Testata } from "../components/Layout.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { PAGE } from "../lib/colors.js";
import { ChipEditor, ErrorBox, TypeIcon } from "../components/ui.jsx";
import { typeLabel } from "../lib/format.js";
import { detectType, displayHost, extractUrl, extractUrls, urlKey } from "../lib/detect.js";
import { TYPES } from "../lib/constants.js";

function initialFromQuery(query) {
  const url = extractUrl(query.get("url") || "") || extractUrl(query.get("text") || "");
  let note = query.get("text") || "";
  if (url && note) note = note.replace(/\bhttps?:\/\/\S+/i, "").trim();
  const wanted = query.get("mode");
  const mode = wanted === "note" || wanted === "link" ? wanted : url ? "link" : note ? "note" : "link";
  return { url: url || query.get("url") || "", note, title: query.get("title") || "", mode };
}

const MODES = [
  ["link", "Link"],
  ["note", "Nota"],
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
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  usePageColor(PAGE.add);

  const cleanUrl = extractUrl(url);
  const manyUrls = mode === "link" ? extractUrls(url) : [];
  const autoType = mode === "link" ? detectType(cleanUrl) : "note";
  const type = typeOverride || autoType;
  const typeChoices = mode === "link" ? ["link", "social", "video", "place", "shopping"] : ["note", "shopping", "place"];

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      const u = extractUrl(t);
      if (u) setUrl(extractUrls(t).length > 1 ? t : u);
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
    if (mode === "link" && manyUrls.length > 1) {
      // Più link incollati insieme: ognuno a parte, i doppioni (già salvati o
      // ripetuti) si saltano.
      const have = new Set(archive.items.map((it) => it.url && urlKey(it.url)).filter(Boolean));
      const fresh = manyUrls.filter((u) => !have.has(urlKey(u)));
      setSaving(true);
      let done = 0;
      for (const u of fresh) {
        try {
          await archive.add({ ...base, title: null, note: null, url: u, type: detectType(u), status: "processing" });
          done += 1;
        } catch {
          /* gli altri proseguono */
        }
      }
      const dup = manyUrls.length - fresh.length;
      const miss = fresh.length - done;
      toast(`${done} ${done === 1 ? "link salvato" : "link salvati"}${dup ? `, ${dup} già present${dup === 1 ? "e" : "i"}` : ""}${miss ? `, ${miss} non salvat${miss === 1 ? "o" : "i"}` : ""}`);
      if (miss && !done) {
        setError("Salvataggio non riuscito: riprova.");
        return setSaving(false);
      }
      return navigate("/archivio", { replace: true });
    }
    if (mode === "link") {
      if (!cleanUrl) return setError("Inserisci un link valido (es. https://…).");
      item = { ...base, url: cleanUrl, status: "processing" };
    } else if (mode === "note") {
      if (!note.trim() && !title.trim()) return setError("Scrivi almeno un titolo o un testo.");
      // Una nota può contenere un link: lo conserviamo come originale, senza leggerlo.
      item = { ...base, url: extractUrl(note) || null, status: "saved", status_detail: "Nota scritta da te.", text_source: "inserito da te" };
    }
    setSaving(true);
    try {
      const created = await archive.add(item);
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
      <h1 className="gigante !mb-6">Aggiungi</h1>
      <form onSubmit={save} noValidate className="space-y-6">
        <div role="tablist" aria-label="Cosa vuoi salvare" className="grid grid-cols-2 gap-1.5">
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
              <textarea
                id="add-url"
                rows={url.includes("\n") ? 4 : 1}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                autoFocus={!init.url}
                className="campo resize-none"
                placeholder="https://www.instagram.com/reel/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                aria-describedby="url-help"
              />
              <button type="button" className="pillola mb-1.5" onClick={paste} aria-label="Incolla dagli appunti">
                Incolla
              </button>
            </div>
            <p id="url-help" className="micro mt-1.5 text-[0.8rem]">
              {manyUrls.length > 1 ? <><strong className="font-bold text-inchiostro">{manyUrls.length} link</strong>: li salvo uno per uno, i doppioni li salto.</> : cleanUrl ? <>Da <strong className="font-bold text-inchiostro">{displayHost(cleanUrl)}</strong>: leggerò titolo e testo pubblici dopo il salvataggio.</> : "Incolla un link: articoli, Reel, video, posti di Google o Apple Maps…"}
            </p>
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

        <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] -mx-4 bg-sfondo px-4 pb-3 pt-3">
          <button type="submit" className="bottone grande-azione" disabled={saving}>
            {saving ? "Salvo…" : "Salva"}
          </button>
        </div>
      </form>
    </Page>
  );
}
