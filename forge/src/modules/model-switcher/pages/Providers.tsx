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

// ── inline style tokens (consistent with Dashboard.tsx) ──
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
  input: {
    background: "#141414",
    border: "1px solid #374151",
    borderRadius: 4,
    color: "#e5e5e5",
    padding: "6px 10px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box" as const,
  },
  textarea: {
    background: "#141414",
    border: "1px solid #374151",
    borderRadius: 4,
    color: "#e5e5e5",
    padding: "6px 10px",
    fontSize: 11,
    fontFamily: "monospace",
    width: "100%",
    boxSizing: "border-box" as const,
    resize: "vertical" as const,
    height: 80,
  },
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

function ToolBadge({ provider }: { provider: Provider }) {
  return (
    <span>
      {provider.claude_code_config && (
        <span style={S.badge("#1e3a5f")}>claude-code</span>
      )}
      {provider.codex_cli_config && (
        <span style={S.badge("#1a3a2f")}>codex-cli</span>
      )}
      {!provider.claude_code_config && !provider.codex_cli_config && (
        <span style={{ color: "#6b7280", fontSize: 11 }}>—</span>
      )}
    </span>
  );
}

interface AddFormState {
  id: string;
  name: string;
  claudeConfig: string;
  codexConfig: string;
}

const emptyForm = (): AddFormState => ({ id: crypto.randomUUID(), name: "", claudeConfig: "", codexConfig: "" });

export default function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddFormState>(emptyForm());
  const [switching, setSwitching] = useState<string | null>(null);
  const [activeMap, setActiveMap] = useState<Record<string, string>>({});

  const load = () => {
    invoke<Provider[]>("get_providers").then(setProviders).catch(console.error);
    invoke<Record<string, string>>("get_active_providers").then(setActiveMap).catch(console.error);
  };

  useEffect(() => { load(); }, []);

  const handleSwitch = async (p: Provider) => {
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
      const allOk = results.every(r => r.success);
      setBanner({ ok: allOk, msg: lines.join(" | ") });
      load();
    } catch (e) {
      setBanner({ ok: false, msg: String(e) });
    } finally {
      setSwitching(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除该 Provider？")) return;
    try {
      await invoke("delete_provider", { id });
      load();
    } catch (e) {
      setBanner({ ok: false, msg: String(e) });
    }
  };

  const handleAdd = async () => {
    try {
      await invoke("add_provider", {
        id: form.id,
        name: form.name,
        claudeCodeConfig: form.claudeConfig || null,
        codexCliConfig: form.codexConfig || null,
      });
      setShowAdd(false);
      setForm(emptyForm());
      load();
    } catch (e) {
      setBanner({ ok: false, msg: String(e) });
    }
  };

  const userProviders = providers.filter(p => !p.is_preset);

  return (
    <div style={S.page}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 12 }}>
        <h1 style={{ ...S.heading, marginBottom: 0 }}>Model Switcher — Providers</h1>
        <button style={S.btn(true)} onClick={() => setShowAdd(s => !s)}>
          {showAdd ? "取消" : "+ 添加 Provider"}
        </button>
      </div>

      {banner && <div style={S.banner(banner.ok)}>{banner.msg}</div>}

      {showAdd && (
        <div style={{
          background: "#141414",
          border: "1px solid #374151",
          borderRadius: 8,
          padding: 16,
          marginBottom: 20,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>名称</div>
              <input
                style={S.input}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="My Provider"
              />
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
              ID（自动生成）
              <div style={{ ...S.input, marginTop: 4, opacity: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {form.id}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Claude Code 配置（JSON）</div>
              <textarea
                style={S.textarea}
                value={form.claudeConfig}
                onChange={e => setForm(f => ({ ...f, claudeConfig: e.target.value }))}
                placeholder='{"model":"claude-sonnet-4-5"}'
              />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Codex CLI 配置（JSON）</div>
              <textarea
                style={S.textarea}
                value={form.codexConfig}
                onChange={e => setForm(f => ({ ...f, codexConfig: e.target.value }))}
                placeholder='{"model":"gpt-4o","provider":"openai"}'
              />
            </div>
          </div>
          <button style={S.btn(true)} onClick={handleAdd}>保存</button>
        </div>
      )}

      {/* User Providers */}
      {userProviders.length === 0 && !showAdd && (
        <p style={{ color: "#6b7280", fontSize: 13 }}>还没有自定义 Provider。点击"添加"从预设克隆或手动配置。</p>
      )}

      {userProviders.length > 0 && (
        <table style={S.table}>
          <thead>
            <tr>
              {["名称", "目标工具", "激活状态", "操作"].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {userProviders.map(p => {
              const isActive = Object.values(activeMap).includes(p.id);
              return (
                <tr key={p.id} style={S.row}>
                  <td style={S.td}>{p.name}</td>
                  <td style={S.td}><ToolBadge provider={p} /></td>
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
                      onClick={() => handleSwitch(p)}
                    >
                      {switching === p.id ? "切换中…" : "激活"}
                    </button>
                    <button
                      style={S.btn()}
                      onClick={() => handleDelete(p.id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
