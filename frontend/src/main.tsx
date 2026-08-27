import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/app.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
