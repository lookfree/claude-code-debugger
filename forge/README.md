# Forge

基于 Tauri v2 的原生桌面应用：**Claude Code** 与 **Codex CLI** 两个 AI 编程 CLI 工具的统一控制中心。

设计文档：[`docs/superpowers/specs/2026-06-04-superdev-platform-design.md`](../docs/superpowers/specs/2026-06-04-superdev-platform-design.md)

## 功能

- **Dashboard** — 今日 token/费用总览、30 天用量堆叠图（recharts）、最近会话、工具运行状态（5s 轮询）、环境检测
- **CLI Runner** — 内嵌 xterm.js 终端，在 App 内直接运行 claude / codex（PTY，多标签，目录选择，输出回放防丢失，自定义环境变量注入）
- **Command Ref** — 两个工具的命令速查（搜索、分类、点击复制）
- **Claude Code 模块** — Overview、Sessions（解析 `~/.claude/projects/` JSONL，容错）、Projects（固定/统计）、Git（git2：状态/暂存/提交/推送/分支/日志）、工作树（worktree 列表/创建/删除）、环境（PATH 检测 + 环境变量 + API 连通测试）、Skills / Agents / Hooks（含调试会话流式输出）/ MCP / Commands / CLAUDE.md / Graph
- **Codex CLI 模块** — Overview（安装检测/引导）、Sessions、Projects、Config（TOML 原文编辑，保存前校验）
- **Model Switcher** — Provider 管理 + 22 个内置预设 + JSON 粘贴导入，跨两工具一键切换（原子写入，保留未知配置字段）
- **系统托盘** — 预设快速切换、打开主窗口、退出

## 开发

```bash
cd forge
npm install
npm run tauri dev
```

## 构建

```bash
npm run tauri build
# 产物: src-tauri/target/release/bundle/macos/Forge.app 与 dmg
```

## 测试

```bash
cargo test --manifest-path src-tauri/Cargo.toml   # 97 个测试（1 个网络测试默认 ignore）
npm run build                                      # 前端类型检查 + 打包
```

## 设计要点

- **配置写入**：读取-修改-写回（`serde_json::Value` / `toml::Table`），未知字段原样保留 → 兼容 Claude Code 快速迭代
- **原子写入**：tmp + fsync + rename，配置文件不会写坏
- **会话解析**：逐行容错（坏行跳过），格式变化只需改 `commands/usage/parser.rs`
- **路径安全**：所有用户输入文件名经 `safe_join` 校验，拒绝路径穿越

## 已知限制（v1）

- i18n 基础设施已就位，但新页面文案为中文硬编码（中英双语推迟）
- Config 编辑器为 textarea（非 Monaco）
- 从旧版 claude-code-debugger 迁移的 7 个页面为功能性重写，暂缺：Markdown 预览、Mermaid 技能图、Hook 完整编辑表单/作用域选择、技能 ZIP 上传等（清单见 M4 审查记录）
- OpenCode 支持已移出范围（见设计文档"不做"）
- Codex 会话历史依赖 `~/.codex/` 数据（本机未安装时仅显示 Forge 自身记录的 PTY 会话）
