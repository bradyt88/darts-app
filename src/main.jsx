import React from "react";
import { createRoot } from "react-dom/client";
import DarkMind from "../DarkMind.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import "./darkmind-visuals.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <DarkMind />
    </ErrorBoundary>
  </React.StrictMode>
);
