# Forge — 设计规格文档
日期：2026-06-04

## 概述

**Forge** 是一个基于 Tauri v2 的原生桌面应用，作为两个 AI 编程 CLI 工具的统一控制中心：**Claude Code** 和 **Codex CLI**。

核心能力：
- **内嵌终端**：直接在 Forge 内启动并交互使用两个 CLI 工具（参考 Clauge Agent Mode）
- **模型/Provider 一键切换**：跨两个工具统一切换，原子写入配置（参考 ccswitch）
- **使用管理**：会话历史、项目工作区、token 用量统计（参考 Clauge Workspace）
- **命令参考**：两个工具的命令速查手册，内嵌在 App 中
- **Claude Code 配置管理**：保留原有 debugger 的全套功能（Skills/Hooks/MCP/Commands/Agents/CLAUDE.md）
- **系统托盘**：无需打开主窗口即可快速切换 Provider
- **UI 风格**：参考 ccswitch —— 深色、卡片式、信息密度高

---

## 目标与边界

### 目标

- 一个 App 管理两个 AI CLI 工具的全生命周期
- 内嵌 xterm.js 终端，可在 App 内直接与 claude / codex 交互
- Provider 预设库（50+ 条）+ 原子写入两工具配置文件，一键切换生效
- 每个工具的会话历史、项目工作区、token/费用统计
- 两个工具的命令速查模块
- 系统托盘支持快捷切换
- 原生二进制（~15-20MB），无 Electron 开销
- 对 Claude Code 的快速迭代保持前向兼容：未知配置字段原样保留、命令数据可独立于发版更新（见"兼容 Claude Code 快速迭代"章节）

### 不做

- Web 模式 / Express 备用服务器（舍弃）
- SSH 远程终端、REST 客户端、数据库管理
- 支持 OpenCode、Gemini CLI、OpenClaw 等第三个工具
- 云端同步
- Kanban 看板 / Markdown 工作区（Clauge 功能，暂不做）

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri v2 |
| 后端语言 | Rust |
| 前端 | React 18 + TypeScript |
| UI 组件 | shadcn/ui + Tailwind CSS |
| 状态管理 | Zustand |
| 终端渲染 | xterm.js |
| PTY 后端 | `portable-pty` Rust crate（跨平台伪终端） |
| Git 操作 | `git2` Rust crate（纯 Rust，无需系统 git 命令） |
| 命令路径检测 | `which` Rust crate |
| 持久化 | SQLite（rusqlite）存 Provider/会话/项目数据；文件 I/O 读写工具配置 |
| IPC | Tauri `invoke()` 命令 |
| 文件监听 | Rust `notify` crate |
| 进程管理 | Rust `tokio::process` + `sysinfo` crate |
| 构建 | Vite（前端）+ Cargo（Rust） |
| i18n | i18next，中英双语 |

---

## UI 风格规范

参考 **ccswitch** 视觉设计语言：

| 元素 | 规格 |
|---|---|
| 主题 | 纯深色，背景 `#0f0f0f` / `#141414`，暂不做浅色模式 |
| 布局 | 固定左侧边栏（240px）+ 主内容区；侧边栏含图标 + 文字 |
| 卡片 | Provider / Preset 以卡片展示，带边框、hover 阴影、状态徽章 |
| 字体 | 路径/Token/ID 用等宽字体；标签用无衬线字体；行高紧凑 |
| 配色 | 中性灰底，蓝色 `#3b82f6` 作为激活/主操作色，绿=运行，红=错误，黄=警告 |
| 状态点 | `●` 彩色圆点表示进程状态（绿=运行，灰=空闲，红=错误） |
| 按钮 | 次要操作用小圆角胶囊按钮；主操作（Activate / Launch）用实心按钮 |
| 密度 | 高密度，列表优先用表格而非大卡片，避免过多留白 |
| 终端 | xterm.js 默认深色主题，光标颜色使用 App 蓝色强调色 |

---

## 整体架构

### 层次图

```
┌──────────────────────────────────────────────────┐
│              React 前端                          │
│  shell/  modules/{runner,ref,claude-code,        │
│          codex-cli,model-switcher,               │
│          dashboard}/  lib/tauri.ts               │
└─────────────────┬────────────────────────────────┘
                  │ invoke() / Tauri 事件
┌─────────────────▼────────────────────────────────┐
│           Rust 后端（src-tauri）                 │
│  commands/  config/  db/  pty/  tray.rs          │
└─────────────────┬────────────────────────────────┘
                  │ 文件 I/O / SQLite / PTY
┌─────────────────▼────────────────────────────────┐
│              操作系统 / 文件系统                 │
│  ~/.claude/  ~/.codex/                           │
│  ~/.local/share/forge/forge.db                   │
└──────────────────────────────────────────────────┘
```

### 目录结构

