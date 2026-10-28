import { describe, expect, it } from "vitest";
import { formatVia } from "./indirizzi.js";

describe("indirizzi uniformi: via e civico, città", () => {
  it("toglie CAP, sigla della provincia e nazione", () => {
    expect(formatVia("Via dei Vascellari 29, 00153 Roma RM, Italia")).toBe("Via dei Vascellari 29, Roma");
    expect(formatVia("Piazza di San Calisto, 3, 00153 Roma RM")).toBe("Piazza di San Calisto 3, Roma");
    expect(formatVia("Via Gola 4, 20143 Milano (MI)")).toBe("Via Gola 4, Milano");
    expect(formatVia("Caminho do Penedo n° 6, 9225-050 Porto da Cruz, Portogallo")).toBe("Caminho do Penedo 6, Porto da Cruz");
    expect(formatVia("Lázaro Cardenas Ote 2500, Valle Oriente, San Pedro Garza García, Nuevo León, México")).toBe("Lázaro Cardenas Ote 2500, San Pedro Garza García");
    expect(formatVia("Via del Moro 61, Trastevere, Roma")).toBe("Via del Moro 61, Roma");
  });
  it("scrive per intero le abbreviazioni della via", () => {
    expect(formatVia("L.go Benedetto Marcello 220, Roma")).toBe("Largo Benedetto Marcello 220, Roma");
    expect(formatVia("V.le America 15, Roma")).toBe("Viale America 15, Roma");
    expect(formatVia("P.za della Minerva 69, Roma")).toBe("Piazza della Minerva 69, Roma");
    expect(formatVia("C.so Vittorio Emanuele II 10, Roma")).toBe("Corso Vittorio Emanuele II 10, Roma");
    expect(formatVia("Largo Argentina 1, Roma")).toBe("Largo Argentina 1, Roma");
  });
  it("lascia com'è ciò che è già giusto o non ha la via", () => {
    for (const a of ["Via di Monte Testaccio 65b, Roma", "Clivo di Scauro 4, Roma", "Via Gaetano De Castillia, Milano", "Parco Archeologico del Celio, Roma", "Porto da Cruz, Madeira", "Roma", ""]) expect(formatVia(a)).toBe(a);
    expect(formatVia("Roma, Italia")).toBe("Roma");
  });
});
