# spec007 · Hooks 类型系统补全

- 对应功能 ID：HOOK-01 / 02 / 03 / 04 / 05 / 06 / 07 / 08 / 09 / 10 / 11
- 所属 Phase：P1
- 前置依赖：ajv 已在依赖中（`package.json:30`）；**settings.json 写入依赖 spec009 的 `SettingsWriter`**——`saveHookToSettings` 不得自己 read-modify-write，统一走 `settingsWriter.writeKey(level,'hooks',hooksObj)`（迁移由 spec009 实现步骤 4 负责，本 spec 只管 hooks 字段的序列化映射）。
- 工作量估计：L

## 目标

把 `HookType` 与 `HookAction` 扩到覆盖 Claude Code 2.1.x 的完整 hook 体系：新增 hook 事件类型（MessageDisplay / PreCompact / PostCompact / ConfigChange / Elicitation / ElicitationResult / StopFailure / PermissionRequest / post-session 等），新增 action 形态（`type:http`、exec form `args`、`continueOnBlock`、`terminalSequence`、effort 透传、PostToolUse 输出替换），SessionStart 的 `reloadSkills` / `sessionTitle`。前端 Hooks 表单按类型动态出控件，保存前用 ajv schema 校验。

## 现状（引用真实 file:line）

- `shared/types/hook.ts:1`-`:18` `HookType`：有 PreToolUse/PostToolUse/Notification/UserPromptSubmit/Stop/SubagentStart/SubagentStop/PreCompact/SessionStart/SessionEnd + 一堆 legacy。**缺**：MessageDisplay、PostCompact、ConfigChange、Elicitation、ElicitationResult、StopFailure、PermissionRequest、SessionResume/post-session。
- `shared/types/hook.ts:35`-`:41` `HookAction`：只有 `type/handler/command/timeout/continueOnError`。**缺**：`type:http`（url/method/headers/body）、`args`(exec form)、`continueOnBlock`、`terminalSequence`、`effort`、PostToolUse 输出替换字段。`HookActionType`（`:20`-`:25`）是抽象动词（validate/transform/notify/block/execute），与 Claude Code 真实 `type: 'command' | 'http' | 'prompt'` 不对齐。
- `electron/services/file-manager.ts:562`-`:572` 读 settings.json 时只解析 `{matcher, hooks:[{type, command, prompt, timeout}]}`——丢掉所有新字段。
- `electron/services/file-manager.ts:581`-`:586` 把每个 hook 硬编码成 `type:'execute', command: h.command||h.prompt`——丢失 http/args 等。
- `electron/services/file-manager.ts:678` `saveHookToSettings` 写回的 `hookConfig.hooks` 是 `{type, command?, prompt?, timeout?}`，无新字段。
- `src/pages/Hooks.tsx:57`-`:68` `HOOK_TYPES` 数组缺新类型；`:71`-`:78` `ClaudeCodeHookConfig` 只有 command/prompt/timeout；`:104`-`:106` 表单 `hookCommands` 项只有 `type:'command'|'prompt'`、command、timeout。
- `electron/ipc/hooks.ts:392` `launchDebugSession` 的 switch（`:409`-`:447`）也只覆盖旧类型。

## 改动方案

### 1. 类型 diff（`shared/types/hook.ts`）

```diff
 export type HookType =
   | 'PreToolUse'
   | 'PostToolUse'
+  | 'MessageDisplay'        // 2.1.152 输出显示前转换/隐藏
   | 'Notification'
   | 'UserPromptSubmit'
   | 'Stop'
+  | 'StopFailure'           // 2.1.78
   | 'SubagentStart'
   | 'SubagentStop'
   | 'PreCompact'
+  | 'PostCompact'           // 2.1.76
   | 'SessionStart'
   | 'SessionEnd'
+  | 'ConfigChange'          // 2.1.49 配置变更审计
+  | 'Elicitation'          // 2.1.76
+  | 'ElicitationResult'     // 2.1.76
+  | 'PermissionRequest'     // 2.0.45 权限请求自动化
+  | 'PostSession'           // 2.1.169 post-session 生命周期
   // Legacy types (backwards compat)
   | 'pre-tool' | 'post-tool' | 'pre-command' | 'post-command'
   | 'pre-commit' | 'post-commit'

-export type HookActionType =
-  | 'validate' | 'transform' | 'notify' | 'block' | 'execute'
+/** 与 Claude Code settings.json 的 hooks[].hooks[].type 对齐 */
+export type HookActionType = 'command' | 'http' | 'prompt'
+/** 兼容旧抽象动词（迁移期保留，读取时映射到 command/http/prompt） */
+export type LegacyHookActionType = 'validate' | 'transform' | 'notify' | 'block' | 'execute'

 export interface HookAction {
-  type: HookActionType
+  type: HookActionType | LegacyHookActionType
   handler?: string
+  // ---- command (exec) form ----
   command?: string
+  /** exec form：直接传 argv 数组，不经 shell（2.1.134-143） */
+  args?: string[]
+  // ---- prompt form ----
   prompt?: string
+  // ---- http form (type:'http', 2.1.63) ----
+  url?: string
+  method?: 'POST' | 'GET' | 'PUT'
+  headers?: Record<string, string>
+  /** http body 模板，支持 ${...} 占位；省略则发完整 hook input JSON */
+  body?: string
   timeout?: number
   continueOnError?: boolean
+  /** 被 block 后是否继续后续 hook（2.1.134-143） */
+  continueOnBlock?: boolean
+  /** 触发后向终端写入的转义序列（2.1.134-143） */
+  terminalSequence?: string
 }
+
+/** SessionStart 专属配置（2.1.152） */
+export interface SessionStartHookConfig {
+  /** 启动时重新加载 skills */
+  reloadSkills?: boolean
+  /** 预设会话标题 */
+  sessionTitle?: string
+}
+
+/** 部分 hook 事件可携带 effort 级别透传（2.1.133） */
+export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

 export interface Hook {
   name: string
   type: HookType
   enabled: boolean
   description: string
   pattern?: string
   conditions?: HookConditions
   actions: HookAction[]
   stopOnError?: boolean
   priority?: number
   filePath?: string
   location?: 'user' | 'project'
   matcherIndex?: number
+  /** SessionStart 专属（reloadSkills / sessionTitle） */
+  sessionStart?: SessionStartHookConfig
+  /** hook 拿到的 effort 透传（只读展示；2.1.133） */
+  effort?: EffortLevel
+  /** PostToolUse：是否替换工具输出让 Claude 看到处理过的版本（2.1.121） */
+  replaceToolOutput?: boolean
+  /** Stop hook 阻断计数上限（2.1.143，默认 8） */
+  maxBlocks?: number
 }
```

