# spec017 · Token / Usage 面板

- 对应功能 ID：OBS-02 / OBS-03 / OBS-05
- 所属 Phase：P2
- 前置依赖：spec014（解析层，token usage 来源）；建议在 spec015 之后（复用 session store）
- 工作量估计：M

## 目标

用 recharts 把一个 session（或多 session 汇总）的 token 消耗按**来源分项**（base / skills / subagents / MCP / plugins）拆开展示，画烧钱时间序列与饼图，并接 14 篇 ECC 调优建议——给出"换模型省 X""MAX_THINKING_TOKENS 降到 N 省 Y"在用户这个项目里的**具体可省额**。`/usage` 官方分项数据源**待确认**，本 spec 给出"自算"主路径 + `/usage` 探测增强。

## 现状（引用真实 file:line / 真实磁盘事实）

- **项目无任何 token 统计**。`src/pages/Dashboard.tsx` 只统计组件数量，不碰用量。recharts 已是依赖（演进路径第五节）。
- **token 数据已核实存在于 jsonl**：每个 `assistant` 行 `message.usage` 实测含 `input_tokens` / `cache_creation_input_tokens` / `cache_read_input_tokens` / `output_tokens` / `server_tool_use` / `service_tier`（spec014 已映射为 `TokenUsage`）。`message.model` 实测如 `claude-opus-4-8[1m]`（透传字符串，可能带 `[1m]` 后缀；按模型分组用原串、不要规整掉后缀，否则同模型不同上下文变体会被错并）。
- **workflow 级汇总已存在**：`workflows/wf_<id>.json` 实测含 `totalTokens`（如 3274460）、`totalToolCalls`（spec016 已读）。
- **`/usage` 的分项明细（skills/subagents/MCP/plugins/base 拆分）没有发现稳定本地文件契约**——`~/.claude/` 下无 usage 缓存文件，CLI 不在 PATH。**诚实标注：分项归因靠本工具自算（按 tool_use 归类），不是读官方 /usage。**

## 改动方案

### 1. token 汇总类型（`shared/types/session.ts` 追加）

```ts
export interface TokenUsageRollup {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  /** 估算成本（USD），按 model 单价表算；单价表见下，标注"估算" */
  estimatedCostUsd?: number
  byModel: Record<string, TokenUsage>   // 原始 model 串（如 'claude-opus-4-8[1m]'）→ 累计
}

/** 分项归因：把每次 assistant turn 的 token 归到一个 bucket */
export type UsageBucket = 'base' | 'skills' | 'subagents' | 'mcp' | 'plugins'
export interface UsageBreakdown {
  byBucket: Record<UsageBucket, TokenUsageRollup>
  /** 时间序列：每个 assistant turn 一个点，累计/增量 token */
  series: Array<{ ts: string; bucket: UsageBucket; model: string; output: number; inputBillable: number }>
  total: TokenUsageRollup
}
```

### 2. 分项归因算法（新增 `electron/services/session/usage-breakdown.ts`）

`/usage` 拿不到，所以**自算归因**——遍历 spec014 的 `SessionEvent[]`（含 subagent jsonl），把每个 `AssistantTurnEvent.usage` 归到一个 bucket：

```ts
export function computeUsageBreakdown(events: SessionEvent[], topology?: AgentTopology): UsageBreakdown
```

归因规则（启发式，每条标注依据）：
- 该 turn 来自 subagent jsonl（`isSidechain || agentId`）→ `subagents`。
- 该 turn 紧接的 tool_use 是 `Skill` → 把这次及后续到 tool_result 之间的 token 归 `skills`。
- tool_use 是 MCP 工具（用 `toolName.startsWith('mcp__')` 判定，**不要用 `mcp__(\w+)__` 正则**——`\w` 不含连字符，会漏掉 `mcp__claude-in-chrome__…` 这类带 `-` 的 server；分桶只需前缀判定，若要进一步拆到 server 名则与 spec020 共用 `^mcp__(.+?)__`）→ `mcp`。
- tool_use 来自 plugin 提供的 skill/command（需 spec004/005 的 plugin skill 名单交叉）→ `plugins`。
- 其余 → `base`。

