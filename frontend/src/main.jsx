import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "./index.css";
import "./styles/atlas-ui.css";

import App from "./App";
import ScrollToTop from "./components/ScrollToTop";
import { LanguageProvider } from "./i18n/LanguageContext";
import { ToastProvider } from "./components/ui/ToastProvider";
import { validateProductionEnvironment } from "./config/validateEnvironment";

validateProductionEnvironment();

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <LanguageProvider>
      <ToastProvider>
        <ScrollToTop />
        <App />
      </ToastProvider>
    </LanguageProvider>
  </BrowserRouter>
);
