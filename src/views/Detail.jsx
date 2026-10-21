// Scheda di un elemento: copertina, titolo, link all'originale, riepilogo dell'AI
// e categorie/tag; il resto (dati tecnici, trascrizione, testo letto) è in
// "Dettagli", chiuso. Elimina è il cestino in alto accanto a Modifica.
import { useEffect, useState } from "react";
import { CopyNote } from "../components/ItemCard.jsx";
import { Trash2 } from "lucide-react";
import { Page, Testata } from "../components/Layout.jsx";
import { AiBadge, ChipEditor, EmptyState, ErrorBox, StatusBadge, TypeIcon } from "../components/ui.jsx";
import { usePageColor } from "../hooks/usePageColor.js";
import { itemColor, PAGE } from "../lib/colors.js";
import { formatDate, typeLabel } from "../lib/format.js";
import { displayTitle } from "../lib/item.js";
import { displayHost } from "../lib/detect.js";
import { STATUSES, TYPES } from "../lib/constants.js";
import { isImage, isVideo } from "../lib/files.js";
import { useCoverUrl } from "../lib/fileurl.js";
import { TRANSCRIPT_SOURCE, unreadFile } from "../lib/enrich.js";
import { mapsUrl, restaurantsOf } from "../lib/spots.js";

export default function Detail({ id, archive, store, ai, back, navigate, toast }) {
  const item = archive.items.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const coverUrl = useCoverUrl(item);
  const [transcript, setTranscript] = useState("");
  const [openedAt] = useState(() => Date.now());
  // La scheda ha il colore dell'elemento, lo stesso della sua riga in Archivio.
  usePageColor(item ? itemColor(item) : PAGE.archive);

  useEffect(() => {
    let alive = true;
    if (item?.file_path) store.fileUrl(item).then((u) => alive && setFileUrl(u));
    return () => {
      alive = false;
    };
  }, [item?.id, item?.file_path, store]); // eslint-disable-line react-hooks/exhaustive-deps

  const luoghi = item ? restaurantsOf([item]).flatMap((r) => r.streets.map((a) => ({ r, a }))).slice(0, 12) : [];

  if (!item) {
    return (
      <Page>
        <Testata onBack={() => back("/")} />
        {archive.loading ? null : (
          <EmptyState title="Elemento non trovato" action={<button type="button" className="bottone" onClick={() => navigate("/archivio")}>Vai all'archivio</button>}>
            Potrebbe essere stato eliminato.
          </EmptyState>
        )}
      </Page>
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

  // Eliminazione subito, con "Annulla" per qualche secondo.
  const remove = () => {
    const undo = archive.removeSoon(item);
    navigate("/archivio", { replace: true });
    toast("Elemento eliminato", { action: { label: "Annulla", run: undo } });
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
  // Immagine o PDF scansionato non ancora letti dall'AI: si può riprovare.
  const canReadFile = Boolean(ai && store.mode === "sync" && unreadFile(item));

  const site = item.site_name || (item.url ? displayHost(item.url) : TYPES[item.type]?.label);
  const reprocessable = ((item.url && !item.file_path) || canReadFile) && (item.status !== "processing" || stale);

  const showVideo = item.file_path && isVideo(item.file_mime) && fileUrl;
  const cover = showVideo ? (
    <video src={fileUrl} controls playsInline preload="metadata" className="w-full rounded-[18px] bg-[#0a0a0a]" aria-label={item.title || item.file_name || "Video salvato"} />
  ) : showImage ? (
    <img src={fileUrl} alt={item.title || item.file_name || "Immagine salvata"} className="w-full rounded-[18px]" />
  ) : coverUrl ? (
    <img src={coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-80 w-full rounded-[18px] object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
  ) : null;
  // Lo stato spiega cosa è andato storto solo quando qualcosa non è andato bene.
  const problem = item.status !== "analyzed" && item.status !== "saved";

  return (
    <Page>
      <Testata
        onBack={() => back("/")}
        right={
          <>
            <button type="button" className="pillola" onClick={() => setEditing(true)}>
              Modifica
            </button>
            <button type="button" className="tondo !border-[#e02a0d] !bg-[#e02a0d] text-white" aria-label="Elimina" onClick={remove} disabled={!!busy}>
              <Trash2 className="h-[17px] w-[17px]" strokeWidth={2.4} aria-hidden="true" />
            </button>
          </>
        }
      />
      <article>
        {cover && <div className="mb-4">{cover}</div>}
        <header>
          <p className="micro flex items-center gap-1.5 font-semibold">
            <TypeIcon type={item.type} className="h-3.5 w-3.5" />
            <span className="truncate">{site}</span>
          </p>
          <h1 className="titolo-scheda mt-1.5">{displayTitle(item)}</h1>
          {(item.author || item.published_at) && (
            <p className="mt-2 font-semibold">
              {item.author && <>Pubblicato da <span className="font-extrabold">{item.author}</span></>}
              {item.published_at && <>{item.author ? " il " : "Pubblicato il "}{formatDate(item.published_at)}</>}
            </p>
          )}
        </header>

        {/* Lo stato in piccolo; la spiegazione solo se la lettura non è riuscita. */}
        <section aria-live="polite" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.92rem] font-semibold">
          <StatusBadge status={item.status} />
          {problem && <p className="order-last basis-full font-medium leading-snug">{item.status_detail || status.hint}</p>}
          {reprocessable && (
            <button type="button" className="link" disabled={!!busy} onClick={() => run("reprocess", () => archive.reprocess(item))}>
              {busy === "reprocess" ? "Rianalizzo…" : "Rianalizza"}
            </button>
          )}
        </section>

        <div className="mt-5 space-y-3">
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="bottone largo">
              Apri l'originale <span aria-hidden="true">→</span>
            </a>
          )}
          {item.file_path && !isImage(item.file_mime) && (
            <a href={fileUrl || "#"} target="_blank" rel="noopener noreferrer" className="bottone chiaro largo" aria-disabled={!fileUrl}>
              Apri {item.file_name}
            </a>
          )}
        </div>

        {/* I locali citati con la via, uno per riga: nome · via, link a Maps. La
            località generica di un Reel ("Rome, Italy") non si mostra. */}
        {luoghi.length > 0 && (
          <ul className="righe mt-2 text-left text-[0.9rem] leading-snug">
            {luoghi.map(({ r, a }) => (
              <li key={`${r.key}|${a}`}>
                <a href={mapsUrl(r.name, a)} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-3 py-2.5">
                  <span><b className="font-extrabold">{r.name}</b> · {a}</span>
                  <span aria-hidden="true" className="shrink-0 font-bold">↗</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        {item.note && (
          <section>
            <h2 className="sezione !items-center">La tua nota <CopyNote text={item.note} /></h2>
            <p className="whitespace-pre-wrap text-[1.05rem] font-semibold leading-[1.38]">{item.note}</p>
          </section>
        )}

        {/* Riepilogo dell'AI: sempre etichettato e da verificare */}
        {item.ai ? (
          <section>
            <h2 className="sezione">Riepilogo</h2>
            <AiBadge>{item.ai.applied ? "Categorie e tag assegnati dall'AI · da verificare" : "Generato dall'AI · da verificare"}</AiBadge>
            {item.ai.summary ? <p className="mt-2.5 font-medium leading-snug">{item.ai.summary}</p> : <p className="mt-2.5 font-medium text-tenue">Dati insufficienti per un riassunto.</p>}
            {points.length > 0 && (
              <div className="mt-4">
                <h3 className="micro mb-1 font-semibold">Punti chiave</h3>
                <ul className="righe">
                  {points.map((p, i) => <li key={i} className="py-1.5 font-semibold leading-snug">{p}</li>)}
                </ul>
              </div>
            )}
          </section>
        ) : ai && item.status !== "processing" ? (
          <button type="button" className="bottone chiaro largo mt-6" disabled={!!busy} onClick={() => run("classify", () => archive.classify(item))}>
            {busy === "classify" ? "Analizzo…" : "Proponi categorie e tag con l'AI"}
          </button>
        ) : null}

        {/* Categorie e tag senza titolo; le proposte dell'AI sono pillole da toccare. */}
        {(item.categories?.length > 0 || item.tags?.length > 0 || aiCats.length > 0 || aiTags.length > 0) && (
          <section className="mt-5">
            <ul className="flex flex-wrap gap-1.5" aria-label="Categorie e tag">
              {(item.categories || []).map((c) => <li key={c} className="pillola attiva">{c}</li>)}
              {(item.tags || []).map((t) => <li key={t} className="pillola">#{t}</li>)}
            </ul>
            {(aiCats.length > 0 || aiTags.length > 0) && (
              <div className="mt-3">
                <p className="micro mb-1.5 font-semibold">Proposte dell'AI (tocca per aggiungere)</p>
                <div className="flex flex-wrap gap-1.5">
                  {aiCats.map((c) => (
                    <button key={`c-${c}`} type="button" className="pillola" onClick={() => acceptAi([c], [])}>+ {c}</button>
                  ))}
                  {aiTags.map((t) => (
                    <button key={`t-${t}`} type="button" className="pillola" onClick={() => acceptAi([], [t])}>+ #{t}</button>
                  ))}
                </div>
                <button type="button" className="link mt-1" onClick={() => acceptAi(aiCats, aiTags)}>
                  Accetta tutte
                </button>
              </div>
            )}
          </section>
        )}

        {error && <div className="mt-4"><ErrorBox>{error}</ErrorBox></div>}

        {/* Il resto, chiuso: dati tecnici, descrizione, trascrizione e testo letto. */}
        <details className="group mt-6 border-y-[1.5px] border-inchiostro">
          <Riassunto>Dettagli</Riassunto>
          <div className="space-y-5 pb-5">
            <div className="griglia-dati">
              <div className="min-w-0">
                <span className="micro mb-1 block">Tipo</span>
                <b className="truncate">{typeLabel(item.type)}</b>
              </div>
              <div className="min-w-0">
                <span className="micro mb-1 block">Salvato il</span>
                <b className="num">{formatDate(item.created_at)}</b>
              </div>
              {item.processed_at && (
                <div className="min-w-0">
                  <span className="micro mb-1 block">Analizzato il</span>
                  <b className="num">{formatDate(item.processed_at, true)}</b>
                </div>
              )}
            </div>
            {item.url && <p className="micro break-all">{item.final_url && item.final_url !== item.url ? `Indirizzo finale: ${item.final_url}` : item.url}</p>}

            {item.description && (
              <div>
                <h3 className="micro mb-1 font-semibold">Descrizione {item.text_source && item.text_source !== "inserito da te" ? "(dalla fonte)" : ""}</h3>
                <p className="whitespace-pre-wrap font-medium leading-snug">{item.description}</p>
              </div>
            )}

            {entities.length > 0 && (
              <div>
                <h3 className="micro mb-1.5 font-semibold">Persone, luoghi e altro</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {entities.map((e, i) => (
                    <li key={i} className="cartellino text-[0.78rem]">{e.name}{typeof e.kind === "string" && e.kind && e.kind !== "altro" ? <span className="font-medium opacity-70">· {e.kind}</span> : null}</li>
                  ))}
                </ul>
              </div>
            )}

            {item.url && item.type !== "file" && (
              <div>
                <h3 className="micro mb-1 font-semibold">Trascrizione del video</h3>
                <p className="text-[0.92rem] font-medium leading-snug text-tenue">
                  Reel, TikTok, video di Facebook e YouTube vengono trascritti in automatico dal link, e i caroselli letti slide per slide (solo post pubblici). Se non è stato possibile, premi Rianalizza oppure incolla qui il testo.
                </p>
                <label htmlFor="transcript" className="sr-only">Testo della trascrizione</label>
                <textarea id="transcript" className="campo mt-2 min-h-[110px]" placeholder="Incolla la trascrizione…" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
                <button type="button" className="bottone chiaro largo mt-3" disabled={!!busy || !transcript.trim()} onClick={saveTranscript}>
                  {busy === "transcript" ? "Salvo…" : "Salva trascrizione"}
                </button>
              </div>
            )}

            {item.extracted_text && (
              <div>
                <h3 className="micro mb-1 font-semibold">
                  Testo estratto · fonte: {item.text_source || "sconosciuta"} · <span className="num">{item.extracted_text.length.toLocaleString("it-IT")}</span> caratteri
                </h3>
                <p className="max-h-[50vh] overflow-auto whitespace-pre-wrap text-[0.92rem] font-medium leading-snug">{item.extracted_text}</p>
              </div>
            )}

            {item.ai && ai && (
              <button type="button" className="link" disabled={!!busy} onClick={() => run("classify", () => archive.classify(item))}>
                {busy === "classify" ? "Rigenero…" : "Rigenera il riepilogo"}
              </button>
            )}
          </div>
        </details>
      </article>
    </Page>
  );
}

// Riga che apre e chiude una parte lunga: "+" chiusa, "−" aperta.
function Riassunto({ children }) {
  return (
    <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 py-2 font-extrabold tracking-[-0.02em] [&::-webkit-details-marker]:hidden">
      <span>{children}</span>
      <span aria-hidden="true" className="text-[1.3rem] font-bold leading-none">
        <span className="group-open:hidden">+</span>
        <span className="hidden group-open:inline">−</span>
      </span>
    </summary>
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
    <Page>
      <Testata onBack={onDone} />
      <h1 className="titolo-home">Modifica</h1>
      <form onSubmit={save} className="space-y-6">
        <div>
          <label htmlFor="ed-title" className="etichetta">Titolo</label>
          <input id="ed-title" className="campo" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} autoComplete="off" />
        </div>
        <fieldset>
          <legend className="etichetta">Tipo</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Object.entries(TYPES).map(([k, t]) => (
              <button key={k} type="button" aria-pressed={type === k} className={`pillola${type === k ? " attiva" : ""}`} onClick={() => setType(k)}>
                <TypeIcon type={k} className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="ed-note" className="etichetta">La tua nota</label>
          <textarea id="ed-note" className="campo min-h-[110px]" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ed-desc" className="etichetta">Descrizione</label>
          <textarea id="ed-desc" className="campo min-h-[90px]" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <ChipEditor label="Categorie" values={categories} onChange={setCategories} suggestions={archive.categories} placeholder="Scegli o scrivi e premi Invio" />
        <ChipEditor label="Tag" values={tags} onChange={setTags} lowercase suggestions={item.ai?.tags || []} placeholder="Scrivi e premi Invio" />
        {error && <ErrorBox>{error}</ErrorBox>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="bottone chiaro" onClick={onDone}>Annulla</button>
          <button type="submit" className="bottone" disabled={saving}>{saving ? "Salvo…" : "Salva modifiche"}</button>
        </div>
      </form>
    </Page>
  );
}