```
forge/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── lib.rs                    ← 命令注册中心
│       ├── pty/
│       │   ├── mod.rs                ← PTY 会话管理
│       │   └── session.rs            ← 单个 PTY 会话（stdin/stdout/resize）
│       ├── commands/
│       │   ├── runner.rs             ← 创建/销毁/发送输入到 PTY 会话
│       │   ├── claude_code/
│       │   │   ├── skills.rs
│       │   │   ├── agents.rs
│       │   │   ├── hooks.rs
│       │   │   ├── mcp.rs
│       │   │   ├── commands.rs
│       │   │   ├── claudemd.rs
│       │   │   ├── git.rs            ← NEW：git2 crate，分支/提交/状态
│       │   │   ├── worktrees.rs      ← NEW：worktree 列表/创建/删除
│       │   │   ├── environment.rs    ← NEW：env var 读写 + PATH 检测
│       │   │   └── usage.rs          ← 解析 ~/.claude/projects/ + debug/
│       │   ├── codex_cli/
│       │   │   ├── config.rs
│       │   │   └── usage.rs
│       │   ├── model_switcher/
│       │   │   ├── presets.rs        ← 内置 50+ 预设，SQLite 读写
│       │   │   └── switcher.rs       ← 原子写入两工具配置
│       │   └── dashboard.rs          ← 跨工具用量聚合
│       ├── db/
│       │   ├── mod.rs
│       │   ├── migrations/
│       │   │   ├── 001_providers.sql
│       │   │   └── 002_usage.sql
│       │   ├── providers.rs
│       │   ├── sessions.rs
│       │   └── projects.rs
│       ├── config/
│       │   ├── claude.rs             ← ~/.claude.json + ~/.claude/settings.json
│       │   └── codex.rs              ← ~/.codex/config.toml
│       └── tray.rs                   ← 系统托盘
│
└── src/
    ├── shell/
    │   ├── ModuleRegistry.ts
    │   └── Navigation.tsx            ← 二级侧边栏
    ├── modules/
    │   ├── dashboard/pages/
    │   │   └── Dashboard.tsx
    │   ├── runner/
    │   │   ├── pages/
    │   │   │   └── Runner.tsx        ← xterm.js 终端面板（多标签）
    │   │   └── components/
    │   │       ├── TerminalTab.tsx
    │   │       └── LaunchBar.tsx     ← 工具选择 + 工作目录选择
    │   ├── command-ref/pages/
    │   │   └── CommandRef.tsx        ← 命令速查手册
    │   ├── claude-code/pages/
    │   │   ├── Overview.tsx
    │   │   ├── Sessions.tsx
    │   │   ├── Projects.tsx
    │   │   ├── Git.tsx               ← NEW
    │   │   ├── Worktrees.tsx         ← NEW
    │   │   ├── Environment.tsx       ← NEW
    │   │   ├── Skills.tsx
    │   │   ├── Agents.tsx
    │   │   ├── Hooks.tsx
    │   │   ├── MCP.tsx
    │   │   ├── Commands.tsx
    │   │   ├── ClaudeMd.tsx
    │   │   └── Graph.tsx
    │   ├── codex-cli/pages/
    │   │   ├── Overview.tsx
    │   │   ├── Sessions.tsx
    │   │   ├── Projects.tsx
    │   │   └── Config.tsx
    │   └── model-switcher/pages/
    │       ├── Providers.tsx
    │       └── Presets.tsx
    ├── lib/
    │   └── tauri.ts                  ← invoke() 封装，替代 api.ts
    └── shared/types/                 ← TypeScript 类型定义
```

---

## 模块设计

### 导航结构

```
侧边栏
├── Dashboard              ← 全局用量概览
├── CLI Runner             ← 内嵌终端（核心功能）
│   ├── Claude Code        ← 在 App 内交互使用 claude CLI
│   └── Codex CLI          ← 在 App 内交互使用 codex CLI
├── Command Ref            ← 两个工具命令速查
├── Claude Code
│   ├── Overview
│   ├── Sessions
│   ├── Projects
│   ├── Git                          ← NEW：Git 状态、提交、分支管理
│   ├── 工作树                        ← NEW：Worktree 创建/切换/删除
│   ├── 环境                          ← NEW：环境变量 + PATH 检测
│   ├── Skills
│   ├── Agents
│   ├── Hooks
│   ├── MCP Servers
│   ├── Commands
│   ├── CLAUDE.md
│   └── Graph
├── Codex CLI
│   ├── Overview
│   ├── Sessions
│   ├── Projects
│   └── Config
└── Model Switcher
    ├── Providers
    └── Presets
```

---

### CLI Runner 模块（核心新功能）

Forge 的最差异化能力：**在 App 内直接启动并交互使用两个 AI CLI 工具**，无需离开应用打开外部终端。

