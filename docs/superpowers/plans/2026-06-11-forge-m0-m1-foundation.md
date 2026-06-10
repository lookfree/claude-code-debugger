# Forge M0+M1 基础实施计划（脚手架 + Rust 后端核心）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 Forge（Tauri v2）项目骨架，并实现经过测试的 Rust 后端核心：原子写入、Claude/Codex 配置读写（保留未知字段）、SQLite 迁移、工具检测，前端展示工具检测结果。

**Architecture:** Tauri v2 桌面应用，代码位于仓库 `forge/` 子目录。Rust 后端分 `config/`（配置文件读写）、`db/`（SQLite + 迁移）、`commands/`（Tauri 命令）三个模块；前端 React + TS（Vite），本阶段只做一个最小页面调用 `detect_tools` 验证 IPC 通路。

**Tech Stack:** Tauri 2、Rust（serde_json / toml / rusqlite / which / dirs / tempfile）、React 18 + TypeScript + Vite、npm（本机无 pnpm）。

**Scope:** 仅覆盖设计文档（`docs/superpowers/specs/2026-06-04-superdev-platform-design.md`）的 M0 与 M1。M2（CLI Runner / PTY）、M3（Model Switcher）等在后续计划中另行制定。

**约定：** 所有命令在仓库根目录 `/Users/wuhoujin/Documents/projects/superchat` 执行，除非另有说明。Rust 测试统一用 `cargo test --manifest-path forge/src-tauri/Cargo.toml`。

---

### Task 1: 脚手架 — 创建 Tauri v2 项目

**Files:**
- Create: `forge/`（由 create-tauri-app 生成：`package.json`、`vite.config.ts`、`src/`、`src-tauri/` 等）
- Modify: `forge/src-tauri/tauri.conf.json`

- [ ] **Step 1: 生成项目**

```bash
npm create tauri-app@latest forge -- --template react-ts --manager npm --yes
```

预期：生成 `forge/` 目录，含 `src-tauri/`。若 `--yes` 不被支持，逐项交互输入：name=forge, identifier=com.forge-dev.app, frontend=TypeScript/React, manager=npm。

- [ ] **Step 2: 安装依赖并验证编译**

```bash
cd forge && npm install && npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

预期：vite build 成功；`cargo check` 编译通过（首次需下载 crates，耗时数分钟）。

- [ ] **Step 3: 修改应用标识**

编辑 `forge/src-tauri/tauri.conf.json`，将以下字段改为：

```json
{
  "productName": "Forge",
  "identifier": "com.forge-dev.app"
}
```

（只改这两个字段，其余保持模板默认。）

- [ ] **Step 4: 确认 .gitignore 覆盖产物目录**

检查 `forge/.gitignore` 含 `node_modules` 与 `dist`，`forge/src-tauri/.gitignore`（或同文件）含 `/target`。缺失则补上。

- [ ] **Step 5: 提交**

```bash
git add forge && git commit -m "feat(forge): scaffold Tauri v2 + React-TS project (M0)"
```

---

### Task 2: 添加 Rust 依赖

**Files:**
- Modify: `forge/src-tauri/Cargo.toml`

- [ ] **Step 1: 添加依赖**

```bash
cargo add --manifest-path forge/src-tauri/Cargo.toml toml rusqlite --features rusqlite/bundled
cargo add --manifest-path forge/src-tauri/Cargo.toml which dirs
cargo add --manifest-path forge/src-tauri/Cargo.toml --dev tempfile
```

（模板已含 `serde`、`serde_json`、`tauri`；`rusqlite` 用 bundled 特性避免系统 SQLite 依赖。）

- [ ] **Step 2: 验证编译**

```bash
cargo check --manifest-path forge/src-tauri/Cargo.toml
```

预期：通过。

- [ ] **Step 3: 提交**

```bash
git add forge/src-tauri/Cargo.toml forge/src-tauri/Cargo.lock
git commit -m "chore(forge): add rust deps (toml, rusqlite, which, dirs, tempfile)"
```

---

### Task 3: 原子写入模块（TDD）

**Files:**
- Create: `forge/src-tauri/src/config/mod.rs`
- Create: `forge/src-tauri/src/config/atomic.rs`
- Modify: `forge/src-tauri/src/lib.rs`（声明 `mod config;`）

- [ ] **Step 1: 创建模块骨架 + 失败测试**

`forge/src-tauri/src/config/mod.rs`：

```rust
pub mod atomic;
```

在 `forge/src-tauri/src/lib.rs` 顶部加：

```rust
pub mod config;
```

`forge/src-tauri/src/config/atomic.rs`（先只写测试，函数体留 `todo!()`）：

```rust
use std::path::Path;