> 这是**近似归因**：token 是按整个 turn 的 input/output 计的，无法精确切到"某 skill 用了多少"。UI 必须标注"分项为按工具调用归因的估算"。

成本估算：内置 model 单价表（`shared/data/model-pricing.ts`，标注"以 spec013/claude-api skill 为准、可能过时"），`estimatedCostUsd = input*pIn + cacheRead*pCacheRead + cacheCreation*pCacheCreate + output*pOut`。单价随模型更新，集中一处。

### 3. ECC 调优建议（`electron/services/session/usage-advisor.ts`）

接 14 篇 ECC 方法论，基于 breakdown 生成具体建议：

```ts
export interface UsageAdvice {
  id: string
  title: string                 // '换 Sonnet 可省约 62%'
  detail: string
  estimatedSavingUsd?: number
  estimatedSavingPct?: number
  severity: 'info' | 'suggest' | 'warn'
}
export function adviseUsage(b: UsageBreakdown): UsageAdvice[]
```

内置规则：
- 若主力 model 是 opus 且任务以读/搜为主（tool_use 多为 Read/Grep/Glob）→ "换 sonnet 省 ~X%"（用单价比 × 当前花费算 estimatedSaving）。
- 若 thinking 占比高（spec014 的 `thinkingChars` 累计大、output 高）→ "MAX_THINKING_TOKENS 降到 10000 预计省 ~Y%"。
- 若 cacheRead 比例低 → "提示缓存命中率低，检查 system prompt 稳定性"。
- 若 subagents bucket 占比极高 → "subagent 套了 N 层，token 集中在子代理，考虑收敛"。

### 4. IPC（扩 `electron/ipc/session.ts`）

```ts
ipcMain.handle('session:usage', (_e, sessionId, fp) => /* snapshot→breakdown→advice */)
```

preload + `src/lib/api.ts`：`session.usage(id, fp)` → `{ breakdown, advice }`。Web 模式 `GET /api/sessions/:id/usage`（只读快照，单次计算）。

### 5. 前端面板（新增 `src/pages/Usage.tsx` 或 Sessions 页 Tab，用 recharts）

- **顶部 KPI 卡**：总 input/output/cache token、估算成本、turn 数。
- **分项饼图**（recharts `PieChart`）：base/skills/subagents/mcp/plugins 占比。
- **烧钱时间序列**（recharts `AreaChart`，按 turn 时序累计 output token / 成本），可按 bucket 堆叠、按 model 上色。
- **按 model 表**：每个 model 的 token 分布 + 单价 + 估算成本。
- **ECC 建议卡列表**：每条 advice 显示标题 + 预计可省额 + 详情，醒目色。
- 多 session 汇总：选多个 session 时合并 breakdown（复用 spec015 多选）。

## 实现步骤

- [x] 1. `shared/types/session.ts`：`TokenUsageRollup`(+estimatedCostUsd/byModel optional) / `UsageBucket` / `UsageSeriesPoint`(含 costUsd) / `UsageBreakdown` / `UsageAdvice` / `UsageReport`。
- [x] 2. `shared/data/model-pricing.ts`：model→单价表（opus/sonnet/haiku/fable，cache write/read 分开计；标注 PRICING_UPDATED + "估算"）。
- [x] 3. `electron/services/session/usage-breakdown.ts`：`computeUsageBreakdown`（按 turn 的 tool_use 归 base/skills/mcp/plugins、subagents 取拓扑 agent token、成本逐 model 算）。
- [x] 4. `electron/services/session/usage-advisor.ts`：`adviseUsage`（4 条 ECC 规则，数值由单价比/占比算）。
- [x] 5. `SessionMonitor.usage()` + `electron/ipc/session.ts`：`session:usage` handler。
- [x] 6. preload + `src/lib/api.ts`：`session.usage`；`server/index.ts` 加 `GET /api/sessions/:id/usage`。
- [x] 7. `src/components/sessions/SessionUsage.tsx`（Sessions「用量」Tab，recharts）：KPI / 成本饼图 / 累计花费面积图 / model 表 / 建议卡。
- [x] 8. i18n（sessions namespace usage.*/advice.*，en/zh 69 键对齐）。

