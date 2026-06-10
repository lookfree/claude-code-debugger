import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ToolStatus {
  name: string;
  installed: boolean;
  path: string | null;
  version: string | null;
}

export default function Dashboard() {
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<ToolStatus[]>("detect_tools")
      .then(setTools)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#e5e5e5" }}>
        Dashboard — Environment
      </h1>
      {error && (
        <p style={{ color: "#ef4444", marginBottom: 12 }}>{error}</p>
      )}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {tools.map((t) => (
            <tr key={t.name} style={{ borderBottom: "1px solid #262626" }}>
              <td style={{ padding: "8px 12px" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: t.installed ? "#22c55e" : "#6b7280",
                    marginRight: 8,
                  }}
                />
                {t.name}
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "#a3a3a3",
                }}
              >
                {t.path ?? "not installed"}
              </td>
              <td
                style={{
                  padding: "8px 12px",
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "#a3a3a3",
                }}
              >
                {t.version ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