pub fn write_atomic(_path: &Path, _content: &str) -> Result<(), String> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_new_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.json");
        write_atomic(&path, "hello").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello");
    }

    #[test]
    fn overwrites_existing_and_leaves_no_tmp() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.json");
        std::fs::write(&path, "old").unwrap();
        write_atomic(&path, "new").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert!(!dir.path().join("a.tmp").exists());
    }

    #[test]
    fn creates_parent_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/deep/a.json");
        write_atomic(&path, "x").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "x");
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml config::atomic
```

预期：3 个测试 panic（`not yet implemented`）。

- [ ] **Step 3: 实现**

替换 `write_atomic` 函数体：

```rust
use std::fs;
use std::io::Write;
use std::path::Path;

pub fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("path has no parent dir")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml config::atomic
```

预期：3 passed。

- [ ] **Step 5: 提交**

```bash
git add forge/src-tauri/src
git commit -m "feat(forge): atomic file write (tmp + fsync + rename)"
```

---

### Task 4: Claude 配置读写 — 保留未知字段（TDD）

**Files:**
- Create: `forge/src-tauri/src/config/claude.rs`
- Modify: `forge/src-tauri/src/config/mod.rs`

- [ ] **Step 1: 写失败测试**

`forge/src-tauri/src/config/mod.rs` 改为：

```rust
pub mod atomic;
pub mod claude;
```

`forge/src-tauri/src/config/claude.rs`：

```rust
use serde_json::Value;
use std::path::{Path, PathBuf};

use super::atomic::write_atomic;

/// ~/.claude.json 的默认路径
pub fn default_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude.json"))
}

pub fn read_json(_path: &Path) -> Result<Value, String> {
    todo!()
}

/// 读取-修改-写回：只覆盖 updates 中的字段，未知字段原样保留（设计文档"兼容 Claude Code 快速迭代"）
pub fn merge_fields(_path: &Path, _updates: &Value) -> Result<(), String> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn read_missing_file_returns_empty_object() {
        let dir = tempfile::tempdir().unwrap();
        let v = read_json(&dir.path().join("nope.json")).unwrap();
        assert_eq!(v, json!({}));
    }

    #[test]
    fn merge_preserves_unknown_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("claude.json");
        std::fs::write(&path, r#"{"apiKey":"old","futureField":{"a":1}}"#).unwrap();
        merge_fields(&path, &json!({"apiKey": "new"})).unwrap();
        let doc = read_json(&path).unwrap();
        assert_eq!(doc["apiKey"], "new");
        assert_eq!(doc["futureField"]["a"], 1);
    }

    #[test]
    fn merge_creates_file_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("claude.json");
        merge_fields(&path, &json!({"apiKey": "k"})).unwrap();
        assert_eq!(read_json(&path).unwrap()["apiKey"], "k");
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml config::claude
```

预期：3 个测试 panic。

- [ ] **Step 3: 实现**

替换两个 `todo!()`：

```rust
pub fn read_json(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(Default::default()));
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

