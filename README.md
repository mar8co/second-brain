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
| `GEMINI_MODEL` | solo funzioni `/api` | no (default `gemini-3.5-flash-lite`; se non disponibile per la chiave si prova `gemini-3.8-flash`, poi `gemini-3.6-flash`) |
| `ALLOWED_EMAILS` | solo funzioni `/api`, elenco separato da virgole | no, consigliata: limita `/api` alla tua email |

Non impostare mai `EXTRACT_ALLOW_PRIVATE` né `GEMINI_API_BASE` in produzione: esistono solo per i test.

3. Apri l'indirizzo su iPhone in Safari → Condividi → **Aggiungi alla schermata Home**.

### 3. Gemini (facoltativo)

Crea una chiave su [Google AI Studio](https://aistudio.google.com/apikey) e mettila in `GEMINI_API_KEY` su Vercel (o in `.env.local` in sviluppo). Viene usata per:

- proporre riassunto, categorie e tag dopo il salvataggio (disattivabile in Impostazioni);
- rispondere alle domande in "Chiedi".

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
- YouTube, Vimeo, TikTok: titolo e autore tramite oEmbed pubblico. **I video non vengono trascritti**: non esiste un modo pubblico e consentito per ottenere le trascrizioni dei video altrui senza accesso.
- Google Maps e Apple Mappe: nome e coordinate letti dal link (anche dai link corti `maps.app.goo.gl`, seguendo i redirect). Orari e recensioni non vengono letti.
- File di testo remoti letti; PDF e immagini remoti solo salvati (caricali come file per estrarne il testo).

### Limiti dell'analisi dei Reel Instagram

Instagram mostra i contenuti solo a chi ha fatto l'accesso. L'app **non** usa il tuo account, non manda cookie, non si spaccia per un browser o per il crawler di altri e non aggira login o CAPTCHA. Di conseguenza:

- nella maggior parte dei casi il Reel risulta **"Non accessibile"**: resta il link, apribile con "Apri l'originale";
- se Instagram espone pubblicamente la didascalia nei metadati, viene salvata come **"Analisi parziale"**;
- audio e video non vengono mai analizzati.

Per ritrovare un Reel, scrivi una nota al momento del salvataggio ("esercizi per la schiena", "ristorante a Lisbona"): la ricerca e le domande la usano.

### Ricerca e domande

- **Ricerca** nel browser su titolo, tag, categorie, descrizione, nota, nome del posto, URL, riassunto AI e testo estratto, ignorando accenti e con riconoscimento semplice di singolare/plurale. **Filtri** per tipo, stato, categoria, tag e intervallo di date.
- **Chiedi**: l'app cerca gli elementi pertinenti (massimo 12) e solo quelli vengono inviati a Gemini, con l'istruzione di rispondere esclusivamente da quegli elementi, trattarne il contenuto come dato e citare gli id usati. Il server scarta le fonti che non erano tra quelle inviate. Se nulla corrisponde, l'app lo dice senza chiamare l'AI; se Gemini dice che le informazioni non bastano, compare "L'archivio non contiene informazioni sufficienti". Senza AI vengono mostrati gli elementi più pertinenti.

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
| `ai` | inferenze AI: `{ summary, categories, tags, model, generated_at }` |
| `file_path`, `file_name`, `file_mime`, `file_size` | file nel bucket privato `files/<user_id>/<id>/…` |
| `created_at`, `updated_at`, `processed_at` | date di acquisizione, modifica, analisi |

## Privacy e sicurezza

- **Dove stanno i dati:** sul tuo progetto Supabase (database e file privati) oppure, in modalità locale, solo nel browser.
- **Cosa esce verso servizi esterni:** per leggere un link, il server Vercel apre quell'indirizzo; con l'AI attiva, titolo, note ed estratti degli elementi interessati vengono inviati a Google Gemini. Nient'altro.
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
2. Apri Second Brain e tocca **Incolla link** (iOS chiede il permesso di incollare) oppure Aggiungi → icona appunti.

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

**Non verificato:** l'app con un vero progetto Supabase e una vera chiave Gemini, la lettura di siti reali dal server Vercel (l'ambiente di sviluppo non aveva accesso diretto a Internet), l'installazione e l'uso su un iPhone reale, il Comando Rapido.

## Limiti noti

- Nessuna trascrizione di video e nessuna lettura di Reel dietro login (vedi sopra).
- Il testo nelle immagini (OCR) non viene letto; i PDF scansionati senza testo neppure. Dei PDF si leggono al massimo le prime 50 pagine.
- Pagine molto dinamiche (contenuto caricato da JavaScript) danno solo titolo e descrizione.
- La ricerca carica tutti gli elementi nel browser: va bene fino a qualche migliaia di elementi.
- Le domande considerano al massimo i 12 elementi più pertinenti trovati per parole chiave: una domanda con parole diverse da quelle salvate può non trovarli (non c'è ricerca semantica).
- Se chiudi l'app durante "In elaborazione", l'elemento può restare in quello stato: usa "Rianalizza".
- L'esportazione JSON non include i file caricati.
