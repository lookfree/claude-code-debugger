import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Provider {
  id: string;
  name: string;
  is_preset: boolean;
  claude_code_config: string | null;
  codex_cli_config: string | null;
  created_at: number;
}

interface SwitchResult {
  tool: string;
  success: boolean;
  hot_reload: boolean;
  error: string | null;
}

const S = {
  page: { padding: 24 },
  heading: { fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#e5e5e5" },
  table: { borderCollapse: "collapse" as const, width: "100%" },
  th: {
    padding: "8px 12px",
    textAlign: "left" as const,
    fontSize: 11,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    borderBottom: "1px solid #262626",
  },
  row: { borderBottom: "1px solid #1f1f1f" },
  td: { padding: "10px 12px", fontSize: 13, color: "#e5e5e5" },
  tdMono: { padding: "10px 12px", fontSize: 11, fontFamily: "monospace", color: "#a3a3a3" },
  badge: (color: string) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    background: color,
    color: "#fff",
    marginRight: 4,
  }),
  btn: (primary?: boolean) => ({
    padding: "4px 10px",
    borderRadius: 4,
    border: "1px solid #374151",
    background: primary ? "#3b82f6" : "transparent",
    color: primary ? "#fff" : "#a3a3a3",
    fontSize: 12,
    cursor: "pointer",
    marginRight: 6,
  }),
  banner: (ok: boolean) => ({
    padding: "10px 14px",
    borderRadius: 6,
    background: ok ? "#14532d" : "#450a0a",
    border: `1px solid ${ok ? "#16a34a" : "#b91c1c"}`,
    color: ok ? "#86efac" : "#fca5a5",
    fontSize: 12,
    marginBottom: 12,
  }),
};

function ToolBadges({ p }: { p: Provider }) {
  return (
    <span>
      {p.claude_code_config && <span style={S.badge("#1e3a5f")}>claude-code</span>}
      {p.codex_cli_config && <span style={S.badge("#1a3a2f")}>codex-cli</span>}
    </span>
  );
}

export default function Presets() {
  const [presets, setPresets] = useState<Provider[]>([]);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [activeMap, setActiveMap] = useState<Record<string, string>>({});

  const load = () => {
    invoke<Provider[]>("get_providers")
      .then(ps => setPresets(ps.filter(p => p.is_preset)))
      .catch(console.error);
    invoke<Record<string, string>>("get_active_providers").then(setActiveMap).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  const handleActivate = async (p: Provider) => {
    setSwitching(p.id);
    setBanner(null);
    const targets: string[] = [];
    if (p.claude_code_config) targets.push("claude-code");
    if (p.codex_cli_config) targets.push("codex-cli");
    try {
      const results = await invoke<SwitchResult[]>("switch_provider", {
        providerId: p.id,
        targets,
      });
      const lines = results.map(r =>
        r.success
          ? `${r.tool}: 切换成功${r.hot_reload ? "（热生效）" : "（请重启工具）"}`
          : `${r.tool}: 失败 — ${r.error}`
      );
      setBanner({ ok: results.every(r => r.success), msg: lines.join(" | ") });
      load();
    } catch (e) {
      setBanner({ ok: false, msg: String(e) });
    } finally {
      setSwitching(null);
    }
  };

  const handleClone = async (p: Provider) => {
    const newId = crypto.randomUUID();
    const newName = `${p.name} (副本)`;
    try {
      await invoke("add_provider", {
        id: newId,
        name: newName,
        claudeCodeConfig: p.claude_code_config,
        codexCliConfig: p.codex_cli_config,
      });
      setBanner({ ok: true, msg: `已克隆为"${newName}"，可在 Providers 页编辑。` });
    } catch (e) {
      setBanner({ ok: false, msg: String(e) });
    }
  };

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Model Switcher — 内置预设</h1>
      <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
        内置预设只读，点击"克隆"可复制到 Providers 页进行自定义编辑。
      </p>

      {banner && <div style={S.banner(banner.ok)}>{banner.msg}</div>}

      <table style={S.table}>
        <thead>
          <tr>
            {["预设名称", "目标工具", "激活状态", "操作"].map(h => (
              <th key={h} style={S.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {presets.map(p => {
            const isActive = Object.values(activeMap).includes(p.id);
            return (
              <tr key={p.id} style={S.row}>
                <td style={S.td}>{p.name}</td>
                <td style={S.td}><ToolBadges p={p} /></td>
                <td style={S.td}>
                  {isActive ? (
                    <span style={{ color: "#22c55e", fontSize: 12 }}>● 激活中</span>
                  ) : (
                    <span style={{ color: "#6b7280", fontSize: 12 }}>○ 未激活</span>
                  )}
                </td>
                <td style={S.td}>
                  <button
                    style={S.btn(true)}
                    disabled={switching === p.id}
                    onClick={() => handleActivate(p)}
                  >
                    {switching === p.id ? "切换中…" : "激活"}
                  </button>
                  <button style={S.btn()} onClick={() => handleClone(p)}>
                    克隆
                  </button>
                </td>
              </tr>
            );
          })}
          {presets.length === 0 && (
            <tr>
              <td colSpan={4} style={{ ...S.td, color: "#6b7280" }}>加载中…</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
