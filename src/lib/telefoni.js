// Numeri di telefono nel testo delle risposte della chat, da chiamare con un
// tocco (link tel:). Si riconoscono i numeri con il prefisso internazionale
// (+39 …, 0039 …, +351 …) e quelli italiani scritti senza: cellulari (3…),
// fissi (0…) e numeri verdi o di servizio (800, 803, 848, 199…), anche a
// gruppi separati da spazi, punti, trattini o dalla barra dopo il prefisso
// (06/1234567). Restano testo date, orari, prezzi, quantità, CAP, partite IVA
// e cifre attaccate a parole. Il numero si chiama così com'è scritto, come se
// lo si digitasse: niente +39 aggiunto (un numero straniero scritto senza
// prefisso resta giusto nel suo paese).

// Tra un gruppo di cifre e l'altro: uno spazio, un punto, un trattino o una
// barra, oppure le parentesi attorno al prefisso ("(06) 1234567",
// "+39 (0)6 …", "+1 (555) 123-4567").
const SEP = String.raw`(?:\)[ .\-]?\(?|[ .\-\/]\(?|\()`;
// Cifre di seguito che potrebbero essere un numero. Davanti non ci sono
// lettere o cifre (nemmeno attaccate con un punto, un trattino o una barra:
// "1.333…", "ID-333…"); dopo non continua con lettere, decimali o simboli di
// misura e di prezzo.
const CANDIDATO = new RegExp(
  String.raw`(?<![\p{L}\p{N}_#@+])(?<!\p{N}[.,])(?<![\p{L}\p{N}][\-\/])(?:\(\+?|\+)?\d+(?:${SEP}\d+)*(?![\p{L}\p{N}_%€$£°@]|[.,]\p{N})`,
  "gu",
);

// Gruppi di cifre, ognuno con quello che lo precede: "+39 (0)6" →
// [{ sep: "+", cifre: "39" }, { sep: " (", cifre: "0" }, …].
function gruppi(s) {
  const pezzi = s.split(/(\d+)/);
  const out = [];
  for (let i = 1; i < pezzi.length; i += 2) out.push({ sep: pezzi[i - 1], cifre: pezzi[i] });
  return { gruppi: out, coda: pezzi.at(-1) };
}

// Numero da comporre (per tel:) se il testo è davvero un numero di telefono,
// altrimenti null.
export function numeroDaChiamare(scritto) {
  const s = String(scritto || "").trim();
  if (/^\(?(?:\+|00[1-9])/.test(s)) {
    // "+44 (0)20 …": lo 0 tra parentesi non si compone con il prefisso.
    const { gruppi: g, coda } = gruppi(s.replace("(0)", ""));
    // Dopo il prefisso del paese e il primo gruppo, niente cifre isolate ("+39 333 1234567 2").
    if (coda || g.slice(2).some((x) => x.cifre.length < 2)) return null;
    const cifre = g.map((x) => x.cifre).join("").replace(/^00/, "");
    return cifre.length >= 8 && cifre.length <= 15 ? `+${cifre}` : null;
  }
  const { gruppi: g, coda } = gruppi(s);
  if (!g.length || coda) return null;
  const [primo, ...altri] = g;
  const cifre = g.map((x) => x.cifre).join("");
  // Tra parentesi solo il prefisso di un fisso: "(06) 1234567".
  const aperta = primo.sep === "(";
  if (primo.sep && !aperta) return null;
  if (aperta && (!/^0\d{1,3}$/.test(primo.cifre) || !/^\) ?$/.test(altri[0]?.sep || ""))) return null;
  if (primo.cifre.length < 2) return null;
  for (const [i, { sep, cifre: c }] of altri.entries()) {
    if (i === 0 && aperta) continue;
    if (/[()]/.test(sep)) return null;
    // La barra solo dopo il prefisso di un fisso: 06/1234567, 0471/123456.
    if (sep === "/" && (i !== 0 || !/^0\d{1,3}$/.test(primo.cifre))) return null;
    // Date e orari (05.11.2026, 05-11-26, 08.30): dopo un punto, un trattino o
    // una barra i gruppi hanno almeno 3 cifre; dopo uno spazio almeno 2.
    if (c.length < (sep === " " ? 2 : 3)) return null;
  }
  // Quantità tonde (800 000, 300 000 000) e migliaia col punto (3.500.000).
  if (/^0+$/.test(cifre.slice(primo.cifre.length))) return null;
  if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) return null;
  // Cellulari: 10 cifre (9 per i più vecchi, ma non a gruppi da tre come le quantità).
  if (/^3\d{8,9}$/.test(cifre)) return cifre.length === 10 || !/^\d{3}[ .]\d{3}[ .]\d{3}$/.test(s) ? cifre : null;
  // Fissi: 8-11 cifre; 11 cifre tutte attaccate sono una partita IVA. Quelli
  // più corti (06 65951) solo con il prefisso staccato.
  if (/^0[1-9]\d{6,9}$/.test(cifre)) return /^0\d{10}$/.test(s) ? null : cifre;
  if (/^0[1-9]\d{4,5}$/.test(cifre) && /^(?:\(0\d{1,3}\) ?|0\d{1,3}[ /.-])\d{4,}$/.test(s)) return cifre;
  // Numeri verdi e di servizio: 800-803, 840-848, 892-899, 199.
  if (/^(?:80[0-3]|84[0-8]|89[2-9])\d{3,6}$/.test(cifre) || /^199\d{6}$/.test(cifre)) return cifre;
  return null;
}

// Il pezzo più lungo, il più a sinistra possibile, che è un numero di
// telefono: in "dalle 18 333 1234567" o "06 1234567 2 linee" il numero è solo
// una parte delle cifre di seguito. I pezzi si tagliano agli spazi.
function numeriIn(scritto, base) {
  const parole = [...scritto.matchAll(/\S+/g)];
  const out = [];
  let i = 0;
  while (i < parole.length) {
    let trovato = null;
    for (let j = parole.length; j > i && !trovato; j--) {
      let inizio = parole[i].index;
      let testo = scritto.slice(inizio, parole[j - 1].index + parole[j - 1][0].length);
      // "(" senza la sua ")" è la parentesi della frase: "(tel. 333 1234567)".
      if (testo.startsWith("(") && !testo.includes(")")) {
        inizio += 1;
        testo = testo.slice(1);
      }
      const tel = numeroDaChiamare(testo);
      if (tel) trovato = { inizio: base + inizio, testo, tel, dopo: j };
    }
    if (trovato) {
      out.push(trovato);
      i = trovato.dopo;
    } else i += 1;
  }
  return out;
}

// Divide il testo in pezzi: stringhe e numeri di telefono { testo, tel }.
export function conTelefoni(testo) {
  const t = String(testo || "");
  const out = [];
  let da = 0;
  for (const m of t.matchAll(CANDIDATO)) {
    for (const n of numeriIn(m[0], m.index)) {
      if (n.inizio > da) out.push(t.slice(da, n.inizio));
      out.push({ testo: n.testo, tel: n.tel });
      da = n.inizio + n.testo.length;
    }
  }
  if (da < t.length) out.push(t.slice(da));
  return out;
}
