# spec013 · MCP 配置升级

- 对应功能 ID：MISC-04 / MISC-05 / MISC-06
- 所属 Phase：P1
- 前置依赖：spec002（claude_mcp_config.json 缺失降级，已修）；**spec009（写入复用其 `SettingsWriter`，以 MCP 路径实例化，不另写原子写）**
- 工作量估计：M

## 目标

把 MCP 页从"只读旧字段"升级为**完整的 MCP 配置层视图与编辑**（Phase 1 配置层，**运行时健康监控是 spec020 Phase 2 另写**，本 spec 不碰运行时）。覆盖三件：

- **MISC-06** `alwaysLoad` 字段——强制加载某 MCP server（2.1.121）+ MCP 并行启动（2.1.116，展示说明，本工具不控制启动）。
- **MISC-05** claude.ai MCP 连接器——在 Claude Code 里用 claude.ai 的 MCP 连接器（2.1.46），是一种 `type: 'http'/'sse'` 的远程 MCP，需要展示其连接器配置（url / 鉴权类型）。
- **MISC-04** MCP elicitation（追问）——MCP 可反向向用户要答案（2.1.76）。配置层能展示某 server 是否声明支持 elicitation（`elicitation` 能力标记），运行时追问交互不在本 spec。

MCP server 配置真实形态（区分 stdio 本地进程 vs 远程连接器）：

```json
{
  "mcpServers": {
    "local-fs": {
      "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "alwaysLoad": true
    },
    "claude-ai-connector": {
      "type": "http",
      "url": "https://mcp.example.com/sse",
      "headers": { "Authorization": "Bearer ..." },
      "alwaysLoad": false
    }
  }
}
```

## 现状（引用真实 file:line）

- `shared/types/mcp.ts:1`-`:9` `MCPServerConfig`：只有 `command`/`args`/`env`/`timeout`/`disabled`/`alwaysAllow`/`description`。**缺**：`alwaysLoad`、`type`（http/sse/stdio）、`url`、`headers`、elicitation 能力标记。整个类型假设 MCP 都是 stdio 本地进程，认不出远程连接器。
- `electron/services/file-manager.ts:860`-`:880` `getMCPServers()`：读 `~/.claude/claude_mcp_config.json` 的 `mcpServers` 与项目 `mcpServers.json` 合并，原样透传——新字段会被保留在对象里但类型不认、UI 不渲染。
- `electron/services/file-manager.ts:882`-`:888` `saveMCPServers()`：用 `writeJSONFile`（`:166` 整文件覆盖 `{mcpServers}`）——只要文件里还有别的顶层 key 就会丢；且 stdio/远程不分。
- `electron/ipc/mcp.ts:15`-`:25` `mcp:save` / `mcp:delete`：读全量→改一个 server→`saveMCPServers` 写回。
- `src/pages/MCP.tsx:46`-`:80` 列表只渲染 `command`/`args`/`env`/`disabled`——**不渲染** alwaysLoad、不区分远程连接器、无 url/headers、无 elicitation、无编辑。整页只读。

## 改动方案

### 1. 类型 diff（`shared/types/mcp.ts`）

```diff
 export interface MCPServerConfig {
-  command: string
+  /** 传输类型：stdio（默认，本地进程）/ http / sse（远程连接器） */
+  type?: 'stdio' | 'http' | 'sse'
+  /** stdio：可执行命令；远程时可省略 */
+  command?: string
   args?: string[]
   env?: Record<string, string>
+  // ---- 远程连接器（claude.ai MCP / http / sse，2.1.46） ----
+  /** 远程 MCP 端点 url */
+  url?: string
+  /** 远程鉴权等头 */
+  headers?: Record<string, string>
   timeout?: number
   disabled?: boolean
   alwaysAllow?: string[]
+  /** 强制加载该 server（2.1.121） */
+  alwaysLoad?: boolean
+  /** 声明支持 elicitation 追问（2.1.76）；配置层标记，运行时交互见 spec020/Phase2 */
+  elicitation?: boolean
   description?: string
 }
+
+/** 派生：判断一个 server 是远程连接器还是本地 stdio（UI 分组用） */
+export function isRemoteMCP(c: MCPServerConfig): boolean {
+  return c.type === 'http' || c.type === 'sse' || (!!c.url && !c.command)
+}
```