#### 技术实现

```
xterm.js（React 前端渲染终端）
     ↕ Tauri 事件（pty:output / pty:input）
Rust PTY 层（portable-pty crate）
     ↕ 伪终端
系统 Shell → claude / codex 进程
```

PTY 会话生命周期：
1. 前端调用 `invoke('pty_create', { tool, workingDir })` → Rust 创建 PTY，启动目标 CLI 进程
2. Rust 通过 Tauri 事件 `pty:output:{sessionId}` 持续推送进程输出
3. 前端 xterm.js 接收输出并渲染
4. 用户键盘输入 → 前端调用 `invoke('pty_write', { sessionId, data })` → Rust 写入 PTY stdin
5. 终端窗口大小变化 → `invoke('pty_resize', { sessionId, cols, rows })`
6. 关闭标签 → `invoke('pty_kill', { sessionId })`

#### Runner 页面布局

```
┌─ CLI Runner ──────────────────────────────────────────┐
│ [+ Claude Code ▾] [工作目录: ~/projects/superchat ▾]  │  ← LaunchBar
│                                                        │
│ ┌─ claude ─────────┐ ┌─ codex ──────────┐ [+]        │  ← 多标签
│ │ ● running        │ │ ○ idle           │             │
│ └──────────────────┘ └──────────────────┘             │
│ ┌────────────────────────────────────────────────────┐ │
│ │                                                    │ │
│ │  Claude Code CLI v1.x.x                            │ │  ← xterm.js
│ │  > /help                                           │ │
│ │  Available commands:                               │ │
│ │    /clear  /compact  /resume  /init ...            │ │
│ │  ▌                                                 │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

- 每个标签对应一个 PTY 会话
- 同一工具可开多个标签（多项目并行）
- 标签显示工具名 + 运行状态点
- LaunchBar：下拉选择工具（Claude Code / Codex）+ 目录选择器（下拉最近目录 + 浏览按钮）

#### Rust PTY 核心

```rust
// src-tauri/src/pty/session.rs
pub struct PtySession {
    pub id: String,
    pub tool: String,
    pub working_dir: PathBuf,
    master: Box<dyn MasterPty>,
    child: Box<dyn Child>,
    writer: Box<dyn Write + Send>,
}

