import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
// Inter Tight (file locali, niente CDN): il carattere delle app di Marco.
import "@fontsource-variable/inter-tight/wght.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