pub fn merge_fields(path: &Path, updates: &Value) -> Result<(), String> {
    let mut doc = read_json(path)?;
    let obj = doc.as_object_mut().ok_or("root is not a JSON object")?;
    let upd = updates.as_object().ok_or("updates must be a JSON object")?;
    for (k, v) in upd {
        obj.insert(k.clone(), v.clone());
    }
    let pretty = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
    write_atomic(path, &pretty)
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml config::claude
```

预期：3 passed。

- [ ] **Step 5: 提交**

```bash
git add forge/src-tauri/src
git commit -m "feat(forge): claude config read/merge preserving unknown fields"
```

---

### Task 5: Codex 配置读写 — TOML 保留未知字段（TDD）

**Files:**
- Create: `forge/src-tauri/src/config/codex.rs`
- Modify: `forge/src-tauri/src/config/mod.rs`

- [ ] **Step 1: 写失败测试**

`forge/src-tauri/src/config/mod.rs` 改为：

```rust
pub mod atomic;
pub mod claude;
pub mod codex;
```

`forge/src-tauri/src/config/codex.rs`：

```rust
use std::path::{Path, PathBuf};
use toml::Table;

use super::atomic::write_atomic;

/// ~/.codex/config.toml 的默认路径
pub fn default_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".codex/config.toml"))
}

pub fn read_toml(_path: &Path) -> Result<Table, String> {
    todo!()
}

pub fn merge_fields(_path: &Path, _updates: &Table) -> Result<(), String> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_missing_file_returns_empty_table() {
        let dir = tempfile::tempdir().unwrap();
        let t = read_toml(&dir.path().join("nope.toml")).unwrap();
        assert!(t.is_empty());
    }

    #[test]
    fn merge_preserves_unknown_sections() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(&path, "model = \"old\"\n\n[future_section]\na = 1\n").unwrap();
        let updates: Table = toml::from_str("model = \"new\"").unwrap();
        merge_fields(&path, &updates).unwrap();
        let doc = read_toml(&path).unwrap();
        assert_eq!(doc["model"].as_str(), Some("new"));
        assert_eq!(doc["future_section"]["a"].as_integer(), Some(1));
    }

    #[test]
    fn merge_creates_file_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        let updates: Table = toml::from_str("model = \"m\"").unwrap();
        merge_fields(&path, &updates).unwrap();
        assert_eq!(read_toml(&path).unwrap()["model"].as_str(), Some("m"));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml config::codex
```

预期：3 个测试 panic。

- [ ] **Step 3: 实现**

```rust
pub fn read_toml(path: &Path) -> Result<Table, String> {
    if !path.exists() {
        return Ok(Table::new());
    }
    let raw = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    toml::from_str(&raw).map_err(|e| e.to_string())
}

pub fn merge_fields(path: &Path, updates: &Table) -> Result<(), String> {
    let mut doc = read_toml(path)?;
    for (k, v) in updates {
        doc.insert(k.clone(), v.clone());
    }
    let out = toml::to_string_pretty(&doc).map_err(|e| e.to_string())?;
    write_atomic(path, &out)
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml config::codex
```

预期：3 passed。

- [ ] **Step 5: 提交**

```bash
git add forge/src-tauri/src
git commit -m "feat(forge): codex toml config read/merge preserving unknown fields"
```

---

### Task 6: SQLite 数据库与迁移（TDD）

**Files:**
- Create: `forge/src-tauri/src/db/mod.rs`
- Create: `forge/src-tauri/src/db/migrations/001_providers.sql`
- Create: `forge/src-tauri/src/db/migrations/002_usage.sql`
- Modify: `forge/src-tauri/src/lib.rs`（声明 `pub mod db;`）

- [ ] **Step 1: 写迁移 SQL**

`forge/src-tauri/src/db/migrations/001_providers.sql`：

```sql
CREATE TABLE providers (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    is_preset           INTEGER NOT NULL DEFAULT 0,
    claude_code_config  TEXT,
    codex_cli_config    TEXT,
    created_at          INTEGER NOT NULL
);

CREATE TABLE active_providers (
    tool        TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id)
);
```

`forge/src-tauri/src/db/migrations/002_usage.sql`：

```sql
CREATE TABLE sessions (
    id            TEXT PRIMARY KEY,
    tool          TEXT NOT NULL,
    working_dir   TEXT NOT NULL,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    duration_sec  INTEGER,
    model         TEXT,
    input_tokens  INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd      REAL DEFAULT 0.0,
    raw_source    TEXT
);