// src-tauri/src/commands/runner.rs
#[tauri::command]
async fn pty_create(
    tool: &str,
    working_dir: &str,
    app: AppHandle,
) -> Result<String, String> {
    let cmd = match tool {
        "claude-code" => "claude",
        "codex-cli"   => "codex",
        _ => return Err("unknown tool".into()),
    };
    let session_id = uuid::Uuid::new_v4().to_string();
    let session = PtySession::spawn(cmd, working_dir, &session_id, app)?;
    PTY_SESSIONS.lock().await.insert(session_id.clone(), session);
    Ok(session_id)
}
```

---

### Command Ref 模块（命令速查）

一个内嵌在 Forge 中的命令速查手册，覆盖两个工具的全部常用命令，方便用户在使用 CLI Runner 时随时查阅。

#### 页面布局

```
┌─ Command Ref ─────────────────────────────────────────┐
│ [Claude Code] [Codex CLI]              🔍 搜索命令   │  ← 工具 Tab + 搜索
├───────────────────────────────────────────────────────┤
│ 会话控制                                               │
│  /clear          清除当前对话上下文                    │
│  /compact        压缩对话历史（保留摘要）              │
│  /resume         恢复上次会话                          │
│  /exit           退出 Claude Code                      │
├───────────────────────────────────────────────────────┤
│ 文件与上下文                                           │
│  /add <file>     将文件加入上下文                      │
│  /init           初始化 CLAUDE.md                      │
├───────────────────────────────────────────────────────┤
│ 工具与 MCP                                             │
│  /mcp            查看当前 MCP 服务器状态               │
│  /tools          列出可用工具                          │
├───────────────────────────────────────────────────────┤
│ 模型与配置                                             │
│  --model <id>    启动时指定模型                        │
│  --verbose       显示详细日志                          │
│  --debug         开启 debug 模式                       │
└───────────────────────────────────────────────────────┘
```

#### 数据来源

命令数据以 **静态 JSON 文件** 内嵌在 App 中，随版本更新维护：

```
src/modules/command-ref/data/
├── claude-code.json    ← Claude Code 斜杠命令 + CLI flags
└── codex-cli.json      ← Codex CLI 命令 + flags
```

每条命令结构：
```typescript
interface CommandEntry {
  name: string          // "/clear" 或 "--model"
  type: 'slash' | 'flag' | 'subcommand'
  category: string      // "会话控制" | "文件与上下文" | ...
  description: string   // 中英双语
  example?: string      // 示例用法
}
```

支持全文搜索（按名称 + 描述模糊匹配），点击命令可复制到剪贴板。

---

### Claude Code 模块

现有 debugger 全部功能，从 Electron IPC 迁移为 Tauri `invoke()` 命令，React 页面代码大部分复用。

| Rust 命令 | 替代原 Electron 通道 |
|---|---|
| `get_skills` / `save_skill` / `delete_skill` | `skills:getAll` / `:save` / `:delete` |
| `get_hooks` / `save_hook` / `test_hook` | `hooks:getAll` / `:save` / `:test` |
| `launch_debug_session` / `stop_debug_session` | `hooks:launchDebugSession` / `:stop` |
| `get_mcp` / `save_mcp` / `test_mcp_connection` | `mcp:getAll` / `:save` / `:testConnection` |
| `get_commands` / `save_command` | `commands:getAll` / `:save` |
| `get_agents` / `save_agent` | `agents:getAll` / `:save` |
| `get_claudemd` / `save_claudemd` | `claudemd:get` / `:save` |
| `get_dependency_graph` | `dependencies:getGraph` |

Hook 执行（`launch_debug_session`）使用 `tokio::process::Command` 启动子进程，stdout/stderr 通过 Tauri 事件流式推送到前端。

文件监听使用 `notify` crate 替代 chokidar，变更时推送 `files:changed` 事件。

#### Git 页面

在 Forge 内管理当前项目的 Git 状态，无需离开 App 操作终端。

Rust 后端使用 `git2` crate（纯 Rust Git 实现，无需依赖系统 git 命令）。

**页面布局：**

```
Git — ~/projects/forge
┌─── 当前状态 ──────────────────────────────────────────┐
│ 分支: main  ↑2 ↓0   最后提交: feat: add runner (2h前) │
├─── 变更文件 ──────────────────────────────────────────┤
│ M  src/modules/claude-code/pages/Skills.tsx           │
│ M  src-tauri/src/commands/claude_code/skills.rs       │
│ ?  src/modules/claude-code/pages/Git.tsx              │
│ [全选] [暂存选中]                                      │
├─── 提交 ──────────────────────────────────────────────┤
│ [提交信息输入框]                        [提交] [推送]  │
├─── 分支 ──────────────────────────────────────────────┤
│ main ✓   feature/runner   [新建分支] [切换] [合并]     │
├─── 最近提交 ──────────────────────────────────────────┤
│ abc1234  feat: add runner module         2h 前         │
│ def5678  chore: scaffold tauri project   1d 前         │
└───────────────────────────────────────────────────────┘
```

**Rust 命令：**

```rust
// src-tauri/src/commands/claude_code/git.rs
#[tauri::command]
pub fn git_status(repo_path: &str) -> Result<GitStatus, String>
// 返回: { branch, ahead, behind, staged, unstaged, untracked }

#[tauri::command]
pub fn git_stage(repo_path: &str, paths: Vec<String>) -> Result<(), String>

#[tauri::command]
pub fn git_commit(repo_path: &str, message: &str) -> Result<String, String>
// 返回: commit hash

#[tauri::command]
pub fn git_push(repo_path: &str) -> Result<(), String>

#[tauri::command]
pub fn git_branches(repo_path: &str) -> Result<Vec<BranchInfo>, String>

#[tauri::command]
pub fn git_checkout(repo_path: &str, branch: &str) -> Result<(), String>

#[tauri::command]
pub fn git_log(repo_path: &str, limit: usize) -> Result<Vec<CommitInfo>, String>
```

`repo_path` 由前端从当前项目上下文传入（活跃的 Projects 条目路径）。

---

#### 工作树（Worktrees）页面

Git Worktree 是 Clauge 的核心能力之一：每个 Claude Code 会话可以在独立的 worktree 中运行，互不干扰。Forge 提供可视化的 worktree 管理界面。

**页面布局：**

```
工作树 — ~/projects/forge
┌──────────────────────────────────────────────────────────┐
│ 主工作树                                                  │
│ 路径: ~/projects/forge       分支: main      ● 活跃      │
├──────────────────────────────────────────────────────────┤
│ worktree-feature-runner                                   │
│ 路径: ~/projects/forge/.worktrees/feature-runner          │
│ 分支: feature/runner         ○ 空闲                      │
│ [在 Runner 中打开]  [打开目录]  [删除]                    │
├──────────────────────────────────────────────────────────┤
│ [+ 新建工作树]                                            │
│   分支名: [___________]  路径（自动填充）  [创建]         │
└──────────────────────────────────────────────────────────┘
```

新建工作树时，默认路径为 `<repo>/.worktrees/<branch-name>`，并在 CLI Runner 中以该路径启动 Claude Code。

**Rust 命令：**

```rust
// src-tauri/src/commands/claude_code/worktrees.rs
#[tauri::command]
pub fn list_worktrees(repo_path: &str) -> Result<Vec<WorktreeInfo>, String>
// WorktreeInfo { path, branch, is_main, is_locked }

