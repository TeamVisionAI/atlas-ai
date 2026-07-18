import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import "./index.css";

import App from "./App";
import Prospect from "./pages/Prospect";
import { LanguageProvider } from "./i18n/LanguageContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <LanguageProvider>
      <Routes>
        <Route path="/prospect/:id" element={<Prospect />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </LanguageProvider>
  </BrowserRouter>
);
