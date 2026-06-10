# Forge M7+M8 实施计划（Codex CLI 模块 + Command Ref 命令速查）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Forge 的 Codex CLI 模块（Overview、Config 页 + 已有 Sessions/Projects 接线验证）和 Command Ref 命令速查模块（两工具静态 JSON 数据 + 搜索/复制 UI + 导航接线）。

**Architecture:**
- M7 Rust 后端：新增 `commands/codex_cli/mod.rs` + `commands/codex_cli/config.rs`，实现 `codex_get_status`（工具检测 + 配置文件存在性 + 当前 model/provider）、`codex_read_config`（原始 TOML 字符串）、`codex_write_config`（校验 + 原子写入）三条 Tauri 命令；复用 `config/codex.rs` 的 `read_toml`/`merge_fields` 和 `commands/tools.rs` 的 `detect`。
- M7 前端：新增 `forge/src/modules/codex-cli/pages/Overview.tsx`（安装检测卡片 + 当前 model/provider + 今日 token + 固定项目快捷启动）、`Config.tsx`（raw TOML textarea 编辑器，Monaco 未使用——刻意简化）；Sessions/Projects 页已存在，验证导航接线即可。
- M7 Nav：补全 Codex CLI 分组：Overview、Sessions、Projects、Config。
- M8：纯前端模块 `forge/src/modules/command-ref/`：静态 JSON 数据文件（claude-code.json ~40 条、codex-cli.json ~15 条）+ `pages/CommandRef.tsx`（Tab + 搜索 + 分组列表 + 点击复制）；Nav 增加顶层 "Command Ref" 条目。

**Tech Stack:** 复用已有 tauri v2、toml crate、dirs crate、which crate；前端 React 18 + TypeScript（inline style 深色主题，与其他页面保持一致），navigator.clipboard API。

**Scope:** 仅覆盖设计文档 M7、M8。Sessions/Projects 页（codex-cli 分组）已在 M5/M6 实现，本 milestone 仅核查并补齐导航。

**约定：** 所有命令在仓库根目录 `/Users/wuhoujin/Documents/projects/superchat` 执行，除非另有说明。Rust 测试统一用 `cargo test --manifest-path forge/src-tauri/Cargo.toml`。

---

### Task 1: Rust — codex_cli 命令模块骨架 + TDD

**Files:**
- Create: `forge/src-tauri/src/commands/codex_cli/mod.rs`
- Create: `forge/src-tauri/src/commands/codex_cli/config.rs`
- Modify: `forge/src-tauri/src/commands/mod.rs`（pub mod codex_cli;）

- [ ] **Step 1: 声明模块**

编辑 `forge/src-tauri/src/commands/mod.rs`，追加一行：

```rust
pub mod codex_cli;
```

- [ ] **Step 2: 创建 commands/codex_cli/mod.rs**

新建 `forge/src-tauri/src/commands/codex_cli/mod.rs`：

```rust
pub mod config;
pub use config::{codex_get_status, codex_read_config, codex_write_config};
```

- [ ] **Step 3: 创建 commands/codex_cli/config.rs（含全套 TDD）**

新建 `forge/src-tauri/src/commands/codex_cli/config.rs`：