#[tauri::command]
pub fn add_worktree(
    repo_path: &str,
    branch: &str,
    path: &str,        // 留空时自动填 <repo>/.worktrees/<branch>
    new_branch: bool,  // true = git worktree add -b
) -> Result<WorktreeInfo, String>

#[tauri::command]
pub fn remove_worktree(
    repo_path: &str,
    worktree_path: &str,
    force: bool,
) -> Result<(), String>
```

均使用 `git2` crate 操作，不依赖系统 `git` 命令。

---

#### 环境（Environment）页面

管理 Claude Code 运行所需的环境变量和系统配置，方便排查"工具找不到"、"API Key 缺失"等问题。

**页面布局：**

```
环境 — Claude Code
┌─── API 与模型 ────────────────────────────────────────┐
│ ANTHROPIC_API_KEY    ●●●●●●●●sk-ant-xxx   [编辑] [测试连接] │
│ CLAUDE_MODEL         claude-sonnet-4-5    [编辑]       │
├─── PATH 检测 ─────────────────────────────────────────┤
│ claude    ✅ /usr/local/bin/claude   v1.x.x            │
│ git       ✅ /usr/bin/git            v2.x.x            │
│ node      ✅ /usr/local/bin/node     v22.x.x           │
│ npm       ✅ /usr/local/bin/npm      v10.x.x           │
├─── 自定义环境变量 ────────────────────────────────────┤
│ CUSTOM_VAR_1   value1                  [编辑] [删除]   │
│ [+ 添加变量]                                           │
├─── ~/.claude/settings.json 快速入口 ─────────────────┤
│ [在 CLAUDE.md 页编辑]  [直接打开文件]                  │
└───────────────────────────────────────────────────────┘
```

**数据来源与存储：**

- **ANTHROPIC_API_KEY**：读取 `~/.claude.json` 中的 `apiKey` 字段（与 Model Switcher 共用数据源）
- **PATH 检测**：Rust 用 `which` crate 查找各命令路径，再用 `tokio::process` 执行 `--version` 获取版本号
- **自定义环境变量**：存入 SQLite `env_vars` 表，启动 CLI Runner 时注入到 PTY 环境

**Rust 命令：**

```rust
// src-tauri/src/commands/claude_code/environment.rs
#[tauri::command]
pub fn detect_tools() -> Result<Vec<ToolDetection>, String>
// ToolDetection { name, path, version, found }
// 检测: claude, git, node, npm, pnpm, bun

#[tauri::command]
pub fn get_env_vars() -> Result<Vec<EnvVar>, String>
// 从 SQLite env_vars 表读取自定义变量

#[tauri::command]
pub fn set_env_var(key: &str, value: &str) -> Result<(), String>

#[tauri::command]
pub fn delete_env_var(key: &str) -> Result<(), String>

#[tauri::command]
pub async fn test_api_connection() -> Result<bool, String>
// 用当前 API Key 发一个最小请求验证连通性
```

**与 CLI Runner 的集成：** 启动 PTY 会话时，`pty_create` 从 SQLite `env_vars` 表读取自定义变量并注入 PTY 环境：

```rust
let env_vars = db::get_env_vars().await?;
let mut cmd = CommandBuilder::new("claude");
for (k, v) in env_vars {
    cmd.env(k, v);
}
```

---

### Codex CLI 模块

**Overview 页**：安装检测（`codex --version`）、当前模型/Provider、今日 token 用量、固定项目快捷启动。

**Sessions / Projects 页**：见"使用管理"章节。

**Config 页**：Monaco Editor 编辑 `~/.codex/config.toml`，保存时原子写入。

---

### 使用管理（Clauge 启发）

两个工具各有 **Sessions**（会话历史）和 **Projects**（项目工作区）页面，顶层 Dashboard 聚合全部数据。

#### Sessions 页（每个工具）

按时间倒序展示该工具的历史会话：

```
Sessions — Claude Code
┌──────────────────────────────────────────────────────┐
│ 2026-06-04 14:32  ~/projects/forge      45 分钟      │
│ 模型: claude-sonnet-4-5  Token: 128k  预估: ¥2.76   │
│ [打开目录]  [在 Runner 中恢复]                       │
├──────────────────────────────────────────────────────┤
│ 2026-06-03 09:15  ~/projects/api       1 小时 12 分  │
│ 模型: claude-opus-4      Token: 340k  预估: ¥7.34   │
│ [打开目录]  [在 Runner 中恢复]                       │
└──────────────────────────────────────────────────────┘
```

"在 Runner 中恢复"：点击后自动在 CLI Runner 中打开一个新标签，以该会话的工作目录启动对应工具，并（如工具支持）传入 `--resume <sessionId>` 参数。

**数据来源**：

| 工具 | 会话数据位置 |
|---|---|
| Claude Code | `~/.claude/projects/`（已确认格式），`~/.claude/debug/` 补充执行日志 |
| Codex CLI | M4 阶段实现时通过检查 `~/.codex/` 目录结构确定 |

若某工具不以可读文件暴露会话历史，则该工具的 Sessions 页仅展示 Forge 通过进程监控直接观测到的会话记录。

#### Projects 页（每个工具）

列出该工具历史上使用过的所有项目目录，附加用量统计：

```
Projects — Claude Code
┌──────────────────────────────────────────────────────────┐
│ ★  ~/projects/forge        最后使用: 今天   8 次会话    │
│    累计 Token: 480k  累计费用: ¥13.82                    │
│    [打开]  [在 Runner 启动]  [取消固定]                  │
├──────────────────────────────────────────────────────────┤
│    ~/projects/api-server   最后使用: 3天前   3 次会话    │
│    累计 Token: 340k  累计费用: ¥7.34                     │
│    [打开]  [在 Runner 启动]  [固定 ★]                    │
└──────────────────────────────────────────────────────────┘
```

固定（★）的项目显示在各工具 Overview 页的快捷入口区域。

#### 全局 Dashboard

```
Dashboard
┌─── 今日 ──────────────────────────────────────────┐
│ 总 Token: 480k     预估总费用: ¥15.82             │
│ Claude Code: 400k（¥13.64）                       │
│ Codex CLI: 80k（¥2.18）                           │
└───────────────────────────────────────────────────┘

