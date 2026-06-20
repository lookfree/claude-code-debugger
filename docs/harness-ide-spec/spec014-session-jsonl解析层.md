# spec014 · session-jsonl 解析层

- 对应功能 ID：OBS-01
- 所属 Phase：P2
- 前置依赖：无（chokidar 已是依赖，`electron/services/file-manager.ts:3`）
- 工作量估计：L

## 目标

写一个**独立、可复用、可单测**的模块，把 Claude Code 的 session transcript（`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`）解析成结构化事件流。这是 Phase 2 一切观测的地基——spec015（监视器）、spec016（subagent/workflow 树）、spec017（token 面板）、spec021（记忆面板）都依赖它。模块要做三件事：① encoded-cwd ↔ 真实路径互转；② 单行 JSON → 强类型 `SessionEvent`；③ 配合 chokidar 的**增量 tail**（只解析新追加的行，不重读整文件）。

模块不碰 UI、不碰 IPC，纯 Node + 纯函数为主，放 `electron/services/session/`，Web 模式与未来 CLI 均可 import。

## 现状（引用真实 file:line / 真实磁盘事实）

- **项目完全没有这一层**。`electron/services/file-manager.ts` 只扫静态配置文件（skills/hooks/mcp），从不读 `~/.claude/projects/`。`grep -r projects electron/` 无 session 相关代码。
- **地基数据源已核实存在**（本机 `~/.claude/projects/`，14 个项目目录）：
  - 路径规则：`~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`，`<encoded-cwd>` = cwd 把 `/` 替换成 `-`（例：`/Users/wuhoujin/Documents/dev/agenes-core` → `-Users-wuhoujin-Documents-dev-agenes-core`）。
  - 每行一个 JSON 对象，本机一个真实大会话（`21a337d1-….jsonl`）的 `.type` 分布实测：`assistant`(5163) / `user`(2473) / `mode`(828) / `ai-title`(828) / `last-prompt`(820) / `permission-mode`(796) / `system`(683) / `file-history-snapshot`(641) / `attachment`(589) / `queue-operation`(412)。
  - `assistant` 行实测顶层键：`type / uuid / parentUuid / timestamp / sessionId / cwd / version / message`。`message` 内含 `model`（实测如 `claude-opus-4-8[1m]`——注意 model 串可能带 `[1m]` 这类上下文变体后缀，解析器作纯透传字符串、不要硬匹配某个固定模型名）、`content[]`（块类型 `thinking` / `text` / `tool_use`）、`stop_reason`、`usage`（`input_tokens` / `cache_creation_input_tokens` / `cache_read_input_tokens` / `output_tokens` / `server_tool_use` / `service_tier`）。
  - `tool_use` 块实测键：`{type:'tool_use', name, id, input}`（如 `{name:'Skill', id:'toolu_…', input:{skill:…}}`）。
  - `user` 行（含 tool_result）实测顶层键：`parentUuid / isSidechain / promptId / type / message / uuid / timestamp / toolUseResult / sourceToolAssistantUUID / userType / entrypoint / cwd / sessionId / version / gitBranch`。`message.content[0]` = `{type:'tool_result', tool_use_id, content}`，顶层另有 `toolUseResult`（结构化结果）。
  - `system` 行实测：`{type:'system', subtype:'local_command', content, level, isMeta, …}`。
  - **subagent / workflow 不在主 jsonl，而在子目录**（本机 OpsBot 项目实测，详见 spec016）：`<encoded-cwd>/<session-id>/subagents/workflows/wf_<id>/agent-<id>.jsonl`，每个 agent 行带 `isSidechain:true` + `agentId`，同目录有 `agent-<id>.meta.json`（`{agentType:'Explore'}`）。本 spec 的解析器要能解析这些 sidechain agent jsonl（同格式），但**拓扑组装**留给 spec016。

## 改动方案

### 1. 事件类型定义（新增 `shared/types/session.ts`）

解析后对外暴露**规范化**事件（normalized），不直接吐原始行——原始行字段多且会随版本漂移，规范化层是隔离带。