### 2. 后端 FileManager（`electron/services/file-manager.ts`）

- `getMCPServers()`（`:860`）：读取逻辑不变（新字段已随对象透传），但**类型变更后**确保 `type`/`url`/`headers`/`alwaysLoad`/`elicitation` 都带出。补一处：若 server 无 `command` 但有 `url` 且无 `type`，回填 `type:'http'`（规范化，便于 UI 分组）。
- `saveMCPServers()`（`:882`）：**改为不丢未知顶层 key**，并**复用 spec009 的同一套原子 read-modify-write，不另写一份**。现状 `writeJSONFile` 覆盖整文件，若 `claude_mcp_config.json` 还有别的顶层字段会丢。
  - MCP 配置文件不是 settings 三层（是 `claude_mcp_config.json` / `mcpServers.json`），但 `SettingsWriter` 的构造器已参数化路径（`constructor(private resolvePath:(level)=>string)`）——直接以 MCP 路径实例化即可复用其 `writeKey`：
    ```ts
    // file-manager 里持有一个 MCP 专用 writer，level 复用 user/project 语义
    private mcpWriter = new SettingsWriter(level =>
      level === 'project'
        ? path.join(this.projectPath, '.claude', 'mcpServers.json')
        : path.join(this.userConfigPath, 'claude_mcp_config.json'))
    // 保存：
    await this.mcpWriter.writeKey(location, 'mcpServers', servers)
    ```
  - 这样全项目**只有一处**原子 read-modify-write 实现（spec009 的 `SettingsWriter`），MCP、settings、hooks、permissions 都走它；不再手写 `setByPath + 自己原子写` 那条独立路径。若 spec009 未先落地，临时兜底也必须 read-modify-write（禁止 `writeJSONFile` 整覆盖），并标注待 spec009 收口。
- 新增 `saveMCPServer(name, config, location)`（单个 upsert，供 IPC `mcp:save` 用，内部走上面的 read-modify-write，避免 IPC 层先 getAll 再整体覆盖的竞态）。

### 3. IPC（`electron/ipc/mcp.ts`）

`mcp:save`（`:15`）保持签名 `(name, config)`，内部改调 `fileManager.saveMCPServer(name, config)`（单 server upsert，read-modify-write），不再 `getAll`→整体覆盖。`mcp:delete` 同理改单删。

### 4. 前端（`src/pages/MCP.tsx`）

整页升级（保留现有只读卡作 stdio 展示基础）：

- **分组**：用 `isRemoteMCP` 把列表分两组——「本地 stdio servers」「远程连接器（claude.ai / http / sse）」。
- **本地 stdio 卡**：在现有 command/args/env 基础上加：
  - `alwaysLoad` Switch（强制加载）+ 说明。
  - `elicitation` Badge（若 `true` 显示"支持追问"）。
  - `timeout`、`disabled` 已有/补全。
- **远程连接器卡（MISC-05）**：显示 `type`（http/sse）、`url`、`headers`（key 显示、value 脱敏成 `••••`）、`alwaysLoad`。说明"claude.ai MCP 连接器（2.1.46）"。
- **编辑/新增**（轻量）：一个 Dialog 表单——
  - 传输类型 Select（stdio / http / sse）→ 切换显示 command+args（stdio）或 url+headers（远程）。
  - 通用：`alwaysLoad` Switch、`elicitation` Switch、`disabled` Switch、`timeout`、`description`、目标文件（user `claude_mcp_config.json` / project `mcpServers.json`）。
  - 保存调 `api.mcp.save(name, config)`。
- **并行启动说明（MISC-06）**：页面顶部只读说明条"MCP 并行启动（2.1.116）由 Claude Code 运行时控制，此处仅配置；`alwaysLoad` 强制加载（2.1.121）。"
- **运行时健康**：明确不在本页——加一句"连接状态/握手/调用统计见 MCP 健康面板（Phase 2）"占位链接（spec020）。

## 实现步骤