┌─── 30 天 Token 用量 ──────────────────────────────┐
│  [按天堆叠柱状图，两个工具分色]（recharts）        │
└───────────────────────────────────────────────────┘

┌─── 最近会话（全部工具）────────────────────────────┐
│ Claude Code  ~/projects/forge      今天    128k   │
│ Codex CLI    ~/projects/api        今天     80k   │
└───────────────────────────────────────────────────┘

┌─── 工具运行状态 ───────────────────────────────────┐
│ Claude Code  ● 运行中  PID 4821  ~/projects/forge │
│ Codex CLI    ○ 空闲                                │
└───────────────────────────────────────────────────┘
```

运行状态由 Rust 每 5 秒通过 `sysinfo` crate 轮询进程并推送 Tauri 事件更新。

#### Token 费用估算

使用 Rust 内置定价表计算（仅显示"预估"，不接 Billing API）：

```rust
const PRICING: &[(&str, f64, f64)] = &[
    // (model_id, 输入每千 token 美元, 输出每千 token 美元)
    ("claude-sonnet-4-5", 0.003, 0.015),
    ("claude-opus-4",     0.015, 0.075),
    ("claude-haiku-4-5",  0.0008, 0.004),
    ("gpt-4o",            0.005,  0.015),
    // ...
];
```

---

### Model Switcher 模块

替代并大幅扩展原有 `providers.ts`，实现跨两工具的 Provider 统一管理。

**Providers 页**：所有已保存 Provider 的表格，每行显示名称、目标工具徽章、激活按钮、编辑/删除操作。支持 JSON 粘贴导入。

**Presets 页**：50+ 内置只读预设，用户可克隆后自定义。

**切换流程**：
1. 用户选择 Provider，勾选要应用到哪些工具
2. 前端调用 `invoke('switch_provider', { providerId, targets })`
3. Rust 从 SQLite 读取 Provider 配置
4. 对每个目标工具，调用对应的 `config::*::write()` 进行原子写入
5. 返回每工具结果：`{ tool, success, hotReload }`
6. Claude Code 支持热切换（无需重启）；Codex 显示"请重启工具"提示

**原子写入**：写入 `<path>.tmp` → `fsync` → `rename`（POSIX 原子操作，防止配置损坏）

**内置预设分类**：
- Anthropic：Claude Sonnet 4.5、Claude Opus 4、Claude Haiku 4.5
- OpenAI：GPT-4o、GPT-4o-mini、o3
- 本地模型：Ollama（llama3、mistral、qwen）
- 其他：Qwen-Max、DeepSeek-V3、Gemini 2.5 Pro

每条预设按工具分存配置片段：
```json
{
  "claude_code": { "model": "claude-sonnet-4-5" },
  "codex_cli":   { "model": "claude-sonnet-4-5", "provider": "anthropic" }
}
```

一条预设可仅覆盖部分工具（如 GPT-4o 预设不含 `claude_code` 配置，因为 Claude Code 仅支持 Anthropic）。

---

### 系统托盘

```
托盘菜单
├── 当前 Provider: claude-sonnet-4-5   ← 信息栏（不可点击）
├── ─────────────────────────────
├── Claude Sonnet 4.5    ✓
├── Claude Opus 4
├── Claude Haiku 4.5
├── GPT-4o
├── DeepSeek-V3
├── ─────────────────────────────
├── 打开 Forge
└── 退出
```

点击预设即对所有该预设支持的工具执行切换。托盘标题实时显示当前激活的 Provider 名称。

---

## 数据层

### SQLite 数据库

路径：`~/.local/share/forge/forge.db`（Linux/macOS）或 `%APPDATA%\forge\forge.db`（Windows）

```sql
-- 001_providers.sql