```ts
/** 规范化后的 session 事件基类 */
export interface SessionEventBase {
  /** 行内 uuid（assistant/user 行有；mode/system 等元事件可能无，则用 `${seq}` 兜底） */
  uuid: string
  /** 父事件 uuid，构对话链/sidechain 链用；null = 根 */
  parentUuid: string | null
  sessionId: string
  /** ISO 时间戳；部分元事件无 timestamp，则继承上一条或留空 */
  timestamp?: string
  cwd?: string
  /** Claude Code 版本，如 '2.1.152'（assistant/user 行带） */
  version?: string
  /** 是否 subagent sidechain（来自 isSidechain）；主线为 false/缺省 */
  isSidechain?: boolean
  /** sidechain agent 标识（来自 agentId，仅 subagents/*.jsonl 有） */
  agentId?: string
  /** 该事件在文件中的 0 基行号（增量 tail 用，作稳定排序键） */
  seq: number
}

export interface UserTurnEvent extends SessionEventBase {
  kind: 'user_turn'
  /** 纯文本 prompt（从 message.content 抽文本块拼接；tool_result 不算这里） */
  text: string
  entrypoint?: string          // 'cli' 等
  gitBranch?: string
}

export interface AssistantTurnEvent extends SessionEventBase {
  kind: 'assistant_turn'
  model?: string               // 纯透传，实测如 'claude-opus-4-8[1m]'（可能带 [1m] 等后缀）
  /** 文本块拼接 */
  text: string
  /** thinking 块是否存在（内容常被签名遮蔽，只标存在 + 长度） */
  hasThinking: boolean
  thinkingChars: number
  stopReason?: string          // 'tool_use' | 'end_turn' | ...
  usage?: TokenUsage
}

export interface ToolUseEvent extends SessionEventBase {
  kind: 'tool_use'
  toolUseId: string            // block.id，关联 tool_result
  toolName: string             // 'Task' | 'Skill' | 'Bash' | ...
  input: Record<string, unknown>
  /** Task 工具时抽出的 subagent 类型（input.subagent_type），供 spec016 */
  subagentType?: string
  /** 所属 assistant 行 uuid（同一 assistant message 可含多个 tool_use 块） */
  parentTurnUuid: string
}

export interface ToolResultEvent extends SessionEventBase {
  kind: 'tool_result'
  toolUseId: string            // 关联 ToolUseEvent.toolUseId
  isError: boolean
  /** content 文本化（截断到 maxResultChars，原始留 raw 可选） */
  contentText: string
  /** 顶层 toolUseResult 结构化结果原样保留（结构随工具不同） */
  structured?: unknown
}

export interface SystemEvent extends SessionEventBase {
  kind: 'system'
  subtype?: string             // 'local_command' 等
  level?: string
  content?: string
}

/** mode / permission-mode / ai-title / last-prompt / queue-operation / file-history-snapshot / attachment 等 */
export interface MetaEvent extends SessionEventBase {
  kind: 'meta'
  metaType: string             // 原始 .type
  raw: Record<string, unknown> // 原样保留，按需取
}

export type SessionEvent =
  | UserTurnEvent | AssistantTurnEvent | ToolUseEvent
  | ToolResultEvent | SystemEvent | MetaEvent

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  serviceTier?: string
  /** server_tool_use（web_search/web_fetch 计数），原样保留 */
  serverToolUse?: Record<string, number>
}
```

> 设计要点：一个 `assistant` 行可能同时产生 1 个 `AssistantTurnEvent` + N 个 `ToolUseEvent`（content 里既有 text/thinking 又有 tool_use 块）。解析器把一行**拆成多个规范化事件**，`parentTurnUuid` 把 tool_use 挂回它的 turn。

### 2. encoded-cwd 互转（`session-path.ts`）

```ts
/** /Users/a/b → -Users-a-b （Claude Code 规则：把 '/' 换成 '-'） */
export function encodeCwd(cwd: string): string {
  return cwd.replace(/\//g, '-')
}
/**
 * -Users-a-b → /Users/a/b（尽力还原）。
 * ⚠ 不可逆风险：原路径含 '-' 时无法区分。还原仅用于"显示/反查"，
 * 真相源以会话行内的 `cwd` 字段为准（assistant/user 行都带 cwd）。
 */
export function decodeCwd(encoded: string): string {
  return encoded.replace(/^-/, '/').replace(/-/g, '/')
}
```

> **诚实标注**：`decodeCwd` 是有损的（cwd 里本身有连字符就歧义）。所以模块同时提供 `resolveCwdFromEvents(events): string | undefined`——从首条带 `cwd` 的事件取真实 cwd，这才是权威。`decodeCwd` 仅作目录列举时的占位展示。

