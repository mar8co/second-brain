# Second Brain

Archivio personale per iPhone (PWA in italiano): salvi in pochi secondi link, Reel, video, posti, note, idee per acquisti, immagini e file, e li ritrovi con ricerca, filtri e domande in linguaggio naturale. Le risposte usano **solo** i tuoi elementi e citano le fonti.

- Ogni elemento conserva sempre il **link originale** e mostra cosa l'app è riuscita, o non è riuscita, a leggere.
- I dati letti dalla fonte (titolo, descrizione, testo) restano separati dalle **inferenze dell'AI** (riassunto, categorie e tag proposti), che sono etichettate e vanno confermate.
- Senza chiave AI l'app funziona lo stesso come archivio con ricerca e filtri.

## Architettura

```
iPhone (PWA: React + Vite + Tailwind)
 ├─ ricerca e filtri ........ nel browser, sugli elementi già caricati
 ├─ supabase-js ............. Supabase: Postgres + Auth + Storage (RLS per utente)
 └─ fetch /api/* ............ funzioni Vercel (api/*) → core condiviso (server/*)
      ├─ /api/extract ....... legge un link (solo dati pubblici, anti-SSRF)
      └─ /api/ai ............ Google Gemini (chiave solo sul server)
```

È la stessa impostazione di Dispensa: in sviluppo `npm run dev` serve gli stessi endpoint `/api/*` con un middleware di Vite che usa il codice di `server/*`.

| Cartella | Contenuto |
|---|---|
| `src/views` | schermate: Home, Archivio, Aggiungi, Scheda, Chiedi, Impostazioni, Accesso |
| `src/lib` | logica pura e testata: ricerca, riconoscimento link, modello dati, file, archivi (`store/local.js`, `store/remote.js`) |
| `server` | lettura dei link (`extract.js`, `net.js`, `html.js`), AI (`ai.js`), autorizzazione (`auth.js`) |
| `api` | funzioni Vercel, involucri sottili su `server/*` |
| `supabase/schema.sql` | tabella, regole RLS, bucket privato dei file |
| `tests/e2e` | test Playwright con pagine e Gemini finti |

### Due modalità

