/** @type {import('tailwindcss').Config} */
// Colori e carattere dalle linee guida comuni delle app di Marco (stile
// "manifesto svizzero"): i token cambiano col tema in src/index.css.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        carta: "var(--carta)",
        superficie: "var(--superficie)",
        inchiostro: "var(--inchiostro)",
        tenue: "var(--tenue)",
        riga: "var(--riga)",
        sfondo: "var(--sfondo)",
        rosso: "#ff3b1c",
        giallo: "#ffd60a",
        blu: "#3572e8",
        verde: "#22b35e",
        rosa: "#ffb5d0",
        arancio: "#ff7a1a",
        grigio: "#c9c5bd",
        sabbia: "#dccdb2",
        "rosso-azione": "#e02a0d",
        errore: "#c21d05",
        crema: "#f3f1ec",
      },
      fontFamily: {
        sans: ['"Inter Tight Variable"', '"Helvetica Neue"', "Helvetica", "Arial", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