CREATE TABLE projects (
    id             TEXT PRIMARY KEY,
    tool           TEXT NOT NULL,
    directory      TEXT NOT NULL,
    pinned         INTEGER NOT NULL DEFAULT 0,
    last_used_at   INTEGER,
    session_count  INTEGER DEFAULT 0,
    total_tokens   INTEGER DEFAULT 0,
    total_cost_usd REAL DEFAULT 0.0,
    UNIQUE(tool, directory)
);

CREATE TABLE env_vars (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_sessions_tool_started ON sessions(tool, started_at DESC);
CREATE INDEX idx_projects_tool_pinned  ON projects(tool, pinned DESC, last_used_at DESC);
```

- [ ] **Step 2: 写失败测试**

在 `forge/src-tauri/src/lib.rs` 加：

```rust
pub mod db;
```

`forge/src-tauri/src/db/mod.rs`：

```rust
use rusqlite::Connection;
use std::path::{Path, PathBuf};

const MIGRATIONS: &[(&str, &str)] = &[
    ("001_providers", include_str!("migrations/001_providers.sql")),
    ("002_usage", include_str!("migrations/002_usage.sql")),
];

/// 默认数据库路径：<data_local_dir>/forge/forge.db
pub fn default_path() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("forge/forge.db"))
}

pub fn open(_path: &Path) -> Result<Connection, String> {
    todo!()
}

