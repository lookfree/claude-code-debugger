import { useState } from "react";
import Navigation from "./shell/Navigation";
import Dashboard from "./modules/dashboard/pages/Dashboard";
import Runner from "./modules/runner/pages/Runner";

type PageId = "dashboard" | "runner";

function renderPage(id: PageId) {
  switch (id) {
    case "dashboard":
      return <Dashboard />;
    case "runner":
      return <Runner />;
    default:
      return <Dashboard />;
  }
}

function App() {
  const [page, setPage] = useState<PageId>("dashboard");

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "#0f0f0f",
        color: "#e5e5e5",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <Navigation activeId={page} onNavigate={(id) => setPage(id as PageId)} />
      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {renderPage(page)}
      </main>
    </div>
  );
}

export default App;