- [ ] 1. `shared/types/mcp.ts`：按 diff 加 `type`/`url`/`headers`/`alwaysLoad`/`elicitation`，`command` 转可选，加 `isRemoteMCP`。
- [ ] 2. `file-manager.ts`：`getMCPServers()` 规范化无 command 有 url 的 server 为 `type:'http'`；`saveMCPServers()` 改 read-modify-write（保留未知顶层 key）；加 `saveMCPServer(name,config,location)` 单 upsert。
- [ ] 3. `electron/ipc/mcp.ts`：`mcp:save`/`mcp:delete` 改走单 server upsert/delete。
- [ ] 4. `src/pages/MCP.tsx`：按 `isRemoteMCP` 分组、stdio 卡加 alwaysLoad/elicitation、远程连接器卡（url/headers 脱敏）、编辑/新增 Dialog、并行启动与健康面板说明。
- [ ] 5. `src/lib/api.ts` + preload：确认 `mcp.save`/`mcp.delete` 已暴露（现状有），无新增则跳过。
- [ ] 6. i18n：alwaysLoad / elicitation / 远程连接器 / 传输类型 / 并行启动文案。

## 验收标准

- [ ] 在 `claude_mcp_config.json` 配一个含 `alwaysLoad:true` 的 stdio server，MCP 页显示 alwaysLoad Switch 为开。
- [ ] 配一个 `type:'http'`、有 `url`+`headers` 的远程连接器，被归到「远程连接器」组，显示 url、headers value 脱敏为 `••••`。
- [ ] 无 `command` 但有 `url` 的 server 被 `getMCPServers` 规范化为 `type:'http'` 并归远程组。
- [ ] 通过编辑 Dialog 给某 server 打开 `alwaysLoad`+`elicitation`，保存后 `claude_mcp_config.json` 写出对应字段，且**文件内其他 server 与其他顶层 key 完好**（read-modify-write 不丢）。
- [ ] `elicitation:true` 的 server 显示"支持追问" Badge。
- [ ] 新增一个远程连接器（type=sse、填 url）保存后能再读回还原。
- [ ] 页面有"运行时健康见 Phase 2"占位、有并行启动说明——确认本 spec 不做运行时（无连接状态/握手 UI）。
- [ ] `claude_mcp_config.json` 不存在时 MCP 页空状态不报错（spec002 降级生效）。

## 风险与备注

- **配置层 vs 运行时层边界（务必守住）**：本 spec 只读写**静态配置**（字段、url、headers、alwaysLoad、elicitation 声明）。**连接状态、握手时间、tool count、调用成功率/耗时全是运行时**，属 spec020（Phase 2，需起 MCP 子进程或解析运行时状态）。本页只放占位链接，不实现任何探活，避免越界。
- claude.ai MCP 连接器（2.1.46）的精确配置 schema（是 `type:'http'` 还是专门的 `connector` 字段、鉴权是 headers 还是 OAuth 流程）以官方 MCP 配置文档为准。本 spec 用通用 `type:'http'/'sse'` + `url` + `headers` 覆盖主流远程 MCP；若官方有专属连接器字段，加到 `MCPServerConfig` 并在远程组里识别，UI 结构不变。
- `elicitation` 在 settings/MCP 配置里**是否为可声明字段**需核实——它可能是 server 运行时通过协议声明的能力，而非配置文件字段。若官方无配置字段，本 spec 的 `elicitation` 标记降级为"展示运行时能力（需 Phase 2 探测）"，配置层仅保留字段占位（写入但 Claude Code 可能忽略），UI 说明改为"运行时能力"。落地时确认，差异只动该字段语义与文案。
- `headers` 含鉴权 token，UI 必须脱敏显示（`••••`），编辑时可显式"显示明文"按钮；存储仍明文（与 Claude Code 配置文件一致，工具不额外加密，与 provider apiKey 处理一致）。
- `saveMCPServers` 现用 `writeJSONFile` 整覆盖，改 read-modify-write 后注意 `claude_mcp_config.json` 顶层若只有 `mcpServers` 一个 key 则行为等价；但 `mcpServers.json` 等文件可能有别的 key，改后才安全。