CREATE TABLE providers (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    is_preset           INTEGER NOT NULL DEFAULT 0,
    claude_code_config  TEXT,   -- JSON 片段或 NULL
    codex_cli_config    TEXT,
    created_at          INTEGER NOT NULL
);

CREATE TABLE active_providers (
    tool        TEXT PRIMARY KEY,   -- 'claude-code' | 'codex-cli'
    provider_id TEXT NOT NULL REFERENCES providers(id)
);

-- 002_usage.sql

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
    raw_source    TEXT              -- 原始会话文件路径
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

### 工具配置文件路径

| 工具 | 配置文件 |
|---|---|
| Claude Code | `~/.claude.json`（API Key + 模型）、`~/.claude/settings.json`（工具配置） |
| Codex CLI | `~/.codex/config.toml` |

---

## IPC 接口（前端 ↔ Rust）

```typescript
// src/lib/tauri.ts
import { invoke } from '@tauri-apps/api/core'

export const api = {
  // Claude Code 配置管理
  skills:   { getAll, get, save, delete: del },
  agents:   { getAll, get, save, delete: del },
  hooks:    { getAll, get, save, test, getLogs, launchDebugSession, stopDebugSession },
  mcp:      { getAll, get, save, delete: del, testConnection },
  commands: { getAll, get, save, delete: del },
  claudeMD: { get, getAll, save },
  graph:    { getDependencies },

  // Git
  git: {
    getStatus,     // (repoPath) => GitStatus
    stage,         // (repoPath, paths[]) => void
    commit,        // (repoPath, message) => commitHash
    push,          // (repoPath) => void
    getBranches,   // (repoPath) => BranchInfo[]
    checkout,      // (repoPath, branch) => void
    getLog,        // (repoPath, limit) => CommitInfo[]
  },

  // 工作树
  worktrees: {
    list,          // (repoPath) => WorktreeInfo[]
    add,           // (repoPath, branch, path, newBranch) => WorktreeInfo
    remove,        // (repoPath, worktreePath, force) => void
  },

  // 环境
  environment: {
    detectTools,       // () => ToolDetection[]
    getEnvVars,        // () => EnvVar[]
    setEnvVar,         // (key, value) => void
    deleteEnvVar,      // (key) => void
    testApiConnection, // () => bool
  },

  // 工具配置（Codex）
  codex:    { getStatus, readConfig, writeConfig },

  // CLI Runner（PTY）
  runner: {
    create,   // (tool, workingDir) => sessionId
    write,    // (sessionId, data) => void
    resize,   // (sessionId, cols, rows) => void
    kill,     // (sessionId) => void
    list,     // () => RunningSession[]
  },

  // Model Switcher
  modelSwitcher: {
    getProviders, getActiveProvider,
    addProvider, updateProvider, deleteProvider,
    switchProvider,   // (providerId, targets) => SwitchResult[]
    getPresets,
  },

  // 使用管理
  usage: {
    getSessions,      // (tool, limit?, offset?) => Session[]
    resumeSession,    // (id) => void  — 在 Runner 中打开新标签
    getProjects,      // (tool) => Project[]
    pinProject,       // (tool, dir) => void
    unpinProject,     // (tool, dir) => void
    launchInProject,  // (tool, dir) => void
    getDashboard,     // () => DashboardSummary
    getRunningTools,  // () => RunningTool[]
    getDailyUsage,    // (days) => DailyUsage[]
  },
}
```

所有函数返回 `Promise<T>`，错误通过 throw 传递，React 页面层做 try/catch 处理。

---

## 兼容 Claude Code 快速迭代

Claude Code 版本更新频繁，新斜杠命令、新 CLI flag、新配置字段、新的 `~/.claude/` 资产类型会持续出现。Forge 按以下原则设计，避免每次 Claude Code 更新都被动跟随发版：

### 配置读写：保留未知字段

所有对 `~/.claude.json`、`~/.claude/settings.json` 的写入采用 **读取-修改-写回** 模式：解析为 `serde_json::Value`，只修改 Forge 管理的字段，未识别的字段原样保留写回。禁止用固定 struct 反序列化后再整体序列化（会丢掉新版本新增的字段）。

### 会话数据：容错解析

`~/.claude/projects/` 的解析按"尽力而为"处理：