### 3. 行解析器（`session-parser.ts`，纯函数）

```ts
/** 解析单行原始 JSON 字符串 → 0..N 个规范化事件（一行 assistant 可拆多个） */
export function parseLine(line: string, seq: number, opts?: ParseOpts): SessionEvent[]
/** 批量解析整段文本（按 \n 切，跳过空行/坏行并计数） */
export function parseChunk(text: string, startSeq: number, opts?: ParseOpts): {
  events: SessionEvent[]
  nextSeq: number
  malformed: number   // JSON.parse 失败的行数（容错：坏行跳过不抛）
}
export interface ParseOpts {
  maxResultChars?: number   // tool_result content 截断，默认 4000
  keepRawMeta?: boolean     // MetaEvent 是否保留 raw，默认 true
}
```

容错原则：单行 `JSON.parse` 失败**不抛**，计入 `malformed`、跳过该行（jsonl 可能正在被写、最后一行半截）。未知 `.type` → 落 `MetaEvent`，不丢。

### 4. 增量 tail（`session-tailer.ts`，配合 chokidar）

借鉴 `file-manager.ts:97 setupFileWatcher` 的 chokidar 用法，但**不重读整文件**：记录每个文件已读到的字节 offset，change 事件触发后用 `fs.createReadStream(file, {start: offset})` 只读新增部分，按行解析、推送新事件、更新 offset。

> ⚠️ **不能照搬现有 watcher 的 `ignored` 正则（地基级陷阱）**：`file-manager.ts:108` 现配的是 `ignored: /(^|[/\\])\../`（忽略 dotfile）。但我们要 tail 的 `~/.claude/projects/<encoded-cwd>/<session>.jsonl` 整条路径就在 `.claude`（dotfile 段）下——这条正则会把目标路径整段忽略，**一个事件都收不到**（顺带说明：现有 `setupFileWatcher` 监听 `~/.claude` 本身就因此基本失效，是个潜伏 bug）。SessionTailer 的 chokidar **必须去掉这个 dotfile 忽略**，直接 watch 具体的 `.jsonl` 文件路径（或用只匹配 `*.jsonl` 的 ignored 白名单），不要 watch 目录后靠正则筛。验收里加一条专门验证能收到 `.claude` 下的事件。

```ts
export class SessionTailer extends EventTarget {
  // 演进路径第五节指定"自己写 EventTarget wrapper（rxjs 太重）"
  constructor(private opts?: ParseOpts) { super() }

  /** 开始 tail 一个 jsonl：先全量解析一遍（initial snapshot），再监听增量 */
  watch(filePath: string): void
  unwatch(filePath: string): void
  unwatchAll(): void

  // 事件：
  //  'events'   detail: { filePath, events: SessionEvent[], initial: boolean }
  //  'truncated' detail: { filePath }  // 文件变小（被重写/轮转），重置 offset 全量重读
  //  'error'    detail: { filePath, error }
}
```

实现细节：
- 维护 `Map<filePath, {offset:number, seq:number, leftover:string}>`。`leftover` 存上次读到的不完整末行，下次拼接。
- change 时 `fs.stat` 取新 size：`size < offset` → 触发 `'truncated'`、offset 归零全量重读；`size > offset` → 读 `[offset, size)`。
- chokidar `awaitWriteFinish` 关掉（jsonl 持续追加，不能等"写完"）；用 `usePolling:false`，但 macOS 下 append 偶发漏报，可选 `interval` 兜底（备注里标）。
- 全量首读对大文件（实测单会话可达数 MB、几千行）要流式逐行，避免一次性 `readFile` 占内存。

### 5. session 目录发现（`session-index.ts`）

```ts
/** 列出所有 project 目录及其 session 文件（不解析内容，只 stat） */
export function listSessions(projectsRoot?: string): Promise<SessionFileMeta[]>
export interface SessionFileMeta {
  encodedCwd: string
  cwd: string            // decodeCwd 占位，UI 显示后用行内 cwd 校正
  sessionId: string
  filePath: string
  sizeBytes: number
  mtimeMs: number        // 排序：最近活跃在前
  /** 是否含 subagents/ 子目录（有 workflow/subagent，spec016 用） */
  hasSubagents: boolean
}
```

`projectsRoot` 默认 `path.join(os.homedir(), '.claude', 'projects')`。目录不存在 → 返回 `[]`（ENOENT 静默，沿用 spec002 降级约定）。

## 实现步骤