- **Sincronizzata** (consigliata): con `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configurate. Dati su Supabase, accesso con email e password, stessi dati su ogni dispositivo.
- **Locale**: se mancano le variabili Supabase. Dati solo nel browser (IndexedDB), **niente sincronizzazione e niente backup**: cancellando i dati del sito si perde tutto. In Impostazioni c'è "Esporta archivio" (JSON, senza i file). Utile per provare l'app in locale; in produzione gli endpoint `/api` rifiutano le richieste senza Supabase.

## Avvio in locale

Requisiti: Node 22.

```bash
npm install
cp .env.example .env.local   # lascia vuoto per la modalità locale
npm run dev                  # http://127.0.0.1:5173
```

Per provarlo sull'iPhone nella stessa rete: `npx vite --host` e apri l'indirizzo IP del computer (alcune funzioni, come gli appunti, richiedono HTTPS e quindi funzionano solo dopo la pubblicazione).

## Configurazione

### 1. Supabase (gratuito)

1. Crea un progetto su [supabase.com](https://supabase.com).
2. **SQL Editor** → incolla ed esegui `supabase/schema.sql` (si può rieseguire senza perdere dati). Crea la tabella `items`, le regole RLS e il bucket privato `files` (15 MB per file, solo immagini, PDF e testo).
3. **Authentication → Users → Add user**: crea il tuo utente con email e password.
4. **Authentication → Sign In / Providers → Email**: disattiva **"Allow new users to sign up"**. L'app non ha una pagina di registrazione, ma così nessuno può creare un account tramite l'API.
5. **Project Settings → API**: copia `Project URL` e la chiave `anon`/publishable. La chiave `service_role` **non serve** e non va messa da nessuna parte.

### 2. Vercel (gratuito)

1. Importa il repository su Vercel (preset Vite, rilevato da `vercel.json`).
2. Variabili d'ambiente:

| Variabile | Dove finisce | Obbligatoria |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | nel bundle del client (pubbliche per design, protette da RLS) | sì, per la modalità sincronizzata |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | solo funzioni `/api` (verificano il token di sessione) | sì |
| `GEMINI_API_KEY` | solo funzioni `/api` | no: senza, niente AI |
| `APIFY_TOKEN` | solo funzioni `/api` | no: senza, i Reel, i TikTok, i video di Facebook e i caroselli non vengono trascritti né letti dal link (vedi "Trascrizione dal link") |
| `GEMINI_MODEL` | solo funzioni `/api` | no (default `gemini-3.5-flash-lite`; se non disponibile per la chiave si prova `gemini-3.8-flash`, poi `gemini-3.6-flash`) |
| `ALLOWED_EMAILS` | solo funzioni `/api`, elenco separato da virgole | no, consigliata: limita `/api` alla tua email |

Non impostare mai `EXTRACT_ALLOW_PRIVATE`, `GEMINI_API_BASE` né `APIFY_API_BASE` in produzione: esistono solo per i test.

3. Apri l'indirizzo su iPhone in Safari → Condividi → **Aggiungi alla schermata Home**.

### 3. Gemini (facoltativo)

Crea una chiave su [Google AI Studio](https://aistudio.google.com/apikey) e mettila in `GEMINI_API_KEY` su Vercel (o in `.env.local` in sviluppo). Viene usata per:

- rielaborare ogni elemento in una **scheda di memoria** dopo il salvataggio (riassunto, punti chiave, persone e luoghi citati, parole chiave anche sinonime, categorie e tag; disattivabile in Impostazioni). Con l'app aperta, gli elementi senza scheda (AI non riuscita al salvataggio) o con una scheda di versione precedente vengono rielaborati da soli, uno alla volta (`src/lib/memory.js`). Allo stesso modo vengono riletti i post rimasti "in elaborazione" da più di 10 minuti, quelli salvati prima della trascrizione dal link (solo didascalia) e quelli la cui lettura non è riuscita per un motivo momentaneo: al massimo 3 volte per elemento su ogni dispositivo, perché ogni lettura usa i crediti gratuiti di Apify. Nelle riletture di elementi che hanno già una scheda, categorie e tag dell'AI restano proposte;
- rispondere alle domande in "Chiedi";
- trascrivere i video e leggere le slide dei caroselli.

### 4. Apify (facoltativo, per Reel, TikTok, Facebook e caroselli)

Instagram, TikTok e Facebook mostrano video e immagini solo dentro le loro app. Per averli a partire dal link, il server usa [Apify](https://apify.com), un servizio esterno con piano gratuito (5 $ di crediti al mese, senza carta di credito, al momento della scrittura):

1. Crea un account gratuito su apify.com.
2. In **Settings → API & Integrations** copia il **Personal API token**.
3. Su Vercel → progetto → **Settings → Environment Variables** aggiungi `APIFY_TOKEN` con quel valore, poi rifai il deploy (Deployments → ··· → Redeploy).

Il token resta solo sul server. Quando i crediti del mese finiscono, la scheda lo dice e si ricaricano il mese dopo: nessun addebito. Apify legge solo post pubblici; il rispetto dei termini dei social nella lettura dipende da Apify e dall'uso personale che ne fai.

**Costi e limiti:** l'API Gemini ha un piano gratuito con limiti di richieste e condizioni decise da Google, che possono cambiare; oltre i limiti, o con un account a pagamento, l'uso può costare. L'app non promette un servizio AI gratuito né illimitato. Sul piano gratuito Google può usare i dati inviati per migliorare i propri servizi: leggi i termini prima di salvare contenuti sensibili.

## Come funziona

### Aggiungere

Schermata **Aggiungi** con tre modalità: **Link**, **Nota**, **File** (immagini, PDF, testo, max 15 MB). Titolo, nota, tipo, categorie e tag sono facoltativi. Il salvataggio è immediato; la lettura del link avviene dopo, mentre la scheda mostra "In elaborazione".

### Stati di elaborazione

| Stato | Significato |
|---|---|
| Salvato | conservato così com'è (note, immagini) o lettura non eseguita (es. offline: si può rianalizzare) |
| In elaborazione | lettura del link in corso |
| Analizzato | testo e metadati letti dalla fonte |
| Analisi parziale | letti solo titolo/descrizione, o file remoto non letto: la scheda spiega cosa manca |
| Non accessibile | la fonte richiede login, risponde con errore o non esiste |

### Lettura dei link (`/api/extract`)

- Pagine web: titolo, descrizione e immagine Open Graph, più il testo principale (Mozilla Readability). Il campo "fonte del testo" dice da dove arriva.
- YouTube, Vimeo, TikTok: titolo e autore tramite oEmbed pubblico.
- Reel e post Instagram, TikTok, video di Facebook, YouTube e Shorts: trascrizione e lettura delle slide, vedi sotto.
- Google Maps e Apple Mappe: nome e coordinate letti dal link (anche dai link corti `maps.app.goo.gl`, seguendo i redirect). Orari e recensioni non vengono letti.
- File di testo remoti letti; PDF e immagini remoti solo salvati (caricali come file per estrarne il testo).

### Trascrizione dal link (Reel, TikTok, Facebook, YouTube, caroselli)

Basta il link, dall'app o dal Comando Rapido (`server/social.js`):

1. **Apify** (con `APIFY_TOKEN`) legge il post pubblico e restituisce didascalia, autore e indirizzi dei media: il video, oppure le immagini di ogni slide del carosello. Per TikTok, se ci sono, anche i sottotitoli.
2. Il server scarica i media e **Gemini** trascrive il parlato del video (e il testo in sovrimpressione) oppure legge il testo di ogni slide, nell'ordine. Se un TikTok ha i sottotitoli, si usano quelli senza AI.
3. YouTube e Shorts non passano da Apify: Gemini guarda il video pubblico dal link (funzione ufficiale dell'API).

Il testo finisce in "Testo estratto" con la fonte ("trascrizione dell'AI", "testo delle slide letto dall'AI" o "sottotitoli del video"), poi l'AI assegna titolo, categorie e tag. I media non vengono conservati. Un video può richiedere fino a qualche minuto: le function hanno una durata massima di 300 secondi (`vercel.json`, con Fluid compute). Anche quando il link è salvato dall'app (modalità sincronizzata) la lettura prosegue sul server (`server/read.js`), che scrive il risultato con il token dell'utente: si può chiudere l'app.

Limiti: solo post pubblici; un post privato, rimosso o non disponibile risulta "Non accessibile" con il motivo. Nei caroselli le slide video vengono lette solo come immagine (il parlato no) e si leggono al massimo 20 slide; dei video molto lunghi si trascrive solo la prima parte: in tutti questi casi lo stato è "Analisi parziale" e la scheda dice cosa manca. Senza `APIFY_TOKEN` si legge solo quello che la pagina espone pubblicamente (spesso nulla per Instagram) e la scheda dice cosa manca. L'app non usa il tuo account, non manda i tuoi cookie e non aggira login o CAPTCHA.

Alternative quando il link non basta: condividere il file del video o gli screenshot delle slide con il Comando Rapido (vedi sotto), oppure incollare una trascrizione nella scheda.

Insieme al testo si salvano **chi ha pubblicato il post** (`author`, es. "Mario Rossi (@mario.ai)"), **quando** (`published_at`) e il **luogo** indicato nel post (Instagram, solo il nome). L'AI ne fa una scheda di memoria: chi propone cosa, date, prezzi, consigli, profili citati. Una nota scritta al salvataggio ("esercizi per la schiena") resta comunque utile.

### Ricerca e domande

- **Ricerca** nel browser su titolo, autore, tag, categorie, descrizione, nota, nome del posto, URL, scheda dell'AI (riassunto, punti chiave, persone, parole chiave) e testo estratto, ignorando accenti e con riconoscimento semplice di singolare/plurale. **Filtri** per tipo, stato, categoria, tag e intervallo di date.
- **Chat (come NotebookLM)**: la schermata principale è solo una conversazione con la propria memoria; i contenuti salvati stanno in Archivio (un link incollato nella chat viene salvato lì). Se tutto l'archivio ci sta (circa 240.000 caratteri), Gemini ne riceve il **contenuto completo** (didascalie, trascrizioni, testi, fino a 12.000 caratteri per elemento). Altrimenti prima sceglie dalle **schede brevi** di tutto l'archivio quali elementi leggere per intero (azione `select`), poi risponde con il contenuto completo di quelli (fino a 10, insieme alle fonti della risposta precedente e agli elementi con le parole della domanda) e le schede degli altri. La risposta usa esclusivamente questi dati, cita le fonti nel testo con [1], [2] e per ogni fonte riporta un breve passaggio copiato dal contenuto: il server rinumera le citazioni, scarta le fonti che non erano tra quelle inviate e tiene un passaggio solo se si trova davvero nel testo. Le domande di seguito ("e quanto costa?") portano con sé gli ultimi turni della conversazione (fino a 4, dell'ultima ora). Se le informazioni non bastano lo dice. Senza AI vengono mostrati gli elementi più pertinenti per parole.

### Aspetto

La grafica segue le linee guida comuni delle app di Marco (stile "manifesto svizzero"). In breve:

- carattere Inter Tight, titoli enormi a peso 800, inchiostro nero sui colori pieni;
- un colore per schermata, che colora anche la barra di stato: Chat rosa, Archivio bianco, Mappa verde, Impostazioni giallo. Ogni elemento ha il suo colore fisso, nella riga dell'Archivio e nella sua scheda;
- barra in basso a pillola nera, righe sottili al posto delle scatole, pillole e cerchi;
- niente sfumature né sfocature, niente finestre del sistema: le conferme sono schede dell'app e le eliminazioni si annullano dall'avviso "Annulla";
- l'icona è un cervello nero su quadrato rosa (`public/icon.svg`; PNG con `npm run icons`).

I token sono in `src/index.css` e `tailwind.config.js`, i colori delle pagine in `src/lib/colors.js`.

### Mappa

La terza scheda mostra su una cartina i posti salvati:

- i link di Google Maps o Apple Maps, con le coordinate lette dal link;
- i posti citati nei contenuti (ristoranti, bar, musei… di un Reel), che l'AI elenca nella scheda di memoria (`ai.places`).

Per i posti senza coordinate la posizione si cerca dal nome e dall'indirizzo con OpenStreetMap (Nominatim, gratuito, senza chiave) tramite `/api/geo`, uno alla volta e al massimo uno al secondo, solo mentre la Mappa è aperta. Il risultato, anche "non trovato", si salva nell'elemento e non si cerca più. Queste posizioni sono approssimative e l'app lo dice. La cartina usa le tessere ufficiali di OpenStreetMap (gratuite, senza chiave, con l'attribuzione); CARTO non va usata perché ora chiede una chiave. "Vicino a me" usa la posizione del telefono solo nel browser, e "Indicazioni" apre Mappe di Apple su iPhone.

## Modello dei dati

Tabella `items` (vedi `supabase/schema.sql`; la modalità locale usa la stessa forma):

| Campo | Contenuto |
|---|---|
| `id`, `user_id` | identificativi (RLS: ognuno vede solo le sue righe) |
| `type` | `link`, `social`, `video`, `place`, `note`, `shopping`, `image`, `file` |
| `url`, `final_url` | link originale e indirizzo finale dopo i redirect |
| `title`, `description`, `note` | titolo; descrizione dalla fonte o tua; la tua nota |
| `site_name`, `image_url` | nome del sito e immagine di anteprima (dalla fonte) |
| `extracted_text`, `text_source` | testo letto (max 20.000 caratteri) e da dove arriva |
| `place` | `{ name, lat, lng }` per i posti |
| `categories`, `tags` | scelti o confermati da te |
| `status`, `status_detail` | stato di elaborazione e spiegazione |
| `author`, `published_at` | chi ha pubblicato il post e quando (dalla fonte) |
| `ai` | scheda di memoria dell'AI: `{ v, summary, points, entities, keywords, categories, tags, model, generated_at, applied }` |
| `file_path`, `file_name`, `file_mime`, `file_size` | file nel bucket privato `files/<user_id>/<id>/…` |
| `created_at`, `updated_at`, `processed_at` | date di acquisizione, modifica, analisi |

## Privacy e sicurezza

- **Dove stanno i dati:** sul tuo progetto Supabase (database e file privati) oppure, in modalità locale, solo nel browser.
- **Cosa esce verso servizi esterni:** per leggere un link, il server Vercel apre quell'indirizzo; i link dei social (solo l'indirizzo del post) vanno ad Apify, se configurato; con l'AI attiva, titolo, note, estratti e i media da trascrivere vengono inviati a Google Gemini, le immagini e i PDF scansionati caricati dall'app vengono letti da Gemini, e ogni domanda nella chat invia il contenuto degli elementi salvati (tutto l'archivio se ci sta, altrimenti i più pertinenti per intero e una scheda breve degli altri, note comprese). Nient'altro.
- **Chiavi:** nessuna chiave segreta nel client o nel repository. Nel bundle ci sono solo URL e chiave anon di Supabase, che senza login non danno accesso a nulla (RLS).
- **Endpoint protetti:** `/api/extract` e `/api/ai` richiedono il token di sessione Supabase valido (401 altrimenti); facoltativamente solo per le email in `ALLOWED_EMAILS`.
- **Lettura dei link sicura:** solo http/https su porte standard, nessun indirizzo privato o locale (controllato a ogni redirect), timeout di 8 secondi, massimo 2 MB letti. Limite noto: un dominio potrebbe cambiare IP tra il controllo e la connessione (DNS rebinding); con endpoint dietro login è un rischio accettabile per un'app personale.
- **File:** tipo e dimensione verificati nel client e imposti dal bucket; i file si aprono con URL firmati che scadono dopo un'ora.
- **Contenuti salvati e AI:** testi di pagine web potrebbero contenere istruzioni rivolte all'AI; i prompt dicono di trattarli come dati e il server accetta solo fonti tra quelle inviate, ma un modello può comunque sbagliare: verifica sempre nelle fonti.
- **Account:** usa una password lunga e unica, disattiva le registrazioni (passo 4) e, se vuoi, attiva la MFA dalla dashboard Supabase per il tuo account Supabase.
- Non c'è un limite di richieste per utente sugli endpoint: con un solo utente autorizzato il rischio è basso; il limite vero è quello della tua chiave Gemini.

## Salvare da iPhone

Funziona oggi:

1. In Instagram (o in qualsiasi app) tocca Condividi o ··· → **Copia link**.
2. Apri Second Brain e incolla il link nella chat, oppure Archivio → **+** → **Incolla** (iOS chiede il permesso di incollare).

L'app accetta anche indirizzi già compilati, pensati per Comandi Rapidi:

- `https://<tuo-dominio>/aggiungi?url=<link>`
- `https://<tuo-dominio>/aggiungi?text=<testo condiviso>`: se il testo contiene un link, il link viene estratto e il resto diventa la nota;
- `&title=<titolo>` facoltativo.