- 逐条解析，单条失败跳过并记录日志，不影响整体统计
- 未知字段忽略，缺失字段用默认值补齐
- 解析逻辑集中在 `usage.rs` 一处，格式变化时只需改一个文件

### Command Ref：命令数据与发版解耦

- 命令数据 JSON 内置一份基线，同时支持从远端（GitHub raw / jsDelivr）拉取更新覆盖本地缓存，无需等 Forge 发新版
- 页面标注数据对应的 Claude Code 版本（如"数据基于 v1.x"）
- LaunchBar 提供自定义启动参数输入框，Claude Code 新增的 flag 不依赖 Forge 更新即可直接使用

### 版本检测与功能门控

- 启动时检测 `claude --version` 并存入全局状态
- 依赖特定版本的功能（如配置热切换、`--resume`）按版本门控，低版本环境显示提示而非报错
- 检测到 Claude Code 大版本升级时，在 Overview 页提示"建议更新 Forge 命令数据"

### 模块可扩展性

- `~/.claude/` 下出现新资产目录（如未来新增 plugins、workflows 等）时，只需在 ModuleRegistry 注册新页面，导航与路由零改动
- 对暂未适配的新配置文件，提供通用的 Monaco "原始文件编辑"入口兜底，保证新功能至少可手动配置

---

## 错误处理

| 场景 | 处理方式 |
|---|---|
| 配置文件不存在 | 返回空/默认配置，UI 显示"未配置"状态 |
| 工具未安装 | `getStatus` 返回 `{ installed: false }`，Overview 页显示安装引导 |
| 原子写入失败 | Rust 返回错误，前端显示 toast，原配置文件保持不变 |
| PTY 进程崩溃 | stderr 捕获并在 Runner 终端内显示，标签状态变为红色 |
| Hook 进程崩溃 | stderr 展示在 Hooks 日志面板 |

---

## 测试策略

- Rust 单元测试：各 `config/*.rs` 的解析函数（`#[cfg(test)]`）
- Rust 集成测试：原子写入行为验证
- React 组件测试：Vitest + Testing Library，mock `invoke()`
- PTY 手动测试：每个工具启动 + 输入 + 关闭全流程
- 发布前手动冒烟测试清单（每个里程碑一份）

---

## 从 claude-code-debugger 迁移

全新 Tauri 项目，不 fork 原仓库。复用资产：

| 资产 | 处理方式 |
|---|---|
| `src/pages/*.tsx` | 迁移到 `src/modules/claude-code/pages/`，将 `api.*` 改为 `invoke()` |
| `shared/types/*.ts` | 直接复制，必要时调整字段名 |
| `src/components/ui/` | 直接复制（shadcn/ui 组件） |
| `src/i18n/` | 直接复制，补充新模块的翻译条目 |
| `src/components/layout/` | 改造为二级侧边栏导航 |
| `electron/ipc/*.ts` | 仅作逻辑参考，用 Rust 重写 |
| `electron/services/` | 仅作逻辑参考，用 Rust 重写 |
| `server/index.ts` | 舍弃（无 Web 模式） |

---

## 构建与发布

```json
// tauri.conf.json（关键字段）
{
  "productName": "Forge",
  "identifier": "com.forge-dev.app",
  "bundle": {
    "targets": ["dmg", "nsis", "deb", "appimage"]
  }
}
```

开发：`pnpm tauri dev`
生产构建：`pnpm tauri build`

---

## 里程碑计划

| # | 里程碑 | 内容 |
|---|---|---|
| M0 | 项目脚手架 | Tauri v2 初始化、Rust 工具链、Vite + React、SQLite migration 001+002 |
| M1 | Rust 后端核心 | 两工具配置读写、原子写入、进程检测（sysinfo） |
| M2 | CLI Runner | PTY 层（portable-pty）、Tauri 事件流、前端 xterm.js 多标签面板 |
| M3 | Model Switcher | 预设库、切换命令、系统托盘 |
| M4 | Claude Code 模块（配置管理） | Skills/Hooks/MCP/Commands/Agents/CLAUDE.md/Graph 页面迁移 |
| M4b | Claude Code 模块（Git/Worktrees/Environment） | git2 crate 集成，工作树管理，环境变量 + PATH 检测 |
| M5 | 使用管理数据层 | 两工具会话解析、SQLite 缓存、文件监听失效 |
| M6 | 使用管理 UI | Sessions / Projects 页、全局 Dashboard、recharts 用量图 |
| M7 | Codex CLI 模块 | Overview + Sessions + Projects + Config |
| M8 | Command Ref 模块 | 两工具命令数据 JSON + 搜索 + 复制 UI |
| M9 | 前端整合 | tauri.ts、导航 Shell、模块注册、i18n 补充 |
| M10 | 打磨 | 错误状态、安装引导、打包配置、冒烟测试 |