`HookExecutionLog['hookType']`（`:82`）与 `HookType` 联动自动扩。

### 2. 后端 FileManager（`electron/services/file-manager.ts`）

- `getHooks()` 读 settings.json 部分（`:562`-`:603`）：把内层 hook 解析从"只取 command/prompt"扩成保留全部字段，按 `type` 分流：
  - `type:'command'` → `{type:'command', command, args, timeout, continueOnBlock, terminalSequence}`
  - `type:'http'` → `{type:'http', url, method, headers, body, timeout}`
  - `type:'prompt'` → `{type:'prompt', prompt, timeout}`
  - matcher 级若有 `reloadSkills`/`sessionTitle`（SessionStart）→ 写入 `hook.sessionStart`。
  - 旧抽象动词读到时映射（execute→command 等）。
- `saveHookToSettings()`（`:678`）：写回时按 action.type 序列化对应字段，不再硬塞 command。SessionStart 把 sessionStart 配置写到 matcher 级。**落盘走 spec009 `settingsWriter.writeKey(level,'hooks',hooksObj)`，本 spec 不自己 `fs.writeFile`**（防与 permissions/provider 多套并行写入丢字段）。
- 解析器抽成 `private hookActionFromSettings(raw): HookAction` / `hookActionToSettings(a): object`，集中处理三种 type。

### 3. ajv schema 校验（新增 `shared/schema/hook.schema.ts` 或 `electron/services/hook-validation.ts`）

```ts
import Ajv from 'ajv'
const ajv = new Ajv({ allErrors: true })

// 单个 action 的 schema（按 type 分支用 oneOf/if-then）
export const hookActionSchema = {
  type: 'object',
  required: ['type'],
  properties: { type: { enum: ['command','http','prompt'] }, /* ... */ },
  allOf: [
    { if: { properties: { type: { const: 'command' } } },
      then: { anyOf: [{ required: ['command'] }, { required: ['args'] }] } },
    { if: { properties: { type: { const: 'http' } } },
      then: { required: ['url'],
              properties: { method: { enum: ['POST','GET','PUT'] },
                            url: { type: 'string', pattern: '^https?://' } } } },
    { if: { properties: { type: { const: 'prompt' } } },
      then: { required: ['prompt'] } },
  ],
}
export const validateHookAction = ajv.compile(hookActionSchema)
export const validateHook = ajv.compile(hookSchema)  // 含 type∈HookType、actions 数组等
```

- 新增 IPC `hooks:validate`（`electron/ipc/hooks.ts`）：前端保存前调，返回 `{ valid, errors }`（ajv `validate.errors` 映射成可读消息）。
- `saveHook`/`saveHookToSettings` 服务端也跑一遍校验，校验失败抛错（防绕过前端）。

### 4. 前端 Hooks 表单控件清单（`src/pages/Hooks.tsx`）

`HOOK_TYPES`（`:57`）补全所有新 `HookType`。表单按"hook 事件类型"和"action.type"动态出控件：

**事件类型选择**（顶部 Select）：列全部 HookType，分组（工具类 / 会话类 / 压缩类 / 审计类 / 交互类）。

**SessionStart 专属面板**（仅 type==='SessionStart' 显示）：
- `reloadSkills`：Switch
- `sessionTitle`：Input

**Stop / StopFailure 面板**：
- `maxBlocks`：number Input（默认 8，提示"stop-hook 阻断上限"）