### Salvataggio in background (consigliato, da verificare su dispositivo)

Il Comando invia il link a `POST /api/share` e **non apre l'app**: l'elemento viene salvato subito, poi il server legge il link e, se `GEMINI_API_KEY` è configurata, assegna riassunto, categorie e tag (marcati "assegnati dall'AI · da verificare"). Su Vercel il lavoro continua dopo la risposta grazie a `waitUntil`.

1. In Second Brain: Impostazioni → **Salvataggio rapido da iPhone** → **Crea codice** e copialo. Nel database resta solo il suo hash SHA-256; si può rigenerare o disattivare.
2. App Comandi → nuovo comando → ⓘ: attiva **Mostra nel foglio di condivisione** (tipi: URL e Testo).
3. Azione **Ottieni contenuti di URL**: URL `https://<tuo-dominio>/api/share`; in "Mostra di più" Metodo **POST**, Corpo richiesta **JSON** con due campi Testo: `token` = il codice, `text` = **Input comando rapido**.
4. Azione **Mostra notifica** con **Contenuti dell'URL**: mostra "Link salvato in Second Brain…" oppure il motivo dell'errore.

### Video e caroselli inviati come file (alternativa, da verificare su dispositivo)

Di solito basta il link (vedi "Trascrizione dal link"). Per i post che dal link non si leggono, `POST /api/share` accetta anche un corpo **Modulo** (`multipart/form-data`) con `token` e uno o più `file`:

- **video**: il Comando estrae solo l'audio (**Codifica contenuti multimediali → Solo audio**) e lo invia; Gemini lo trascrive parola per parola;
- **carosello**: gli screenshot delle slide, ridimensionati, convertiti in JPEG e uniti con **Crea PDF**; Gemini legge il testo slide per slide.

Il testo finisce in "Testo estratto" (fonte: trascrizione dell'AI), poi l'AI assegna titolo, categorie e tag. I file non vengono conservati. Limite: 4 MB per invio (limite delle function Vercel). Le istruzioni passo passo sono in Impostazioni → Salvataggio rapido.

Richiede la modalità sincronizzata e le funzioni SQL `share_save`/`share_update` di `supabase/schema.sql` (verificano il codice e scrivono solo negli elementi del suo proprietario; il linter di Supabase le segnala come "SECURITY DEFINER eseguibili da anon": è voluto, l'accesso è protetto dal codice).

### Comando Rapido che apre l'app (alternativa)

1. App Comandi → nuovo comando → Dettagli: attiva **Mostra nel foglio di condivisione**, tipi accettati: URL e Testo.
2. Azione **Codifica URL** sull'input del comando.
3. Azione **Testo**: `https://<tuo-dominio>/aggiungi?text=` seguito da **Testo codificato URL**.
4. Azione **Apri URL** con il Testo.

iOS apre il link in Safari, non sempre nella PWA installata: in modalità sincronizzata basta aver fatto l'accesso anche in Safari.

**Web Share Target API** (comparire direttamente nel foglio Condividi): non è implementata. Safari su iOS non la supporta per le PWA; su Android Chrome sì, e si potrebbe aggiungere un `share_target` nel manifest che punti a `/aggiungi`. Non va considerata funzionante finché non è implementata e provata.

## Test

```bash
npm run lint       # ESLint
npm test           # Vitest: 81 test su ricerca, link, modello dati, lettura pagine, anti-SSRF, AI
npm run build      # build di produzione + service worker
npm run test:e2e   # Playwright (Chromium, viewport iPhone, modalità locale, pagine e Gemini finti)
```

I test end-to-end coprono: salvataggio di note, link e file; persistenza dopo il ricaricamento; stati "Analizzato" e "Non accessibile"; proposte AI da accettare; ricerca, filtri e domanda con fonti; risposta "non trovo nulla"; indirizzo `?text=` per Comandi Rapidi; validazione di file e link; eliminazione.

`supabase/schema.sql` è stato verificato su PostgreSQL 16 con funzioni Supabase simulate (`auth.uid()`, `storage.foldername`): due esecuzioni consecutive, isolamento tra due utenti su righe e file, rifiuto di link non http.

**Non verificato:** l'app con un vero progetto Supabase e una vera chiave Gemini, la lettura di siti reali dal server Vercel (l'ambiente di sviluppo non aveva accesso diretto a Internet), l'installazione e l'uso su un iPhone reale, il Comando Rapido, la lettura dei post con Apify e la trascrizione dei loro video con Gemini (il formato dei dati di Apify è stato ricostruito dalla documentazione e coperto da test con dati finti).

## Limiti noti

- La trascrizione dal link funziona solo con post pubblici e con `APIFY_TOKEN` configurato; i crediti gratuiti di Apify bastano per un numero limitato di post al mese. Nessuna lettura di contenuti dietro login.
- I video più lunghi di qualche minuto possono non finire entro i 300 secondi della function: la scheda lo dice e si può rianalizzare.
- Le immagini e i PDF scansionati caricati dall'app vengono letti dall'AI (testo e descrizione) solo con l'AI attiva e l'archivio sincronizzato; in modalità locale no. Dei PDF con testo si leggono al massimo le prime 50 pagine.
- Pagine molto dinamiche (contenuto caricato da JavaScript) danno solo titolo e descrizione.
- La ricerca carica tutti gli elementi nel browser: va bene fino a qualche migliaia di elementi.
- Le domande inviano a Gemini il contenuto completo di tutto l'archivio fino a circa 240.000 caratteri; oltre, l'AI sceglie dalle schede brevi (fino a circa 200.000 caratteri, alcune centinaia di elementi) quali leggere per intero, e la chat dice quanti contenuti ha consultato se non sono tutti.
- Per i link normali (non social) letti dall'app, se chiudi l'app durante "In elaborazione" l'elemento può restare in quello stato: usa "Rianalizza".
- L'esportazione JSON non include i file caricati.
