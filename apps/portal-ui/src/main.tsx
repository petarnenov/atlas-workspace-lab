import React from "react";
import { createRoot } from "react-dom/client";
import { getWorkspaceTitle } from "./title";

function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 800, margin: "4rem auto", padding: "1rem" }}>
      <h1>{getWorkspaceTitle()}</h1>
      <p>Independent polyglot monorepo proof of concept.</p>
      <p>React/TypeScript + Java/Spring Boot. Feature LAB-101 awaits approved specifications.</p>
    </main>
  );
}

const container = document.getElementById("root");
if (container) createRoot(container).render(<React.StrictMode><App /></React.StrictMode>);