**PostToolUse 面板**：
- `replaceToolOutput`：Switch（"替换工具输出供 Claude 查看"）

**effort 透传**：只读展示 Badge（不可编辑，来自运行时）。

**每个 action 的子表单**（action.type Select：command / http / prompt）：
- `command`：command Input + `args`（可选，动态数组 Input，exec form）+ useScriptFile（沿用现状 `:104`-`:106`）
- `http`：`url` Input（校验 `^https?://`）、`method` Select(POST/GET/PUT)、`headers`（key-value 动态行）、`body` Textarea（占位符提示）
- `prompt`：`prompt` Textarea
- 通用：`timeout` number、`continueOnError` Switch、`continueOnBlock` Switch、`terminalSequence` Input（advanced 折叠区）

**保存流程**：点保存 → 调 `api.hooks.validate(hook)` → 有 error 则在 `validationErrors`（现状 `:129` 已有此 state）展示，阻止保存；通过则 `saveToSettings`。

`ClaudeCodeHookConfig` 接口（`:71`-`:78`）扩成与新 `HookAction` 同构。

### 5. 调试 session（可选，HOOK 可执行化属 P2，本 spec 只补类型识别）

`electron/ipc/hooks.ts:409` switch 补 MessageDisplay/PostCompact/ConfigChange/Elicitation 等 case（给合适 testPrompt 或标"需手动触发"）。http hook 的 dry-run 留到 P2 spec。

## 实现步骤

- [ ] 1. `shared/types/hook.ts`：按 diff 扩 HookType / HookActionType / HookAction / Hook，加 SessionStartHookConfig / EffortLevel。
- [ ] 2. 新增 `electron/services/hook-validation.ts`：ajv schema + `validateHook` / `validateHookAction` + 错误格式化。
- [ ] 3. `file-manager.ts`：`hookActionFromSettings` / `hookActionToSettings`；改 `getHooks()`（`:562`+）与 `saveHookToSettings()`（`:678`）按 type 分流读写；保存前校验。
- [ ] 4. `electron/ipc/hooks.ts`：加 `hooks:validate` handler；`launchDebugSession` switch 补新类型 case。
- [ ] 5. `src/lib/api.ts` + preload：暴露 `hooks.validate`。
- [ ] 6. `src/pages/Hooks.tsx`：`HOOK_TYPES` 补全、`ClaudeCodeHookConfig` 扩字段、按 type 动态控件、SessionStart/Stop/PostToolUse 专属面板、http/args/headers 控件、保存前 validate。
- [ ] 7. i18n：所有新 hook 类型 + 字段标签 + 校验错误文案。

## 验收标准

- [ ] Hooks 表单事件类型下拉含 MessageDisplay / PreCompact / PostCompact / ConfigChange / Elicitation / ElicitationResult / StopFailure / PermissionRequest / PostSession。
- [ ] 新建一个 `type:http` 的 hook（url=https://example.com/hook, method=POST, 一个 header, body 模板），保存后 `settings.json` 写出 `{type:"http", url, method, headers, body, timeout}` 且能再读回还原表单。
- [ ] command action 填 `args:["node","x.js"]` 能保存/还原（exec form）。
- [ ] SessionStart 勾 reloadSkills + 填 sessionTitle，写出到 settings.json 并读回。
- [ ] PostToolUse 勾 replaceToolOutput、Stop 设 maxBlocks=8，能保存/还原。
- [ ] ajv 校验：http hook 不填 url → 保存被拦并提示"url 必填且需 http(s)"；command 既无 command 又无 args → 被拦。
- [ ] 服务端 `saveHookToSettings` 对非法 hook 抛错（绕过前端也拦得住）。
- [ ] 读取一个含旧抽象动词（execute）的历史 hook 不报错，映射为 command 展示。

## 风险与备注

- Claude Code settings.json 中 hook 的精确字段名（如 `continueOnBlock` 是否驼峰、http 的 `body` 是否叫 `payload`）需以官方 schema 为准；本 spec 用最常见命名，落地时对一遍官方 `claude config` 文档/JSON schema，发现差异只改 `hookActionFromSettings/toSettings` 两个映射函数即可，类型层不动。
- effort 是运行时透传给 hook 的（环境变量/输入 JSON），**不是 settings.json 可配置项**——UI 只读展示，不写入 settings。
- `reloadSkills`/`sessionTitle` 的承载层（是 matcher 级还是 action 级）需核实；本 spec 放 matcher 级（`hook.sessionStart`），与 `saveHookToSettings` 的 matcher 写入对齐。
- ajv 的 `if/then` 分支校验需 ajv 8（已是 `^8.17.1`），无需额外插件；如需 format（uri）校验可加 `ajv-formats`，当前用 pattern 规避新依赖。
- 现有 `HookActionType` 被 `file-manager.ts:582` 的 `type:'execute'` 等多处引用，改类型后需全仓 grep `'execute' as const` / `validate|transform|notify|block` 修编译错（迁移期 union 保留 legacy 值降低爆炸面）。
```