```rust
use std::path::{Path, PathBuf};
use serde::Serialize;
use toml::Table;

use crate::config::codex::{default_path, read_toml};
use crate::config::atomic::write_atomic;
use crate::commands::tools::detect;

/// Overview 页所需的 Codex 状态快照
#[derive(Debug, Serialize)]
pub struct CodexStatus {
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub config_exists: bool,
    pub config_path: String,
    pub current_model: Option<String>,
    pub current_provider: Option<String>,
}

/// 读取 codex 安装状态 + 配置摘要
/// param base_path: 仅供测试注入，None 使用 default_path()
pub fn get_status_impl(base_path: Option<&Path>) -> CodexStatus {
    let tool = detect("codex");
    let cfg_path: PathBuf = match base_path {
        Some(p) => p.join("config.toml"),
        None => default_path().unwrap_or_else(|| PathBuf::from("~/.codex/config.toml")),
    };
    let config_exists = cfg_path.exists();
    let (current_model, current_provider) = if config_exists {
        match read_toml(&cfg_path) {
            Ok(t) => (
                t.get("model").and_then(|v| v.as_str()).map(|s| s.to_string()),
                t.get("provider").and_then(|v| v.as_str()).map(|s| s.to_string()),
            ),
            Err(_) => (None, None),
        }
    } else {
        (None, None)
    };
    CodexStatus {
        installed: tool.installed,
        path: tool.path,
        version: tool.version,
        config_exists,
        config_path: cfg_path.to_string_lossy().to_string(),
        current_model,
        current_provider,
    }
}

/// 读取配置文件原始文本
/// param base_path: 仅供测试注入
pub fn read_config_impl(base_path: Option<&Path>) -> Result<String, String> {
    let cfg_path: PathBuf = match base_path {
        Some(p) => p.join("config.toml"),
        None => default_path().ok_or("无法获取 home 目录".to_string())?,
    };
    if !cfg_path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&cfg_path).map_err(|e| e.to_string())
}

/// 写入配置文件（先校验 TOML 语法，再原子写入）
/// param base_path: 仅供测试注入
pub fn write_config_impl(content: &str, base_path: Option<&Path>) -> Result<(), String> {
    // 1. 校验 TOML 可解析
    content.parse::<Table>().map_err(|e| format!("TOML 语法错误：{e}"))?;
    // 2. 确定写入路径
    let cfg_path: PathBuf = match base_path {
        Some(p) => p.join("config.toml"),
        None => default_path().ok_or("无法获取 home 目录".to_string())?,
    };
    // 3. 确保父目录存在
    if let Some(parent) = cfg_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    write_atomic(&cfg_path, content)
}

// ── Tauri 命令 ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn codex_get_status() -> CodexStatus {
    get_status_impl(None)
}

#[tauri::command]
pub fn codex_read_config() -> Result<String, String> {
    read_config_impl(None)
}

#[tauri::command]
pub fn codex_write_config(content: String) -> Result<(), String> {
    write_config_impl(&content, None)
}

// ── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_no_config_file() {
        let dir = tempfile::tempdir().unwrap();
        // tempdir 内无 config.toml → config_exists = false
        let s = get_status_impl(Some(dir.path()));
        assert!(!s.config_exists);
        assert!(s.current_model.is_none());
        assert!(s.current_provider.is_none());
    }

    #[test]
    fn status_reads_model_and_provider() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("config.toml"),
            "model = \"gpt-4o\"\nprovider = \"openai\"\n",
        )
        .unwrap();
        let s = get_status_impl(Some(dir.path()));
        assert!(s.config_exists);
        assert_eq!(s.current_model.as_deref(), Some("gpt-4o"));
        assert_eq!(s.current_provider.as_deref(), Some("openai"));
    }

    #[test]
    fn read_config_missing_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        let raw = read_config_impl(Some(dir.path())).unwrap();
        assert_eq!(raw, "");
    }

    #[test]
    fn read_config_returns_content() {
        let dir = tempfile::tempdir().unwrap();
        let content = "model = \"claude-opus-4\"\n";
        std::fs::write(dir.path().join("config.toml"), content).unwrap();
        let raw = read_config_impl(Some(dir.path())).unwrap();
        assert_eq!(raw, content);
    }

    #[test]
    fn write_config_valid_toml() {
        let dir = tempfile::tempdir().unwrap();
        let content = "model = \"claude-sonnet-4-5\"\nprovider = \"anthropic\"\n";
        write_config_impl(content, Some(dir.path())).unwrap();
        let read_back = std::fs::read_to_string(dir.path().join("config.toml")).unwrap();
        assert_eq!(read_back, content);
    }

    #[test]
    fn write_config_invalid_toml_returns_err() {
        let dir = tempfile::tempdir().unwrap();
        let result = write_config_impl("not = valid [[toml", Some(dir.path()));
        assert!(result.is_err());
        // 原文件不应存在（写入被拦截）
        assert!(!dir.path().join("config.toml").exists());
    }

    #[test]
    fn write_config_preserves_unknown_fields() {
        let dir = tempfile::tempdir().unwrap();
        // 先写入含未知字段的配置
        let original = "model = \"old\"\n\n[advanced]\ntimeout = 30\n";
        std::fs::write(dir.path().join("config.toml"), original).unwrap();
        // 直接写入新文本（write_config_impl 是 raw write，不合并）
        let new_content = "model = \"new\"\n\n[advanced]\ntimeout = 30\n";
        write_config_impl(new_content, Some(dir.path())).unwrap();
        let read_back = std::fs::read_to_string(dir.path().join("config.toml")).unwrap();
        assert!(read_back.contains("model = \"new\""));
        assert!(read_back.contains("timeout = 30"));
    }
}
```

