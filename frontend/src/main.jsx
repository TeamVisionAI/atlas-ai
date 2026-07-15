import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import "./index.css";

import App from "./App";
import Prospect from "./pages/Prospect";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />

      <Route
        path="/prospect/:id"
        element={<Prospect />}
      />
    </Routes>
  </BrowserRouter>
);