pub fn migrate(_conn: &Connection) -> Result<(), String> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table_exists(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
            [name],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn migrate_creates_all_tables() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        for t in ["providers", "active_providers", "sessions", "projects", "env_vars"] {
            assert!(table_exists(&conn, t), "missing table {t}");
        }
    }

    #[test]
    fn migrate_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        migrate(&conn).unwrap(); // 第二次不应报错（已应用的跳过）
    }

    #[test]
    fn open_creates_parent_dir_and_migrates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/forge.db");
        let conn = open(&path).unwrap();
        assert!(table_exists(&conn, "providers"));
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml db::
```

预期：3 个测试 panic。

- [ ] **Step 4: 实现**

```rust
pub fn open(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY);")
        .map_err(|e| e.to_string())?;
    for (name, sql) in MIGRATIONS {
        let applied: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=?1)",
                [name],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !applied {
            conn.execute_batch(sql).map_err(|e| e.to_string())?;
            conn.execute("INSERT INTO schema_migrations(name) VALUES (?1)", [name])
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml db::
```

预期：3 passed。

- [ ] **Step 6: 提交**

```bash
git add forge/src-tauri/src
git commit -m "feat(forge): sqlite db with versioned migrations (providers/usage schema)"
```

---

### Task 7: 工具检测命令（TDD）

**Files:**
- Create: `forge/src-tauri/src/commands/mod.rs`
- Create: `forge/src-tauri/src/commands/tools.rs`
- Modify: `forge/src-tauri/src/lib.rs`（声明 `pub mod commands;`）

- [ ] **Step 1: 写失败测试**

在 `forge/src-tauri/src/lib.rs` 加：

```rust
pub mod commands;
```

`forge/src-tauri/src/commands/mod.rs`：

```rust
pub mod tools;
```

`forge/src-tauri/src/commands/tools.rs`：

```rust
use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct ToolStatus {
    pub name: String,
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

pub fn detect(_name: &str) -> ToolStatus {
    todo!()
}

/// Tauri 命令：检测 claude / codex / git / node / npm
#[tauri::command]
pub fn detect_tools() -> Vec<ToolStatus> {
    ["claude", "codex", "git", "node", "npm"]
        .iter()
        .map(|n| detect(n))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_finds_sh() {
        let t = detect("sh"); // POSIX 系统必有
        assert!(t.installed);
        assert!(t.path.is_some());
    }

    #[test]
    fn detect_missing_tool() {
        let t = detect("definitely-not-installed-xyz-123");
        assert!(!t.installed);
        assert!(t.path.is_none());
        assert!(t.version.is_none());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml commands::tools
```

预期：2 个测试 panic。

- [ ] **Step 3: 实现**

替换 `detect` 的 `todo!()`：

```rust
pub fn detect(name: &str) -> ToolStatus {
    match which::which(name) {
        Ok(p) => {
            let version = std::process::Command::new(&p)
                .arg("--version")
                .output()
                .ok()
                .filter(|o| o.status.success())
                .and_then(|o| {
                    String::from_utf8(o.stdout)
                        .ok()
                        .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
                });
            ToolStatus {
                name: name.to_string(),
                installed: true,
                path: Some(p.to_string_lossy().to_string()),
                version,
            }
        }
        Err(_) => ToolStatus {
            name: name.to_string(),
            installed: false,
            path: None,
            version: None,
        },
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cargo test --manifest-path forge/src-tauri/Cargo.toml commands::tools
```

预期：2 passed。

- [ ] **Step 5: 提交**

```bash
git add forge/src-tauri/src
git commit -m "feat(forge): tool detection command (which + version probe)"
```

---

### Task 8: 接线 — 注册命令 + 最小前端页面

**Files:**
- Modify: `forge/src-tauri/src/lib.rs`
- Modify: `forge/src/App.tsx`（整体替换）
- Modify: `forge/src/App.css`（清空或删除引用）

- [ ] **Step 1: 注册 Tauri 命令**

`forge/src-tauri/src/lib.rs` 的 `run()` 中，将模板的 `invoke_handler` 行改为（模板自带的 `greet` 命令一并删除）：

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![commands::tools::detect_tools])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

（注意：模板若无 `tauri_plugin_opener` 则不加该行；保持模板已有插件不动，只改 `invoke_handler`。）

- [ ] **Step 2: 替换前端页面**

`forge/src/App.tsx` 整体替换为：

```tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ToolStatus {
  name: string;
  installed: boolean;
  path: string | null;
  version: string | null;
}

function App() {
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<ToolStatus[]>("detect_tools")
      .then(setTools)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main
      style={{
        background: "#0f0f0f",
        color: "#e5e5e5",
        minHeight: "100vh",
        padding: 24,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Forge — 环境检测</h1>
      {error && <p style={{ color: "#ef4444" }}>{error}</p>}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {tools.map((t) => (
            <tr key={t.name} style={{ borderBottom: "1px solid #262626" }}>
              <td style={{ padding: "8px 12px" }}>
                {t.installed ? "🟢" : "⚪️"} {t.name}
              </td>
              <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>
                {t.path ?? "未安装"}
              </td>
              <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>
                {t.version ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

export default App;
```

若 `App.tsx` 原本 import 了 `./App.css` 或资源文件，删除这些 import。

- [ ] **Step 3: 全量验证**

```bash
cd forge && npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

预期：vite build 成功；全部 Rust 测试通过（共 11 个）；check 无错误。

- [ ] **Step 4: 提交**

```bash
git add forge
git commit -m "feat(forge): wire detect_tools IPC + minimal dark dashboard page (M1)"
```

---

### Task 9: 推送到 GitHub

- [ ] **Step 1: 推送**

```bash
git push origin main
```

预期：推送成功到 `lookfree/claude-code-debugger`。

- [ ] **Step 2: 冒烟验证（可选，需图形环境）**

```bash
cd forge && npm run tauri dev
```

预期：弹出 Forge 窗口，深色页面显示 claude/codex/git/node/npm 检测结果。确认后 Ctrl+C 退出。

---

## Self-Review 记录

- **Spec 覆盖**：M0（脚手架、SQLite migration 001+002）→ Task 1/2/6；M1（两工具配置读写、原子写入、进程/工具检测）→ Task 3/4/5/7。进程运行状态轮询（sysinfo）从 M1 推迟到使用管理阶段（M5/M6 计划），因为本阶段无消费方，符合 YAGNI。
- **占位符扫描**：无 TBD/TODO 占位；所有代码步骤含完整代码。
- **类型一致性**：`write_atomic(&Path, &str)` 在 Task 4/5 中的调用签名一致；`ToolStatus` 字段与前端 interface 一一对应（serde 默认字段名不转换，前端用同名 snake/plain 字段：name/installed/path/version，均为单词，无大小写问题）。
