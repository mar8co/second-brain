import { describe, expect, it } from "vitest";
import { conTelefoni, numeroDaChiamare } from "./telefoni.js";

// Solo i numeri trovati, come { testo, tel }.
const numeri = (t) => conTelefoni(t).filter((p) => typeof p !== "string");

describe("numeri di telefono nelle risposte", () => {
  it("riconosce i numeri con il prefisso internazionale", () => {
    expect(numeroDaChiamare("+39 333 430 7363")).toBe("+393334307363");
    expect(numeroDaChiamare("+393334307363")).toBe("+393334307363");
    expect(numeroDaChiamare("0039 06 12345678")).toBe("+390612345678");
    expect(numeroDaChiamare("(+39) 333 4307363")).toBe("+393334307363");
    expect(numeroDaChiamare("+351 291 123 456")).toBe("+351291123456");
    expect(numeroDaChiamare("+44 (0)20 7946 0958")).toBe("+442079460958");
    expect(numeroDaChiamare("+1 (555) 123-4567")).toBe("+15551234567");
    expect(numeroDaChiamare("+33 1 23 45 67 89")).toBe("+33123456789");
  });

  it("riconosce cellulari, fissi e numeri verdi italiani, chiamati come sono scritti", () => {
    expect(numeroDaChiamare("3929196854")).toBe("3929196854");
    expect(numeroDaChiamare("333 430 7363")).toBe("3334307363");
    expect(numeroDaChiamare("333-4307363")).toBe("3334307363");
    expect(numeroDaChiamare("333.430.7363")).toBe("3334307363");
    expect(numeroDaChiamare("333 123456")).toBe("333123456");
    expect(numeroDaChiamare("06 1234 5678")).toBe("0612345678");
    expect(numeroDaChiamare("06/12345678")).toBe("0612345678");
    expect(numeroDaChiamare("(06) 1234567")).toBe("061234567");
    expect(numeroDaChiamare("0471 123456")).toBe("0471123456");
    expect(numeroDaChiamare("02-12345678")).toBe("0212345678");
    expect(numeroDaChiamare("0571 1234567")).toBe("05711234567");
    expect(numeroDaChiamare("06 65951")).toBe("0665951");
    expect(numeroDaChiamare("(06) 65951")).toBe("0665951");
    expect(numeroDaChiamare("800 123 456")).toBe("800123456");
    expect(numeroDaChiamare("803 116")).toBe("803116");
    expect(numeroDaChiamare("199 123 456")).toBe("199123456");
  });

  it("lascia stare date, orari, prezzi, quantità, CAP e codici", () => {
    for (const no of [
      "05/11/2026", "05-11-26", "05.11.2026", "08.30", "2025-2026", "29/10",
      "3.500.000", "300.000.000", "345.678.901", "300 000 000", "800 000", "333 430 736",
      "00054", "00186", "01234567890", "112", "1500", "2026", "1234567", "0612345", "0665951", "06 12 34",
      "06 1234567 2", "(555) 123", "0-100", "3 000 000", "+3", "+1.500", "+39 06",
    ]) {
      expect(numeroDaChiamare(no), no).toBe(null);
    }
  });

  it("nel testo trova solo i numeri, con la punteggiatura e le parole attorno fuori", () => {
    const t = "Il parcheggio ha due numeri: +39 333 430 7363 e +39 333 430 7358. Per informazioni c'è anche il 3929196854, dalle 08.30 alle 19.30 dal 05/11/2026.";
    expect(numeri(t)).toEqual([
      { testo: "+39 333 430 7363", tel: "+393334307363" },
      { testo: "+39 333 430 7358", tel: "+393334307358" },
      { testo: "3929196854", tel: "3929196854" },
    ]);
    // Il testo intorno resta com'era.
    expect(conTelefoni(t).map((p) => (typeof p === "string" ? p : p.testo)).join("")).toBe(t);
    expect(numeri("(tel. 06 1234567)")).toEqual([{ testo: "06 1234567", tel: "061234567" }]);
    expect(numeri("Prenota (333 1234567) o scrivi")).toEqual([{ testo: "333 1234567", tel: "3331234567" }]);
    expect(numeri("Tel.0471 123456")).toEqual([{ testo: "0471 123456", tel: "0471123456" }]);
  });

  it("separa il numero dalle cifre vicine che non ne fanno parte", () => {
    expect(numeri("aperto fino alle 18 333 1234567")).toEqual([{ testo: "333 1234567", tel: "3331234567" }]);
    expect(numeri("chiama lo 06 1234567 2 volte")).toEqual([{ testo: "06 1234567", tel: "061234567" }]);
    expect(numeri("+39 333 430 7363 2 persone")).toEqual([{ testo: "+39 333 430 7363", tel: "+393334307363" }]);
    expect(numeri("333 1234567 333 7654321")).toEqual([
      { testo: "333 1234567", tel: "3331234567" },
      { testo: "333 7654321", tel: "3337654321" },
    ]);
  });

  it("niente numeri dentro parole, link, prezzi o codici", () => {
    for (const t of [
      "codice A3331234567", "ordine #3331234567", "@3331234567", "ID-3331234567", "1.3331234567",
      "3331234567abc", "costa 3331234,50 euro", "P.IVA 01234567890", "IBAN IT60 X054 2811 1010 0000 0123 456",
      "Via Idra 100, 00054 Fiumicino", "41.890251, 12.492373", "circa 800 000 visitatori", "+20% di sconto",
      "Passaggio 12 della ricetta", "nel 2026 sono 1.234.567",
    ]) {
      expect(numeri(t), t).toEqual([]);
    }
  });
});
