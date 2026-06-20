# spec020 · MCP 健康面板

- 对应功能 ID：MISC-06
- 所属 Phase：P2
- 前置依赖：spec014（解析层，从 jsonl 取 MCP 工具调用记录）
- 工作量估计：M

## 目标

做 MCP server 的**运行时健康监控**（区别于 spec013 的配置层）：每个 MCP server 的连接状态 / 上次握手 / 暴露 tool count / 最近调用成功失败耗时。让用户回答"这个 MCP server 是不是经常超时"。数据双源：① 主动握手探测（spawn/connect MCP server 走 stdio 或 SSE 取 tool list）；② 从 session jsonl 挖 `mcp__*` 工具调用的历史成败与耗时。

## 现状（引用真实 file:line / 真实磁盘事实）

- **MCP 连接测试是空壳**：`electron/ipc/mcp.ts:27` `mcp:test` 直接 `return { success: true, message: 'Connection test not yet implemented' }`——`src/lib/api.ts:359 mcp.testConnection` 调的就是这个假实现。
- `electron/services/file-manager.ts` 的 `getMCPServers()` 只读静态配置（command/args/env/url），**不连、不握手、不统计**。
- **运行时数据源已核实**：
  - jsonl 里 MCP 工具以 `tool_use name:'mcp__<server>__<tool>'` 出现（本机实测前缀如 `mcp__claude-in-chrome__…`、`mcp__claude_ai_Figma__…`），对应 `tool_result` 带成败与 `toolUseResult`。spec014 已把这些解析为 `ToolUseEvent`（toolName 带 `mcp__` 前缀）/ `ToolResultEvent`（isError）。
  - `~/.claude/mcp-needs-auth-cache.json` 实测存在——MCP 认证状态缓存（待握手/需 auth 的信号源，解析时利用）。
  - MCP 配置真相源：`~/.claude.json`、`~/.claude/settings.json`、项目级 `.mcp.json`（spec013 配置层范畴）。

## 改动方案

### 1. MCP 健康类型（新增 `shared/types/mcp-health.ts`）

```ts
export type MCPConnState = 'connected' | 'connecting' | 'failed' | 'needs-auth' | 'unknown'

export interface MCPHealth {
  name: string
  transport: 'stdio' | 'sse' | 'http' | 'unknown'   // 从配置推断
  state: MCPConnState
  /** 握手探测：上次成功连接时间 */
  lastHandshakeAt?: string
  handshakeMs?: number          // 握手耗时
  /** 暴露的工具数（握手成功才有） */
  toolCount?: number
  toolNames?: string[]
  /** 需要 auth（来自 mcp-needs-auth-cache.json） */
  needsAuth?: boolean
  error?: string
  /** 从 jsonl 挖的历史调用统计 */
  callStats: MCPCallStats
}

export interface MCPCallStats {
  total: number
  success: number
  failed: number
  /** 最近 N 次调用的耗时（tool_use→tool_result 时间差），算 p50/p95/max */
  latencyMsP50?: number
  latencyMsP95?: number
  latencyMsMax?: number
  /** 最近一次调用 */
  lastCallAt?: string
  lastCallOk?: boolean
  /** 按 tool 拆分 */
  byTool: Record<string, { total: number; failed: number; avgMs: number }>
}
```

### 2. 后端：握手探测器（新增 `electron/services/mcp/mcp-prober.ts`）

```ts
/** 对一个 MCP server 配置做一次握手，取 tool list */
export async function probeMCP(name: string, config: MCPServerConfig, opts?: { timeoutMs?: number }): Promise<MCPHealth>
```

实现（按 transport）：
- **stdio**：`spawn(config.command, config.args, {env})`，按 MCP 协议发 `initialize` + `tools/list`（JSON-RPC over stdio），收 tool 列表后 kill。超时硬控（默认 8s）。**复用 spec018 的安全边界**：env 白名单、超时 SIGKILL、临时 cwd——MCP server 也是任意子进程。
- **sse / http**：按 url 走 MCP HTTP transport，发 initialize/tools.list。
- **needs-auth**：先查 `~/.claude/mcp-needs-auth-cache.json`，命中则 `state='needs-auth'`，不强行握手（避免触发 auth 流程）。
- 失败 → `state='failed'` + error，不抛。

> 不长连：探测是一次性握手（连→取 tool list→断），不维持常驻连接。健康面板按需/定时重探。

### 3. 后端：历史调用统计（新增 `electron/services/mcp/mcp-call-stats.ts`）

```ts
/** 扫所有（或指定）session 的 jsonl，聚合 mcp__* 工具调用成败与耗时 */
export async function computeMCPCallStats(events?: SessionEvent[]): Promise<Record<string /*server*/, MCPCallStats>>
```

逻辑：遍历 spec014 事件，`ToolUseEvent.toolName` 匹配 **`^mcp__(.+?)__`**（非贪婪到第一个 `__`）提取 server 名，配对其 `ToolResultEvent`（toolUseId）算耗时（两事件 timestamp 差）与成败（isError）。聚合成 `MCPCallStats`（p50/p95 用排序取分位）。

