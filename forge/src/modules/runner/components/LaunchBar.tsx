import { useState, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";

const TOOLS = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex-cli", label: "Codex CLI" },
];

const MAX_RECENTS = 8;
const STORAGE_KEY = "forge:recentDirs";

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecents(dirs: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dirs.slice(0, MAX_RECENTS)));
}

interface LaunchBarProps {
  onLaunch: (tool: string, workingDir: string) => void;
}

export default function LaunchBar({ onLaunch }: LaunchBarProps) {
  const [tool, setTool] = useState(TOOLS[0].id);
  const [dir, setDir] = useState("");
  const [showRecents, setShowRecents] = useState(false);
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const dirInputRef = useRef<HTMLInputElement>(null);

  function handleLaunch() {
    const d = dir.trim() || ".";
    onLaunch(tool, d);

    // Persist to recents
    const updated = [d, ...recents.filter((r) => r !== d)].slice(0, MAX_RECENTS);
    setRecents(updated);
    saveRecents(updated);
    setShowRecents(false);
  }

  function selectRecent(r: string) {
    setDir(r);
    setShowRecents(false);
    dirInputRef.current?.focus();
  }

  async function handleBrowse() {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      setDir(selected as string);
      dirInputRef.current?.focus();
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderBottom: "1px solid #262626",
        background: "#141414",
        flexWrap: "wrap",
      }}
    >
      {/* Tool selector */}
      <select
        value={tool}
        onChange={(e) => setTool(e.target.value)}
        style={{
          background: "#1c1c1c",
          color: "#e5e5e5",
          border: "1px solid #3b3b3b",
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        {TOOLS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>

      {/* Working dir input + recents dropdown */}
      <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
        <input
          ref={dirInputRef}
          type="text"
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          onFocus={() => recents.length > 0 && setShowRecents(true)}
          onBlur={() => setTimeout(() => setShowRecents(false), 150)}
          onKeyDown={(e) => e.key === "Enter" && handleLaunch()}
          placeholder="Working directory (default: current dir)"
          style={{
            width: "100%",
            background: "#1c1c1c",
            color: "#e5e5e5",
            border: "1px solid #3b3b3b",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 13,
            fontFamily: "monospace",
            boxSizing: "border-box",
          }}
        />
        {showRecents && recents.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: "#1c1c1c",
              border: "1px solid #3b3b3b",
              borderRadius: 6,
              zIndex: 100,
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {recents.map((r) => (
              <div
                key={r}
                onMouseDown={() => selectRecent(r)}
                style={{
                  padding: "6px 10px",
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "#a3a3a3",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  ((e.target as HTMLElement).style.background = "#262626")
                }
                onMouseLeave={(e) =>
                  ((e.target as HTMLElement).style.background = "transparent")
                }
              >
                {r}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Browse button */}
      <button
        onClick={handleBrowse}
        title="Browse for directory"
        style={{
          background: "#1c1c1c",
          color: "#a3a3a3",
          border: "1px solid #3b3b3b",
          borderRadius: 6,
          padding: "5px 10px",
          fontSize: 13,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        浏览…
      </button>

      {/* Launch button */}
      <button
        onClick={handleLaunch}
        style={{
          background: "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "5px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Launch
      </button>
    </div>
  );
}
