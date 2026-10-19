import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { registrar } from "./push";
import "./estilos.css";
import "./componentes.css";
import "./layout.css";
import "./status.css";
import "./painel.css";
import "./gestao.css";
import "./visitas.css";

registrar();   // service worker das notificações no celular

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
