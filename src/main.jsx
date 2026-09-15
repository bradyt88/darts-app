import "./dartzone-celebration-sound.js";
import React from "react";
import { createRoot } from "react-dom/client";
import DarkMind from "../DarkMind.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import "./darkmind-visuals.css";
import "./darkmind-mark.css";
import "./dartzone-home.css";
import "./dartzone-flight.css";
import "./dartzone-celebration.css";
import "./dartzone-test-visuals.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <DarkMind />
    </ErrorBoundary>
  </React.StrictMode>
);
