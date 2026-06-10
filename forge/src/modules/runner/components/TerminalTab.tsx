import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";

interface TerminalTabProps {
  sessionId: string;
  active: boolean;
}

export default function TerminalTab({
  sessionId,
  active,
}: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [_exited, setExited] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Init terminal once
    const term = new Terminal({
      theme: {
        background: "#0f0f0f",
        foreground: "#e5e5e5",
        cursor: "#3b82f6",
        black: "#1c1c1c",
        brightBlack: "#404040",
      },
      fontFamily: "monospace",
      fontSize: 13,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Forward keyboard input to pty
    const dataDispose = term.onData((data) => {
      invoke("pty_write", { sessionId, data }).catch(() => {});
    });

    // Listen for pty output events
    let unlistenOutput: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;

    listen<string>(`pty:output:${sessionId}`, (event) => {
      term.write(event.payload);
    }).then((fn) => {
      unlistenOutput = fn;
    });

    listen(`pty:exit:${sessionId}`, () => {
      setExited(true);
    }).then((fn) => {
      unlistenExit = fn;
    });

    // ResizeObserver for terminal resize
    const observer = new ResizeObserver(() => {
      if (containerRef.current && active) {
        fitAddon.fit();
        invoke("pty_resize", {
          sessionId,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      dataDispose.dispose();
      unlistenOutput?.();
      unlistenExit?.();
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId]); // only re-init if sessionId changes

  // Fit when becoming active
  useEffect(() => {
    if (active && fitAddonRef.current && termRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        invoke("pty_resize", {
          sessionId,
          cols: termRef.current?.cols ?? 80,
          rows: termRef.current?.rows ?? 24,
        }).catch(() => {});
      }, 50);
    }
  }, [active, sessionId]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: active ? "block" : "none",
        background: "#0f0f0f",
      }}
    />
  );
}

interface TabHeaderProps {
  sessionId: string;
  tool: string;
  exited: boolean;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export function TabHeader({
  tool,
  exited,
  active,
  onSelect,
  onClose,
}: TabHeaderProps) {
  const label = tool === "claude-code" ? "claude" : "codex";
  return (
    <div
      onClick={onSelect}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: "6px 6px 0 0",
        background: active ? "#1c1c1c" : "#141414",
        border: `1px solid ${active ? "#3b3b3b" : "#262626"}`,
        borderBottom: active ? "1px solid #1c1c1c" : "1px solid #262626",
        cursor: "pointer",
        fontSize: 12,
        color: active ? "#e5e5e5" : "#737373",
        userSelect: "none",
        marginRight: 2,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: exited ? "#ef4444" : "#22c55e",
        }}
      />
      {label}
      <span
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close"
        style={{
          marginLeft: 4,
          color: "#6b7280",
          fontWeight: 700,
          lineHeight: 1,
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        ×
      </span>
    </div>
  );
}