> ⚠️ **正则不能用 `\w+`**：`\w` 不含连字符，而 server 名常带 `-`（本机实测 `mcp__claude-in-chrome__navigate`），`^mcp__(\w+)__` 对这类 server **整条匹配失败、统计丢数**。必须用 `^mcp__(.+?)__`。单测要同时覆盖带连字符（`mcp__claude-in-chrome__…`）和带下划线（`mcp__claude_ai_Figma__…`）两类 server 名。

### 4. IPC（新增 `electron/ipc/mcp-health.ts`，或扩 `electron/ipc/mcp.ts`）

```ts
ipcMain.handle('mcp:health', async () => {
  // 对每个配置的 server：probeMCP（并发，带超时）+ merge callStats
})
ipcMain.handle('mcp:probe', (_e, name) => /* 单个重新探测 */)
```

**替换** `mcp:test` 的假实现（`electron/ipc/mcp.ts:27`）为真探测。preload + `src/lib/api.ts`：`mcp.health()` / `mcp.probe(name)`（`testConnection` 改接真探测）。Web 模式：握手探测桌面端独占（"MCP connection testing 需 desktop"，演进路径已定）；web 下只返回 callStats（jsonl 只读可算）。

### 5. 前端面板（扩 `src/pages/MCP.tsx` 加"健康"Tab，或新增 `src/pages/MCPHealth.tsx`）

- **server 卡片网格**：每个 server = 状态灯（绿 connected / 黄 connecting/needs-auth / 红 failed）+ transport + toolCount + 握手耗时 + 成功率环形（success/total）+ p50/p95 延迟 + 最近调用时间。
- **needs-auth** 卡片显眼标记 + "去授权"提示。
- **展开**：tool 列表（握手取到的）+ byTool 调用统计表（哪个 tool 老失败/慢）。
- **重探按钮**：单 server `mcp.probe(name)`。
- live（可选）：复用 spec015 推流，新 MCP 调用进 jsonl 时增量更新 callStats。

## 实现步骤

- [ ] 1. `shared/types/mcp-health.ts`：`MCPHealth` / `MCPCallStats` / `MCPConnState`。
- [ ] 2. `electron/services/mcp/mcp-prober.ts`：`probeMCP`（stdio/sse/http 握手 + 安全边界 + needs-auth 缓存）。
- [ ] 3. `electron/services/mcp/mcp-call-stats.ts`：`computeMCPCallStats`（jsonl 挖 mcp__* 成败/耗时/分位）。
- [ ] 4. `electron/ipc/mcp.ts`：`mcp:health` / `mcp:probe`，替换 `:27` 假 `mcp:test`。
- [ ] 5. preload + `src/lib/api.ts`：`mcp.health` / `mcp.probe`；`server/index.ts` web 下只回 callStats。
- [ ] 6. `src/pages/MCP.tsx`：健康 Tab（卡片网格 + 成功率/延迟 + tool 列表 + 重探）。
- [ ] 7. i18n。

## 验收标准

- [ ] `mcp:health` 对本机配置的 MCP server 真握手，连得上的返回 toolCount + toolNames（如 claude-in-chrome 的工具列表），连不上的 state=failed + error。
- [ ] `mcp-needs-auth-cache.json` 里标 needs-auth 的 server 显示 needs-auth 状态，不强行握手触发 auth。
- [ ] 历史调用统计：跑过 MCP 工具的 session，byTool 表显示各 mcp__* tool 的调用次数、失败数、平均耗时，与 jsonl 手动核对一致。
- [ ] 成功率环形与 p50/p95 延迟正确（构造含成功+失败+不同耗时的样本验证分位算法）。
- [ ] 单 server 重探按钮触发 `mcp:probe`，状态实时更新。
- [ ] 握手超时的 server 在 timeoutMs 内被杀，state=failed 而非卡死。
- [ ] 原 `mcp:test` 假实现已被真探测替换（`src/lib/api.ts:359 testConnection` 返回真结果）。
- [ ] Web 模式只返回 callStats，握手类 API 标"仅桌面端"。

## 风险与备注

- **MCP 握手协议细节**：JSON-RPC 的 `initialize` 参数、`tools/list` 方法名需对 MCP 官方 spec；建议用官方 MCP SDK（`@modelcontextprotocol/sdk`）做 client，别手搓协议（易错且随版本变）。若引入该依赖，记在 package.json。
- **握手有副作用**：stdio MCP server 启动可能跑初始化脚本（连数据库、起浏览器）。探测=真启子进程，需超时硬杀 + 临时 cwd + env 白名单（复用 spec018 边界）。对 `claude-in-chrome` 这类会开浏览器的 server，探测前给用户提示或允许跳过。
- **needs-auth 缓存格式**：`mcp-needs-auth-cache.json` 内部结构未逐字段核实，实现前 cat 一遍确认键名。
- **延迟统计依赖 jsonl 时间戳精度**：tool_use 与 tool_result 的 timestamp 差含模型思考+网络+执行，不是纯 MCP 往返；标注"端到端耗时"而非"纯 MCP 延迟"。
- **transport 推断**：从配置有无 `command`（stdio）vs `url`（sse/http）判断，少数混合配置需兜底 unknown。
- 与 spec013（MCP 配置升级）分工：spec013 管配置读写/elicitation/alwaysLoad 等**静态配置**；本 spec 只管**运行时健康**，两者共用 `MCPServerConfig` 类型不重叠。
