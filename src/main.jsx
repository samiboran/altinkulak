import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/global.css";

// DOKUNULMAZ: basename GitHub Pages alt yolu icindir, silme.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/altinkulak">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