### 实际实现（与方案偏差，已落地）

- **UI 以「成本」为头条，不以 token 数**：实测 `total.totalTokens` 被 cacheRead 主导（OpsBot 子代理 96M cacheRead vs 26.5 万 in+out），单看 token 数失真。故饼图/KPI 走 `estimatedCostUsd`（cacheRead 已按 0.1× 正确加权），原始 token 仅在 model 表分列。
- **subagents bucket ≈ wf totalTokens 的校验在「新 token」层**：subagents 的 in+out+cacheCreate(~7M) 与 `wf.totalTokens`(3.87M) 同量级；含 cacheRead 的全和(103M)是预期的廉价重复读，不参与该校验。
- **`UsageAdvice` 改 id+params**（不在后端定死 title/detail 字符串），前端 `t(advice.<id>.title/detail, params)` 渲染——守 i18n 硬规则。
- **plugins bucket 为占位（best-effort）**：归因需 plugin 工具名单（spec004/005 交叉），v1 未接 `pluginToolNames`，故 plugins 通常为空；base/skills/mcp/subagents 归因坚实。
- **多 session 汇总未做**：仅当前选中 session（单选）。`computeUsageBreakdown` 已是纯函数，后续合并可叠加。
- **入口是 Sessions 第四 Tab「用量」**，非独立页。
- 归因为**按 turn 的工具调用估算**（token 按整 turn 计，无法切到单 skill 内部）——jsonl 粒度硬限制，UI 标注"估算"。

## 验收标准

- [ ] 选一个本机 session，KPI 卡显示的总 token 与手动 `cat <jsonl> | jq` 累加 `message.usage` 一致（容差 0）。
- [ ] 分项饼图把 subagent jsonl 的 token 归到 `subagents` bucket、`Skill` 调用相关归 `skills`、`mcp__*` 工具归 `mcp`。
- [ ] OpsBot workflow session 的 subagents bucket token 与 `wf_<id>.json` 的 `totalTokens`（3274460）量级吻合（同源校验）。
- [ ] 烧钱时间序列随 turn 时序单调累计，按 model 上色正确（opus/sonnet 区分）。
- [ ] 主力 opus 的读密集会话出现"换 sonnet 省 ~X%"建议，X 由单价比与当前花费算出（非写死）。
- [ ] thinking 重的会话出现 MAX_THINKING_TOKENS 建议。
- [ ] 估算成本卡明确标注"估算，单价表更新于 <日期>"。
- [ ] Web 模式 `GET /api/sessions/:id/usage` 返回 breakdown + advice。

## 风险与备注

- **`/usage` 官方分项数据源待确认**：本 spec 明确走"自算归因"主路径。探测方案：① 若未来 CLI 入 PATH，跑 `claude` 内 `/usage` 抓输出解析；② 监控会话期间是否有 usage 缓存文件落盘（`~/.claude/` 下定期 diff）；③ 查 OTEL（OBS-05，`OTEL_*` 环境变量开启时 span 带 agent_id，可对接 collector）。三者均未确认前，UI 标注"分项为本工具按工具调用归因的估算，非官方 /usage"。
- **归因不精确**：token 按整 turn 计，无法切到单 skill 内部。这是 jsonl 数据粒度的硬限制，不是 bug，UI 诚实说明。
- **单价表会过时**：模型与定价频繁变（演进路径多次提模型 U 形弯）。集中在 `model-pricing.ts`，标注更新日期；理想接 claude-api skill 的权威单价（本仓有该 skill 引用）。
- **cache token 计费**：`cache_creation` 与 `cache_read` 单价不同（read 通常 0.1×）。成本公式必须分开算，否则高估。
- OBS-03（插件 token 成本预估 `claude plugin details`）依赖 CLI，本 spec 不强求；可在 spec005 Plugins 页接，本面板留接口位。
