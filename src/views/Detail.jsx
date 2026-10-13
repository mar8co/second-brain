// Scheda di un elemento: contenuto, link originale, stato, testo estratto,
// categorie/tag modificabili e proposte dell'AI (separate dai dati letti).
import { useEffect, useState } from "react";
import { Check, ExternalLink, FileText, MapPin, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Page, TopBar } from "../components/Layout.jsx";
import { AiBadge, ChipEditor, EmptyState, ErrorBox, StatusBadge, TypeIcon } from "../components/ui.jsx";
import { formatDate, typeLabel } from "../lib/format.js";
import { displayTitle } from "../lib/item.js";
import { displayHost } from "../lib/detect.js";
import { STATUSES, TYPES } from "../lib/constants.js";
import { isImage } from "../lib/files.js";
import { TRANSCRIPT_SOURCE } from "../lib/enrich.js";

function mapsLink(place) {
  const p = new URLSearchParams();
  if (place.name) p.set("q", place.name);
  if (typeof place.lat === "number" && typeof place.lng === "number") p.set("ll", `${place.lat},${place.lng}`);
  return `https://maps.apple.com/?${p}`;
}

export default function Detail({ id, archive, store, ai, back, navigate, toast }) {
  const item = archive.items.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    if (item?.file_path) store.fileUrl(item).then((u) => alive && setFileUrl(u));
    return () => {
      alive = false;
    };
  }, [item?.id, item?.file_path, store]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) {
    return (
      <>
        <TopBar title="Elemento" onBack={() => back("/")} />
        <Page>
          {archive.loading ? null : (
            <EmptyState title="Elemento non trovato" action={<button className="btn-primary" onClick={() => navigate("/archivio")}>Vai all'archivio</button>}>
              Potrebbe essere stato eliminato.
            </EmptyState>
          )}
        </Page>
      </>
    );
  }

  const run = async (label, fn) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message || "Operazione non riuscita.");
    } finally {
      setBusy(null);
    }
  };

  const remove = () => {
    if (!window.confirm("Eliminare definitivamente questo elemento?")) return;
    run("delete", async () => {
      await archive.remove(item);
      toast("Eliminato");
      navigate("/archivio", { replace: true });
    });
  };

  const saveTranscript = () =>
    run("transcript", async () => {
      const saved = await archive.update(item.id, { extracted_text: transcript.trim(), text_source: TRANSCRIPT_SOURCE });
      if (ai) await archive.classify(saved || { ...item, extracted_text: transcript.trim(), text_source: TRANSCRIPT_SOURCE }, { apply: true });
      toast("Trascrizione salvata");
      setTranscript("");
    });

  // Scheda di memoria dell'AI: i dati vengono dal database, si mostrano solo testi.
  const points = (Array.isArray(item.ai?.points) ? item.ai.points : []).filter((p) => typeof p === "string" && p);
  const entities = (Array.isArray(item.ai?.entities) ? item.ai.entities : []).filter((e) => typeof e?.name === "string" && e.name);
  const aiCats = (item.ai?.categories || []).filter((c) => !(item.categories || []).includes(c));
  const aiTags = (item.ai?.tags || []).filter((t) => !(item.tags || []).includes(t));
  const acceptAi = (cats, tags) =>
    run("accept", () => archive.update(item.id, { categories: [...item.categories, ...cats], tags: [...item.tags, ...tags] }));

  if (editing) return <EditForm item={item} archive={archive} onDone={() => setEditing(false)} />;

  const status = STATUSES[item.status] || STATUSES.saved;
  // "In elaborazione" da più di cinque minuti e mezzo (la trascrizione di un
  // video può durarne cinque): l'elaborazione si è interrotta, si può riprovare.
  const stale = item.status === "processing" && openedAt - new Date(item.updated_at).getTime() > 330_000;
  const showImage = item.file_path && isImage(item.file_mime) && fileUrl;

  return (
    <>
      <TopBar
        title={typeLabel(item.type)}
        onBack={() => back("/")}
        right={
          <button type="button" className="btn px-2 text-accent" onClick={() => setEditing(true)} aria-label="Modifica">
            <Pencil className="h-5 w-5" aria-hidden="true" />
          </button>
        }
      />
      <Page>
        <article className="space-y-5">
          <header>
            <div className="mb-2 flex items-center gap-2 text-sm text-muted">
              <TypeIcon type={item.type} className="h-4 w-4" />
              <span>{item.site_name || (item.url ? displayHost(item.url) : TYPES[item.type]?.label)}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={item.created_at}>Salvato il {formatDate(item.created_at, true)}</time>
            </div>
            <h2 className="font-serif text-2xl font-semibold leading-tight">{displayTitle(item)}</h2>
            {(item.author || item.published_at) && (
              <p className="mt-1.5 text-sm text-muted">
                {item.author && <>Pubblicato da <span className="font-medium text-ink">{item.author}</span></>}
                {item.published_at && <>{item.author ? " il " : "Pubblicato il "}{formatDate(item.published_at)}</>}
              </p>
            )}
          </header>

          {/* Stato di elaborazione con spiegazione */}
          <section aria-live="polite" className="card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge status={item.status} />
              {item.url && !item.file_path && (item.status !== "processing" || stale) && (
                <button type="button" className="text-sm font-medium text-accent" disabled={!!busy} onClick={() => run("reprocess", () => archive.reprocess(item))}>
                  <RefreshCw className={`mr-1 inline h-3.5 w-3.5 ${busy === "reprocess" ? "animate-spin" : ""}`} aria-hidden="true" />
                  Rianalizza
                </button>
              )}
            </div>
            <p className="mt-1.5 text-sm text-muted">{item.status_detail || status.hint}</p>
          </section>

          {item.url && (
            <div className="space-y-1.5">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn-primary w-full">
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Apri l'originale
              </a>
              <p className="break-all text-xs text-muted">{item.url}</p>
            </div>
          )}

          {item.place && (
            <section className="card flex items-start gap-3 p-3.5">
              <MapPin className="mt-0.5 h-5 w-5 text-accent" aria-hidden="true" />
              <div className="flex-1">
                <p className="font-medium">{item.place.name || "Posto senza nome"}</p>
                {typeof item.place.lat === "number" && typeof item.place.lng === "number" && <p className="text-sm text-muted">{item.place.lat.toFixed(5)}, {item.place.lng.toFixed(5)}</p>}
                <a href={mapsLink(item.place)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-medium text-accent">Apri in Mappe</a>
              </div>
            </section>
          )}

          {showImage && <img src={fileUrl} alt={item.title || item.file_name || "Immagine salvata"} className="w-full rounded-2xl border border-line" />}
          {!showImage && item.image_url && (
            <img src={item.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-72 w-full rounded-2xl border border-line object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
          )}
          {item.file_path && !isImage(item.file_mime) && (
            <a href={fileUrl || "#"} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full" aria-disabled={!fileUrl}>
              <FileText className="h-4 w-4" aria-hidden="true" /> Apri {item.file_name}
            </a>
          )}

          {item.note && (
            <section>
              <h3 className="label">La tua nota</h3>
              <p className="whitespace-pre-wrap">{item.note}</p>
            </section>
          )}

          {item.description && (
            <section>
              <h3 className="label">Descrizione {item.text_source && item.text_source !== "inserito da te" ? "(dalla fonte)" : ""}</h3>
              <p className="whitespace-pre-wrap text-ink/90">{item.description}</p>
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-2">
            <div>
              <h3 className="label">Categorie</h3>
              {item.categories?.length ? (
                <ul className="flex flex-wrap gap-1.5">{item.categories.map((c) => <li key={c} className="chip">{c}</li>)}</ul>
              ) : <p className="text-sm text-muted">Nessuna</p>}
            </div>
            <div>
              <h3 className="label">Tag</h3>
              {item.tags?.length ? (
                <ul className="flex flex-wrap gap-1.5">{item.tags.map((t) => <li key={t} className="chip">#{t}</li>)}</ul>
              ) : <p className="text-sm text-muted">Nessuno</p>}
            </div>
          </section>

          {/* Inferenze AI: sempre etichettate e da confermare */}
          {item.ai ? (
            <section className="rounded-2xl border border-ai/30 bg-ai/5 p-3.5">
              <div className="flex items-center justify-between">
                <AiBadge>{item.ai.applied ? "Categorie e tag assegnati dall'AI · da verificare" : "Generato dall'AI · da verificare"}</AiBadge>
                {ai && (
                  <button type="button" className="text-sm font-medium text-ai" disabled={!!busy} onClick={() => run("classify", () => archive.classify(item))}>
                    {busy === "classify" ? "…" : "Rigenera"}
                  </button>
                )}
              </div>
              {item.ai.summary ? <p className="mt-2 text-sm">{item.ai.summary}</p> : <p className="mt-2 text-sm text-muted">Dati insufficienti per un riassunto.</p>}
              {points.length > 0 && (
                <div className="mt-3">
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Punti chiave</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {points.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
              {entities.length > 0 && (
                <div className="mt-3">
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Persone, luoghi e altro</h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {entities.map((e, i) => (
                      <li key={i} className="chip">{e.name}{typeof e.kind === "string" && e.kind && e.kind !== "altro" ? <span className="text-muted"> · {e.kind}</span> : null}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(aiCats.length > 0 || aiTags.length > 0) && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-muted">Proposte (tocca per aggiungere):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {aiCats.map((c) => (
                      <button key={`c-${c}`} type="button" className="chip" onClick={() => acceptAi([c], [])}>+ {c}</button>
                    ))}
                    {aiTags.map((t) => (
                      <button key={`t-${t}`} type="button" className="chip" onClick={() => acceptAi([], [t])}>+ #{t}</button>
                    ))}
                  </div>
                  <button type="button" className="mt-2 text-sm font-medium text-ai" onClick={() => acceptAi(aiCats, aiTags)}>
                    <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Accetta tutte
                  </button>
                </div>
              )}
            </section>
          ) : ai && item.status !== "processing" ? (
            <button type="button" className="btn-ghost w-full text-ai" disabled={!!busy} onClick={() => run("classify", () => archive.classify(item))}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> {busy === "classify" ? "Analizzo…" : "Proponi categorie e tag con l'AI"}
            </button>
          ) : null}

          {item.url && item.type !== "file" && (
            <details className="card p-3.5" open={!item.extracted_text || item.text_source === TRANSCRIPT_SOURCE}>
              <summary className="cursor-pointer font-medium">Trascrizione del video</summary>
              <p className="mt-2 text-sm text-muted">
                Reel, TikTok, video di Facebook e YouTube vengono trascritti in automatico dal link, e i caroselli letti slide per slide (solo post pubblici). Se non è stato possibile, premi Rianalizza oppure incolla qui il testo.
              </p>
              <label htmlFor="transcript" className="sr-only">Testo della trascrizione</label>
              <textarea id="transcript" className="input mt-2 min-h-[110px]" placeholder="Incolla la trascrizione…" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
              <button type="button" className="btn-ghost mt-2 w-full" disabled={!!busy || !transcript.trim()} onClick={saveTranscript}>
                {busy === "transcript" ? "Salvo…" : "Salva trascrizione"}
              </button>
            </details>
          )}

          {item.extracted_text && (
            <details className="card p-3.5">
              <summary className="cursor-pointer font-medium">
                Testo estratto <span className="text-sm font-normal text-muted">· fonte: {item.text_source || "sconosciuta"} · {item.extracted_text.length.toLocaleString("it-IT")} caratteri</span>
              </summary>
              <p className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap text-sm text-ink/90">{item.extracted_text}</p>
            </details>
          )}

          {error && <ErrorBox>{error}</ErrorBox>}

          <footer className="space-y-1 border-t border-line pt-4 text-xs text-muted">
            {item.final_url && item.final_url !== item.url && <p className="break-all">Indirizzo finale: {item.final_url}</p>}
            {item.processed_at && <p>Analizzato il {formatDate(item.processed_at, true)}</p>}
            <button type="button" className="btn-danger mt-3 w-full" onClick={remove} disabled={!!busy}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Elimina
            </button>
          </footer>
        </article>
      </Page>
    </>
  );
}

function EditForm({ item, archive, onDone }) {
  const [title, setTitle] = useState(item.title || "");
  const [note, setNote] = useState(item.note || "");
  const [description, setDescription] = useState(item.description || "");
  const [type, setType] = useState(item.type);
  const [categories, setCategories] = useState(item.categories || []);
  const [tags, setTags] = useState(item.tags || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await archive.update(item.id, { title: title.trim() || null, note: note.trim() || null, description: description.trim() || null, type, categories, tags });
      onDone();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <>
      <TopBar title="Modifica" onBack={onDone} />
      <Page>
        <form onSubmit={save} className="space-y-5">
          <div>
            <label htmlFor="ed-title" className="label">Titolo</label>
            <input id="ed-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
          </div>
          <div>
            <label htmlFor="ed-type" className="label">Tipo</label>
            <select id="ed-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ed-note" className="label">La tua nota</label>
            <textarea id="ed-note" className="input min-h-[110px]" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ed-desc" className="label">Descrizione</label>
            <textarea id="ed-desc" className="input min-h-[90px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <ChipEditor label="Categorie" values={categories} onChange={setCategories} suggestions={archive.categories} placeholder="Scegli o scrivi e premi Invio" />
          <ChipEditor label="Tag" values={tags} onChange={setTags} lowercase suggestions={item.ai?.tags || []} placeholder="Scrivi e premi Invio" />
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost" onClick={onDone}>Annulla</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Salvo…" : "Salva modifiche"}</button>
          </div>
        </form>
      </Page>
    </>
  );
}