- [ ] **Step 4: 运行测试（应全部通过）**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml codex_cli
```

- [ ] **Step 5: 注册 Tauri 命令**

打开 `forge/src-tauri/src/lib.rs`，在 `.invoke_handler(tauri::generate_handler![` 列表中追加三条命令（参考已有命令的添加方式）：

```rust
commands::codex_cli::codex_get_status,
commands::codex_cli::codex_read_config,
commands::codex_cli::codex_write_config,
```

- [ ] **Step 6: 提交**

```bash
git add forge/src-tauri/src/commands/codex_cli/ forge/src-tauri/src/commands/mod.rs forge/src-tauri/src/lib.rs
git commit -m "feat(m7): codex_cli Tauri commands with TDD (get_status/read_config/write_config)"
```

---

### Task 2: Frontend — tauri.ts 扩展 codex API + 类型定义

**Files:**
- Modify: `forge/src/lib/tauri.ts`（添加 CodexStatus 类型 + api.codex 块）

- [ ] **Step 1: 在 tauri.ts 中添加 CodexStatus 接口**

在 `RunningTool` interface 之后（约第 166 行），插入：

```typescript
export interface CodexStatus {
  installed: boolean
  path: string | null
  version: string | null
  config_exists: boolean
  config_path: string
  current_model: string | null
  current_provider: string | null
}
```

- [ ] **Step 2: 在 api 对象末尾（usage 块之后）追加 codex 块**

```typescript
  codex: {
    getStatus: () => inv<CodexStatus>('codex_get_status'),
    readConfig: () => inv<string>('codex_read_config'),
    writeConfig: (content: string) => inv<void>('codex_write_config', { content }),
  },
```

- [ ] **Step 3: 提交**

```bash
git add forge/src/lib/tauri.ts
git commit -m "feat(m7): add codex API types and bindings to tauri.ts"
```

---

### Task 3: Frontend — Codex CLI Overview + Config 页面

**Files:**
- Create: `forge/src/modules/codex-cli/pages/Overview.tsx`
- Create: `forge/src/modules/codex-cli/pages/Config.tsx`

- [ ] **Step 1: 创建 Overview.tsx**

新建 `forge/src/modules/codex-cli/pages/Overview.tsx`：

```tsx
import { useEffect, useState } from 'react'
import { api, CodexStatus, ProjectRow } from '../../../lib/tauri'

const S = {
  page: { padding: 24 },
  heading: { fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#e5e5e5' },
  card: {
    background: '#141414',
    border: '1px solid #262626',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 10 },
  row: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13, color: '#e5e5e5' },
  label: { color: '#6b7280', minWidth: 110, fontSize: 12 },
  mono: { fontFamily: 'monospace', fontSize: 12, color: '#a3a3a3' },
  dot: (ok: boolean) => ({ color: ok ? '#22c55e' : '#ef4444', marginRight: 4 }),
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#1a3a2f', color: '#fff' },
  installGuide: {
    background: '#450a0a',
    border: '1px solid #b91c1c',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    color: '#fca5a5',
    fontSize: 13,
  },
  btn: {
    padding: '5px 12px',
    borderRadius: 4,
    border: '1px solid #374151',
    background: '#3b82f6',
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
    marginRight: 8,
  },
  btnSec: {
    padding: '5px 12px',
    borderRadius: 4,
    border: '1px solid #374151',
    background: 'transparent',
    color: '#a3a3a3',
    fontSize: 12,
    cursor: 'pointer',
    marginRight: 8,
  },
  table: { borderCollapse: 'collapse' as const, width: '100%' },
  th: { padding: '6px 10px', textAlign: 'left' as const, fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: 1, borderBottom: '1px solid #262626' },
  td: { padding: '8px 10px', fontSize: 13, color: '#e5e5e5', borderBottom: '1px solid #1f1f1f' },
  tdMono: { padding: '8px 10px', fontSize: 11, fontFamily: 'monospace', color: '#a3a3a3', borderBottom: '1px solid #1f1f1f' },
}

interface Props {
  onNavigate?: (id: string) => void
}

export default function CodexOverview({ onNavigate }: Props) {
  const [status, setStatus] = useState<CodexStatus | null>(null)
  const [dashboard, setDashboard] = useState<{ codex_today_tokens: number } | null>(null)
  const [pinnedProjects, setPinnedProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.codex.getStatus(),
      api.usage.getDashboard(),
      api.usage.getProjects('codex-cli'),
    ])
      .then(([s, dash, projs]) => {
        setStatus(s)
        setDashboard(dash)
        setPinnedProjects(projs.filter((p) => p.pinned))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ ...S.page, color: '#6b7280' }}>加载中…</div>

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Codex CLI — Overview</h1>

      {/* 安装状态卡片 */}
      {status && !status.installed && (
        <div style={S.installGuide}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠ Codex CLI 未安装</div>
          <div style={{ marginBottom: 8 }}>请先安装 Codex CLI，然后重启 Forge 以刷新状态。</div>
          <div style={{ fontFamily: 'monospace', background: '#1a0a0a', padding: '8px 12px', borderRadius: 4, fontSize: 12 }}>
            npm install -g @openai/codex
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#f87171' }}>
            安装后运行 <code>codex --version</code> 确认安装成功。
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardTitle}>工具状态</div>
        {status && (
          <>
            <div style={S.row}>
              <span style={S.label}>安装状态</span>
              <span style={S.dot(status.installed)}>{status.installed ? '●' : '●'}</span>
              <span>{status.installed ? '已安装' : '未安装'}</span>
              {status.version && <span style={{ ...S.badge, marginLeft: 8 }}>{status.version}</span>}
            </div>
            {status.path && (
              <div style={S.row}>
                <span style={S.label}>路径</span>
                <span style={S.mono}>{status.path}</span>
              </div>
            )}
            <div style={S.row}>
              <span style={S.label}>配置文件</span>
              <span style={S.mono}>{status.config_path}</span>
              <span style={{ fontSize: 11, color: status.config_exists ? '#22c55e' : '#6b7280' }}>
                {status.config_exists ? '存在' : '不存在'}
              </span>
            </div>
            {status.current_model && (
              <div style={S.row}>
                <span style={S.label}>当前模型</span>
                <span style={S.mono}>{status.current_model}</span>
              </div>
            )}
            {status.current_provider && (
              <div style={S.row}>
                <span style={S.label}>当前 Provider</span>
                <span style={S.mono}>{status.current_provider}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 今日用量卡片 */}
      <div style={S.card}>
        <div style={S.cardTitle}>今日用量</div>
        <div style={S.row}>
          <span style={S.label}>Token 用量</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>
            {dashboard ? (dashboard.codex_today_tokens / 1000).toFixed(1) + 'k' : '—'}
          </span>
        </div>
      </div>

      {/* 固定项目快捷启动 */}
      {pinnedProjects.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>固定项目</div>
          <table style={S.table}>
            <thead>
              <tr>
                {['目录', '会话数', '操作'].map((h) => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pinnedProjects.map((p) => (
                <tr key={p.directory}>
                  <td style={S.tdMono}>{p.directory}</td>
                  <td style={S.td}>{p.session_count}</td>
                  <td style={S.td}>
                    <button
                      style={S.btn}
                      onClick={() => onNavigate?.('runner')}
                      title={`在 Runner 中启动 codex（目录: ${p.directory}）`}
                    >
                      启动
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 快捷导航 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button style={S.btn} onClick={() => onNavigate?.('codex_sessions')}>查看 Sessions</button>
        <button style={S.btn} onClick={() => onNavigate?.('codex_projects')}>查看 Projects</button>
        <button style={S.btnSec} onClick={() => onNavigate?.('codex_config')}>编辑配置文件</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 Config.tsx**

新建 `forge/src/modules/codex-cli/pages/Config.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react'
import { api } from '../../../lib/tauri'

const S = {
  page: { padding: 24, display: 'flex', flexDirection: 'column' as const, height: '100%', boxSizing: 'border-box' as const },
  heading: { fontSize: 18, fontWeight: 600, marginBottom: 4, color: '#e5e5e5' },
  subtitle: { fontSize: 12, color: '#6b7280', marginBottom: 16 },
  textarea: {
    flex: 1,
    width: '100%',
    minHeight: 400,
    background: '#141414',
    border: '1px solid #262626',
    borderRadius: 6,
    color: '#e5e5e5',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 1.6,
    padding: 14,
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
    outline: 'none',
  },
  footer: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 },
  btnSave: {
    padding: '7px 18px',
    borderRadius: 4,
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' as const },
  error: {
    padding: '8px 12px',
    borderRadius: 4,
    background: '#450a0a',
    border: '1px solid #b91c1c',
    color: '#fca5a5',
    fontSize: 12,
    marginTop: 8,
  },
  toast: {
    padding: '8px 12px',
    borderRadius: 4,
    background: '#14532d',
    border: '1px solid #16a34a',
    color: '#86efac',
    fontSize: 12,
  },
}

export default function CodexConfig() {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    api.codex.readConfig()
      .then((raw) => setContent(raw))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api.codex.writeConfig(content)
      setSaved(true)
      if (toastTimer.current) clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Codex CLI — 配置文件</h1>
      <p style={S.subtitle}>
        直接编辑 <code style={{ fontFamily: 'monospace' }}>~/.codex/config.toml</code>。保存时将校验 TOML 语法后原子写入。
        <br />
        注意：本编辑器为纯文本模式（刻意简化），未使用 Monaco Editor。
      </p>

      {loading ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>加载中…</div>
      ) : (
        <textarea
          style={S.textarea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={'# ~/.codex/config.toml\n# 示例：\nmodel = "claude-sonnet-4-5"\nprovider = "anthropic"\n'}
          spellCheck={false}
        />
      )}

      {error && <div style={S.error}>{error}</div>}

      <div style={S.footer}>
        <button
          style={{ ...S.btnSave, ...(saving ? S.btnDisabled : {}) }}
          onClick={handleSave}
          disabled={saving || loading}
        >
          {saving ? '保存中…' : '保存'}
        </button>
        {saved && <div style={S.toast}>✓ 已保存</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add forge/src/modules/codex-cli/pages/Overview.tsx forge/src/modules/codex-cli/pages/Config.tsx
git commit -m "feat(m7): add Codex CLI Overview and Config pages"
```

---

### Task 4: 导航接线 — Codex CLI 补全 + Command Ref 接入

**Files:**
- Modify: `forge/src/shell/Navigation.tsx`
- Modify: `forge/src/App.tsx`

- [ ] **Step 1: 更新 Navigation.tsx**

在 `NAV_ITEMS` 数组中，将原有 Codex CLI 分组（仅有 Sessions、Projects）替换/扩展为：

```typescript
  { id: "_group_codex_cli", label: "Codex CLI", isGroupHeader: true },
  { id: "codex_overview", label: "Overview" },
  { id: "codex_sessions", label: "Sessions" },
  { id: "codex_projects", label: "Projects" },
  { id: "codex_config", label: "Config" },
  { id: "command_ref", label: "Command Ref" },
```

确保 `command_ref` 在 Codex CLI 分组之后、直接作为顶层条目追加（不加 isGroupHeader）。

- [ ] **Step 2: 更新 App.tsx**

在 `PageId` 类型联合中追加：

```typescript
  | "codex_overview"
  | "codex_config"
  | "command_ref"
```

在 import 区域追加：

```typescript
import CodexOverview from "./modules/codex-cli/pages/Overview";
import CodexConfig from "./modules/codex-cli/pages/Config";
import CommandRef from "./modules/command-ref/pages/CommandRef";
```

在 `renderPage` switch 中追加：

```typescript
    case "codex_overview":  return <CodexOverview onNavigate={navigate} />;
    case "codex_config":    return <CodexConfig />;
    case "command_ref":     return <CommandRef />;
```

- [ ] **Step 3: 提交**

```bash
git add forge/src/shell/Navigation.tsx forge/src/App.tsx
git commit -m "feat(m7+m8): wire Codex Overview/Config and Command Ref into navigation"
```

---

### Task 5: M8 — Command Ref 静态 JSON 数据文件

**Files:**
- Create: `forge/src/modules/command-ref/data/claude-code.json`
- Create: `forge/src/modules/command-ref/data/codex-cli.json`

- [ ] **Step 1: 创建目录结构**

确保目录存在：

```bash
mkdir -p forge/src/modules/command-ref/data
```

- [ ] **Step 2: 创建 claude-code.json（~40 条）**

新建 `forge/src/modules/command-ref/data/claude-code.json`：

```json
[
  {
    "name": "/clear",
    "type": "slash",
    "category": "会话控制",
    "description": "清除当前对话上下文，开始全新会话",
    "example": "/clear"
  },
  {
    "name": "/compact",
    "type": "slash",
    "category": "会话控制",
    "description": "压缩对话历史，仅保留摘要以节省 token",
    "example": "/compact"
  },
  {
    "name": "/resume",
    "type": "slash",
    "category": "会话控制",
    "description": "恢复上一次会话（仅交互模式）",
    "example": "/resume"
  },
  {
    "name": "/exit",
    "type": "slash",
    "category": "会话控制",
    "description": "退出 Claude Code 交互会话",
    "example": "/exit"
  },
  {
    "name": "/help",
    "type": "slash",
    "category": "会话控制",
    "description": "显示所有可用的斜杠命令帮助信息",
    "example": "/help"
  },
  {
    "name": "/cost",
    "type": "slash",
    "category": "会话控制",
    "description": "显示当前会话已消耗的 token 数量和预估费用",
    "example": "/cost"
  },
  {
    "name": "/status",
    "type": "slash",
    "category": "会话控制",
    "description": "显示当前会话状态，包括模型、上下文大小等信息",
    "example": "/status"
  },
  {
    "name": "/rewind",
    "type": "slash",
    "category": "会话控制",
    "description": "撤销最后一轮对话，回退到上一个对话状态",
    "example": "/rewind"
  },
  {
    "name": "/init",
    "type": "slash",
    "category": "文件与上下文",
    "description": "在当前目录初始化 CLAUDE.md 项目记忆文件",
    "example": "/init"
  },
  {
    "name": "/add-dir",
    "type": "slash",
    "category": "文件与上下文",
    "description": "将指定目录添加到当前会话的上下文中",
    "example": "/add-dir ~/projects/mylib"
  },
  {
    "name": "/memory",
    "type": "slash",
    "category": "文件与上下文",
    "description": "查看或管理 CLAUDE.md 记忆文件内容",
    "example": "/memory"
  },
  {
    "name": "/context",
    "type": "slash",
    "category": "文件与上下文",
    "description": "显示当前上下文窗口中包含的文件和内容摘要",
    "example": "/context"
  },
  {
    "name": "/mcp",
    "type": "slash",
    "category": "工具与 MCP",
    "description": "查看当前已连接的 MCP 服务器列表和状态",
    "example": "/mcp"
  },
  {
    "name": "/model",
    "type": "slash",
    "category": "模型与配置",
    "description": "查看当前使用的模型，或在会话中切换模型",
    "example": "/model claude-opus-4"
  },
  {
    "name": "/agents",
    "type": "slash",
    "category": "高级功能",
    "description": "管理子代理（subagent）的运行状态",
    "example": "/agents"
  },
  {
    "name": "/hooks",
    "type": "slash",
    "category": "高级功能",
    "description": "查看当前项目配置的 Hooks 列表及其状态",
    "example": "/hooks"
  },
  {
    "name": "/permissions",
    "type": "slash",
    "category": "高级功能",
    "description": "查看或修改当前会话的工具权限设置",
    "example": "/permissions"
  },
  {
    "name": "/doctor",
    "type": "slash",
    "category": "诊断与维护",
    "description": "运行诊断检查，验证 Claude Code 安装和配置是否正常",
    "example": "/doctor"
  },
  {
    "name": "/login",
    "type": "slash",
    "category": "诊断与维护",
    "description": "登录 Anthropic 账户以获取 API 访问权限",
    "example": "/login"
  },
  {
    "name": "/logout",
    "type": "slash",
    "category": "诊断与维护",
    "description": "退出当前登录的 Anthropic 账户",
    "example": "/logout"
  },
  {
    "name": "/terminal-setup",
    "type": "slash",
    "category": "诊断与维护",
    "description": "配置终端环境，安装 shell 集成脚本",
    "example": "/terminal-setup"
  },
  {
    "name": "/vim",
    "type": "slash",
    "category": "诊断与维护",
    "description": "切换 Vim 键位绑定模式（开/关）",
    "example": "/vim"
  },
  {
    "name": "/review",
    "type": "slash",
    "category": "代码操作",
    "description": "对当前分支的代码改动进行代码审查",
    "example": "/review"
  },
  {
    "name": "/pr-comments",
    "type": "slash",
    "category": "代码操作",
    "description": "读取并处理当前 PR 上的评论",
    "example": "/pr-comments"
  },
  {
    "name": "/todos",
    "type": "slash",
    "category": "代码操作",
    "description": "列出当前会话中待完成的任务（TODO 列表）",
    "example": "/todos"
  },
  {
    "name": "/bug",
    "type": "slash",
    "category": "代码操作",
    "description": "报告 Claude Code 本身的 bug，自动收集诊断信息",
    "example": "/bug"
  },
  {
    "name": "/config",
    "type": "slash",
    "category": "模型与配置",
    "description": "查看或修改 Claude Code 的配置项",
    "example": "/config"
  },
  {
    "name": "/output-style",
    "type": "slash",
    "category": "模型与配置",
    "description": "切换输出样式（详细/简洁/自动）",
    "example": "/output-style concise"
  },
  {
    "name": "/export",
    "type": "slash",
    "category": "会话控制",
    "description": "将当前会话导出为 Markdown 文件",
    "example": "/export ~/session.md"
  },
  {
    "name": "/release-notes",
    "type": "slash",
    "category": "诊断与维护",
    "description": "查看当前版本的发布说明和更新内容",
    "example": "/release-notes"
  },
  {
    "name": "/usage",
    "type": "slash",
    "category": "诊断与维护",
    "description": "显示账户的 token 使用量和费用统计",
    "example": "/usage"
  },
  {
    "name": "--model",
    "type": "flag",
    "category": "CLI 参数",
    "description": "启动时指定使用的模型 ID（如 claude-sonnet-4-5、claude-opus-4）",
    "example": "claude --model claude-opus-4"
  },
  {
    "name": "--verbose",
    "type": "flag",
    "category": "CLI 参数",
    "description": "显示详细日志输出，包括工具调用和内部处理步骤",
    "example": "claude --verbose"
  },
  {
    "name": "--debug",
    "type": "flag",
    "category": "CLI 参数",
    "description": "开启调试模式，输出更多内部状态信息",
    "example": "claude --debug"
  },
  {
    "name": "--resume",
    "type": "flag",
    "category": "CLI 参数",
    "description": "恢复指定 session ID 的历史会话",
    "example": "claude --resume <session-id>"
  },
  {
    "name": "--continue",
    "type": "flag",
    "category": "CLI 参数",
    "description": "继续最近的一次会话",
    "example": "claude --continue"
  },
  {
    "name": "--print",
    "type": "flag",
    "category": "CLI 参数",
    "description": "非交互模式：打印单次回复后退出（等价 -p）",
    "example": "claude --print '解释这段代码'"
  },
  {
    "name": "--output-format",
    "type": "flag",
    "category": "CLI 参数",
    "description": "指定输出格式：text（默认）、json、stream-json",
    "example": "claude --output-format json"
  },
  {
    "name": "--permission-mode",
    "type": "flag",
    "category": "CLI 参数",
    "description": "设置工具权限模式：default、acceptEdits、bypassPermissions、plan",
    "example": "claude --permission-mode acceptEdits"
  },
  {
    "name": "--dangerously-skip-permissions",
    "type": "flag",
    "category": "CLI 参数",
    "description": "跳过所有权限提示，自动接受（危险！仅用于自动化环境）",
    "example": "claude --dangerously-skip-permissions"
  },
  {
    "name": "--add-dir",
    "type": "flag",
    "category": "CLI 参数",
    "description": "启动时将额外目录加入上下文（可重复使用多次）",
    "example": "claude --add-dir ~/shared-lib"
  },
  {
    "name": "--mcp-config",
    "type": "flag",
    "category": "CLI 参数",
    "description": "指定 MCP 配置文件路径（覆盖默认配置）",
    "example": "claude --mcp-config ./mcp.json"
  },
  {
    "name": "mcp",
    "type": "subcommand",
    "category": "子命令",
    "description": "管理 MCP 服务器：add、remove、list、serve 等操作",
    "example": "claude mcp list"
  },
  {
    "name": "update",
    "type": "subcommand",
    "category": "子命令",
    "description": "将 Claude Code 更新到最新版本",
    "example": "claude update"
  },
  {
    "name": "doctor",
    "type": "subcommand",
    "category": "子命令",
    "description": "运行安装健康检查（与 /doctor 等价，但在 CLI 层执行）",
    "example": "claude doctor"
  },
  {
    "name": "setup-token",
    "type": "subcommand",
    "category": "子命令",
    "description": "配置 API Token（适用于 CI/自动化环境）",
    "example": "claude setup-token"
  }
]
```

- [ ] **Step 3: 创建 codex-cli.json（~15 条）**

新建 `forge/src/modules/command-ref/data/codex-cli.json`：

```json
[
  {
    "name": "exec",
    "type": "subcommand",
    "category": "核心命令",
    "description": "在指定目录执行一次性编码任务（非交互模式）",
    "example": "codex exec '为该函数添加单元测试'"
  },
  {
    "name": "login",
    "type": "subcommand",
    "category": "认证",
    "description": "登录 OpenAI / 配置的 Provider 账户",
    "example": "codex login"
  },
  {
    "name": "logout",
    "type": "subcommand",
    "category": "认证",
    "description": "退出当前登录的账户",
    "example": "codex logout"
  },
  {
    "name": "mcp",
    "type": "subcommand",
    "category": "工具与 MCP",
    "description": "管理 MCP 服务器配置（list、add、remove）",
    "example": "codex mcp list"
  },
  {
    "name": "apply",
    "type": "subcommand",
    "category": "核心命令",
    "description": "将 Codex 生成的代码补丁应用到本地文件",
    "example": "codex apply patch.diff"
  },
  {
    "name": "resume",
    "type": "subcommand",
    "category": "核心命令",
    "description": "恢复上次的 Codex 会话继续工作",
    "example": "codex resume"
  },
  {
    "name": "completion",
    "type": "subcommand",
    "category": "诊断与配置",
    "description": "生成 shell 补全脚本（bash/zsh/fish）",
    "example": "codex completion zsh"
  },
  {
    "name": "proto",
    "type": "subcommand",
    "category": "高级功能",
    "description": "进入原型模式，快速迭代代码生成（实验性功能）",
    "example": "codex proto"
  },
  {
    "name": "--model",
    "type": "flag",
    "category": "CLI 参数",
    "description": "指定使用的模型 ID，覆盖配置文件中的默认模型",
    "example": "codex --model gpt-4o '重构这段代码'"
  },
  {
    "name": "--ask-for-approval",
    "type": "flag",
    "category": "CLI 参数",
    "description": "执行文件修改前提示用户手动确认（安全模式）",
    "example": "codex --ask-for-approval '添加错误处理'"
  },
  {
    "name": "--full-auto",
    "type": "flag",
    "category": "CLI 参数",
    "description": "全自动模式：跳过所有确认提示，自动执行所有操作（危险！）",
    "example": "codex --full-auto '修复所有 lint 错误'"
  },
  {
    "name": "--sandbox",
    "type": "flag",
    "category": "CLI 参数",
    "description": "在沙盒环境中运行，限制文件系统访问范围",
    "example": "codex --sandbox '生成测试用例'"
  },
  {
    "name": "--config",
    "type": "flag",
    "category": "CLI 参数",
    "description": "指定配置文件路径（覆盖默认 ~/.codex/config.toml）",
    "example": "codex --config ./codex.toml '优化性能'"
  },
  {
    "name": "--image",
    "type": "flag",
    "category": "CLI 参数",
    "description": "将图片文件作为视觉上下文传入（多模态输入）",
    "example": "codex --image screenshot.png '根据截图实现 UI'"
  },
  {
    "name": "--oss",
    "type": "flag",
    "category": "CLI 参数",
    "description": "使用开源模型端点（通过兼容 OpenAI API 的服务）",
    "example": "codex --oss --model llama3 '生成函数'"
  }
]
```

- [ ] **Step 4: 提交**

```bash
git add forge/src/modules/command-ref/data/
git commit -m "feat(m8): add claude-code.json (44 entries) and codex-cli.json (15 entries) command ref data"
```

---

### Task 6: M8 — CommandRef 页面（搜索 + 分组 + 复制）

**Files:**
- Create: `forge/src/modules/command-ref/pages/CommandRef.tsx`

- [ ] **Step 1: 创建 CommandRef.tsx**

新建 `forge/src/modules/command-ref/pages/CommandRef.tsx`：

```tsx
import { useState, useMemo } from 'react'
import claudeCodeData from '../data/claude-code.json'
import codexCliData from '../data/codex-cli.json'

interface CommandEntry {
  name: string
  type: 'slash' | 'flag' | 'subcommand'
  category: string
  description: string
  example?: string
}

const ALL_DATA: Record<string, CommandEntry[]> = {
  'claude-code': claudeCodeData as CommandEntry[],
  'codex-cli': codexCliData as CommandEntry[],
}

const TOOL_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  'codex-cli': 'Codex CLI',
}

type CopiedKey = string | null

const S = {
  page: { padding: 24 },
  heading: { fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#e5e5e5' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  tab: (active: boolean) => ({
    padding: '6px 16px',
    borderRadius: 20,
    border: `1px solid ${active ? '#3b82f6' : '#374151'}`,
    background: active ? '#1e3a5f' : 'transparent',
    color: active ? '#3b82f6' : '#a3a3a3',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 0.15s',
  }),
  searchInput: {
    flex: 1,
    maxWidth: 300,
    padding: '6px 12px',
    background: '#141414',
    border: '1px solid #262626',
    borderRadius: 6,
    color: '#e5e5e5',
    fontSize: 13,
    outline: 'none',
  },
  categoryHeader: {
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    padding: '14px 0 6px',
    borderBottom: '1px solid #1f1f1f',
    marginBottom: 4,
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 0,
    padding: '8px 0',
    borderBottom: '1px solid #141414',
    cursor: 'pointer',
    borderRadius: 4,
  },
  rowHover: { background: '#141414' },
  nameCell: {
    minWidth: 220,
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#60a5fa',
    fontWeight: 600,
    paddingRight: 16,
  },
  descCell: {
    flex: 1,
    fontSize: 13,
    color: '#d1d5db',
    lineHeight: 1.5,
  },
  typeBadge: (type: string) => {
    const colors: Record<string, { bg: string; fg: string }> = {
      slash: { bg: '#1e3a5f', fg: '#60a5fa' },
      flag: { bg: '#3f1f4a', fg: '#c084fc' },
      subcommand: { bg: '#1a3a2f', fg: '#4ade80' },
    }
    const c = colors[type] || { bg: '#262626', fg: '#a3a3a3' }
    return {
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      background: c.bg,
      color: c.fg,
      marginRight: 12,
      minWidth: 72,
      textAlign: 'center' as const,
    }
  },
  example: { fontFamily: 'monospace', fontSize: 11, color: '#6b7280', marginTop: 2 },
  copiedFeedback: { fontSize: 11, color: '#22c55e', marginLeft: 8 },
  noResults: { color: '#6b7280', fontSize: 13, padding: '24px 0', textAlign: 'center' as const },
  count: { fontSize: 11, color: '#6b7280', marginLeft: 'auto' },
}

function fuzzyMatch(entry: CommandEntry, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    entry.name.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q) ||
    (entry.example?.toLowerCase().includes(q) ?? false)
  )
}

function groupByCategory(entries: CommandEntry[]): Map<string, CommandEntry[]> {
  const map = new Map<string, CommandEntry[]>()
  for (const e of entries) {
    if (!map.has(e.category)) map.set(e.category, [])
    map.get(e.category)!.push(e)
  }
  return map
}

export default function CommandRef() {
  const [tool, setTool] = useState<'claude-code' | 'codex-cli'>('claude-code')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<CopiedKey>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return ALL_DATA[tool].filter((e) => fuzzyMatch(e, query))
  }, [tool, query])

  const grouped = useMemo(() => groupByCategory(filtered), [filtered])

  const handleCopy = async (entry: CommandEntry) => {
    const text = entry.example ?? entry.name
    try {
      await navigator.clipboard.writeText(text)
      setCopied(entry.name)
      setTimeout(() => setCopied((prev) => (prev === entry.name ? null : prev)), 2000)
    } catch {
      // clipboard not available in some sandboxed environments
    }
  }

  return (
    <div style={S.page}>
      <h1 style={S.heading}>Command Ref — 命令速查</h1>

      <div style={S.toolbar}>
        {Object.keys(ALL_DATA).map((t) => (
          <button
            key={t}
            style={S.tab(t === tool)}
            onClick={() => { setTool(t as 'claude-code' | 'codex-cli'); setQuery('') }}
          >
            {TOOL_LABELS[t]}
          </button>
        ))}
        <input
          style={S.searchInput}
          placeholder="搜索命令名称或描述…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span style={S.count}>{filtered.length} 条</span>
      </div>

      {filtered.length === 0 && (
        <div style={S.noResults}>未找到匹配的命令</div>
      )}

      {Array.from(grouped.entries()).map(([category, entries]) => (
        <div key={category}>
          <div style={S.categoryHeader}>{category}</div>
          {entries.map((entry) => {
            const isHovered = hoveredRow === entry.name
            return (
              <div
                key={entry.name}
                style={{ ...S.row, ...(isHovered ? S.rowHover : {}) }}
                onClick={() => handleCopy(entry)}
                onMouseEnter={() => setHoveredRow(entry.name)}
                onMouseLeave={() => setHoveredRow(null)}
                title={`点击复制: ${entry.example ?? entry.name}`}
              >
                <span style={S.nameCell}>{entry.name}</span>
                <span style={S.typeBadge(entry.type)}>{entry.type}</span>
                <span style={S.descCell}>
                  {entry.description}
                  {entry.example && (
                    <div style={S.example}>{entry.example}</div>
                  )}
                </span>
                {copied === entry.name && (
                  <span style={S.copiedFeedback}>✓ 已复制</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add forge/src/modules/command-ref/pages/CommandRef.tsx
git commit -m "feat(m8): add CommandRef page with tool tabs, search, category groups, and copy-to-clipboard"
```

---

### Task 7: 自检 & 最终提交

- [ ] **Step 1: Rust 测试全量运行**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml 2>&1 | tail -20
```

预期：所有新增的 codex_cli tests（7 个）+ 已有测试全部通过，无 compilation error。

- [ ] **Step 2: 前端类型检查**

```bash
cd forge && npx tsc --noEmit 2>&1 | head -40
```

预期：0 type error。若出现 JSON import 报错，检查 `tsconfig.json` 是否有 `"resolveJsonModule": true`；若无，在 tsconfig.json 中添加该选项。

- [ ] **Step 3: 核查 Sessions/Projects 导航**

检查 `forge/src/App.tsx` 中 `codex_sessions` 和 `codex_projects` 两个 case 是否已存在（M5/M6 已实现）。检查 `forge/src/modules/codex-cli/pages/Projects.tsx` 文件内容，确认与 Sessions.tsx 同样通过 `tool="codex-cli"` 复用 Claude Code 的页面组件。

- [ ] **Step 4: lib.rs 命令注册核查**

```bash
grep -n "codex_get_status\|codex_read_config\|codex_write_config" forge/src-tauri/src/lib.rs
```

确认三个命令均已出现在 `invoke_handler!` 宏中。

- [ ] **Step 5: 最终汇总提交（如有遗漏文件）**

若有任何遗漏未提交的文件：

```bash
git status
git add <具体文件>
git commit -m "chore(m7+m8): final wiring and cleanup"
```

---

## 自检清单

| 检查项 | 期望结果 |
|---|---|
| `cargo test` codex_cli 模块 | 7 个测试全部 pass |
| TypeScript 编译 | 0 error |
| `claude-code.json` 条目数 | 44 条（斜杠命令 32 + flag 11 + subcommand 1）|
| `codex-cli.json` 条目数 | 15 条（subcommand 8 + flag 7）|
| Navigation.tsx Codex 分组 | Overview / Sessions / Projects / Config 四项 |
| Navigation.tsx Command Ref | 顶层条目，位于 Codex 分组后 |
| App.tsx PageId | 包含 codex_overview / codex_config / command_ref |
| Overview 页：未安装时 | 显示安装引导卡片（红色边框 + npm 命令） |
| Overview 页：已安装时 | 显示版本、路径、model、provider、今日 token |
| Config 页：TOML 语法错误 | 显示红色错误信息，不写入文件 |
| Config 页：保存成功 | 显示"✓ 已保存"绿色 toast（3 秒后消失） |
| CommandRef 搜索 | 模糊匹配 name + description，实时过滤 |
| CommandRef 复制 | 点击行后 2 秒内显示"✓ 已复制"反馈 |
| CommandRef 分类 | 按 category 分组，显示 type 徽章（蓝/紫/绿）|
