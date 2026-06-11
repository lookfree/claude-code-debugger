# Forge 与旧版 claude-code-debugger 功能对齐修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 修复全面审计发现的"移植时被简化"的功能缺口，对齐旧版行为（旧代码在仓库根目录 `electron/` + `src/pages/` 作为权威参考）。

**审计结论修正：** Models 页由 Model Switcher 模块按设计文档有意替代（非缺失）；Dashboard 为设计文档定义的重新设计。以下任务只覆盖真实缺口。

---

### Task A（Rust 后端，TDD）

- [ ] **A1 hooks 项目级作用域**：`hooks.rs` `save_hook_to_settings`/delete 当前忽略 `location` 参数。修复：location=="project" 时写入 `<project>/.claude/settings.json`（命令增加 project_path 参数），user 时维持 `~/.claude/settings.json`。测试覆盖两种作用域。
- [ ] **A2 hooks 测试执行**：新增 `cmd_test_hook(command, timeout_sec)` —— `sh -c` 执行，捕获 exit code/stdout/stderr/耗时，超时杀进程（参考旧 `electron/ipc/hooks.ts` hooks:test）。测试：echo 成功、false 失败、sleep 超时。
- [ ] **A3 hooks 结构化调试日志**：按旧版解析逻辑重写 `get_hook_debug_logs`：解析 `~/.claude/debug/` 中 "Matched N unique hooks for query"、hookType、退出码、时间戳；返回结构化条目（参考旧 hooks.ts 120-200 行）。fixture 测试。
- [ ] **A4 commands 嵌套目录 + 项目级**：`slash_commands.rs` 读取 `commands/<name>/<name>.md` 嵌套格式（旧版默认写法）+ 平铺兼容；`cmd_get_slash_commands` 增加可选 project_path，同时扫描项目 `.claude/commands/`，location 字段区分 user/project。测试覆盖嵌套与项目级。
- [ ] **A5 MCP 兼容旧配置文件**：`get_mcp_servers` 同时读取 `~/.claude/claude_mcp_config.json`（旧版数据源）与 settings.json mcpServers，合并（settings 优先）；保存时写回该 server 原来所属文件，新增默认进 settings.json。测试。
- [ ] **A6 CLAUDE.md 多项目自动发现**：移植旧 file-manager `discoverProjectClaudeMdFiles`（扫描 ~/Documents、~/Projects、~/projects、~/dev、~/code、~/work、~/src 深度 3 找 `*/CLAUDE.md`，跳过 node_modules/.git）。新增 `cmd_discover_claudemd()`，base 目录列表可参数化以便测试。

### Task B（前端对齐）

- [ ] **B1 Hooks 页表单补全**：timeout 字段、脚本文件模式（toggle → 脚本内容编辑，调用已有 create_hook_script）、作用域选择（user/project + 目录选择 dialog）、"测试运行"按钮（调 cmd_test_hook 显示 exit/stdout/stderr）、结构化日志面板渲染 A3 字段。
- [ ] **B2 Commands 页**：项目路径选择（dialog）+ user/project 标签；用对话框表单替代 prompt()；创建时校验 description 非空；嵌套格式正确显示。
- [ ] **B3 MCP 页**：Add 表单支持 env 变量键值对；详情显示 alwaysAllow/timeout 字段；来源文件徽章（settings/claude_mcp_config）。
- [ ] **B4 Skills 页元数据**：从 frontmatter 解析并展示 author/version/allowed-tools 等字段（保持 content 原文保存不丢字段）。
- [ ] **B5 ClaudeMd 页**：调用 cmd_discover_claudemd 列出发现的项目文件，可选中查看/编辑（写回原路径）。

### 验证

每任务后：`cargo test --manifest-path forge/src-tauri/Cargo.toml` + `cd forge && npm run build` 全绿；最终重新 `npm run tauri build` 并推送。