- [ ] 1. `shared/types/session.ts`：落 `SessionEvent` 联合及各子类型、`TokenUsage`。
- [ ] 2. `electron/services/session/session-path.ts`：`encodeCwd` / `decodeCwd` / `resolveCwdFromEvents`。
- [ ] 3. `electron/services/session/session-parser.ts`：`parseLine` / `parseChunk`，含 assistant 行拆多事件、tool_use 抽 `subagentType`、容错计数。
- [ ] 4. `electron/services/session/session-index.ts`：`listSessions`，扫 `~/.claude/projects/*/*.jsonl`。
- [ ] 5. `electron/services/session/session-tailer.ts`：`SessionTailer`（EventTarget + chokidar + 字节 offset 增量）。
- [ ] 6. `electron/services/session/index.ts`：barrel 导出。
- [ ] 7. 单测 `electron/services/session/__tests__/`：用一段固定 jsonl fixture（从本机真实会话截 50 行脱敏）测 parseLine/parseChunk/encode/decode/tail 增量。

## 验收标准

- [ ] `encodeCwd('/Users/wuhoujin/Documents/dev/agenes-core')` === `'-Users-wuhoujin-Documents-dev-agenes-core'`，与本机实际目录名一致。
- [ ] `parseChunk` 喂本机真实会话前 100 行，能产出 `user_turn` / `assistant_turn` / `tool_use` / `tool_result` / `meta` 各至少一条，`malformed===0`。
- [ ] 一个含 `tool_use` 块且同时含 `thinking`/`text` 块的 assistant 行，解析出 1 个 `assistant_turn`（`hasThinking===true`）+ 对应数量 `tool_use`，且 tool_use 的 `parentTurnUuid` === 该 turn 的 uuid。
- [ ] `tool_result` 事件的 `toolUseId` 能在同会话中匹配到某个 `tool_use` 事件的 `toolUseId`（关联闭环）。
- [ ] `AssistantTurnEvent.usage` 四个 token 字段从 `message.usage` 正确映射（拿真实行断言数值）。
- [ ] tail 测试：往临时 jsonl 先写 3 行→`watch`→收到 `initial` 批含 3 事件源；再 append 2 行→收到非 initial 批且不重复前 3 行（用 offset 验证）。
- [ ] 把文件清空再写新内容 → 触发 `'truncated'` 并重新全量解析。
- [ ] 投喂一行故意截断的半截 JSON → 不抛异常，`malformed` +1，后续行正常解析。
- [ ] `listSessions()` 在本机返回 ≥14 个 session 文件，`hasSubagents` 对 OpsBot 那个会话为 `true`。
- [ ] **dotfile 不被忽略**：`watch` 一个真实 `~/.claude/projects/<cwd>/<session>.jsonl`（路径含 `.claude` dotfile 段）后 append 一行，**确实收到** `'events'`（证明没套用现有 `ignored:/(^|[/\\])\../` 把 `.claude` 整段忽略）。

## 风险与备注

- **字段会随版本漂移**：本 spec 字段名基于本机 2.1.152 会话实测。规范化层（`parseLine`）是隔离带——上游改字段只改 `parseLine` 一处，类型层与下游不动。建议解析器对每个映射写 `?? undefined` 容缺。
- **`toolUseResult` 顶层 vs `message.content` 里的 tool_result**：实测两者并存（顶层是结构化、content 里是给模型看的文本化）。解析器以 content 里的 `tool_result` 块为 `ToolResultEvent` 主体，顶层 `toolUseResult` 放 `structured`。
- **thinking 内容多被签名占位**（实测 `thinking:""` + 长 `signature`）。不要试图展示 thinking 明文，只统计存在性/长度。
- **大文件内存**：单会话实测可达数 MB / 上千行；全量首读必须流式逐行，不能 `readFile` 整吞。
- **chokidar append 漏报**：macOS FSEvents 对持续 append 偶有合并/延迟。若实测丢更新，给 SessionTailer 加可选 `pollInterval` 兜底（不默认开，避免 CPU）。
- **subagent sidechain 解析复用本模块**，但目录发现/拓扑组装在 spec016；本模块只保证"喂给我一个 agent-<id>.jsonl 我能解析成事件"。
- **不可逆 decode**：cwd 含连字符时 `decodeCwd` 歧义，已用 `resolveCwdFromEvents` 兜底，UI 必须以行内 cwd 为准显示。
