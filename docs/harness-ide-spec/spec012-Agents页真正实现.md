# spec012 · Agents 页真正实现

- 对应功能 ID：ORCH-07（+ agents 数据源补全）
- 所属 Phase：P1
- 前置依赖：spec004（installed_plugins.json 读取 + 覆盖检测模式可复用）；无强依赖也可独立做
- 工作量估计：M

## 目标

把占位的 Agents 页做成**真正的 subagent 配置浏览器**。覆盖三件事：

1. **数据源补全**：现有 `getAgents()` 读 `.json`，但 Claude Code 2.1.x 的 agent 真相源是 **Markdown + YAML frontmatter**（`~/.claude/agents/*.md`、`<cwd>/.claude/agents/*.md`、以及 **plugin 自带 agent**）。重写扫描，按三层来源解析 `.md`。
2. **展示**：每个 agent 的 **system prompt（frontmatter 之后的正文）、tool 列表（`tools` frontmatter）、model override（`model` frontmatter）、description、来源层**。
3. **体现 Agent Teams 收缩（ORCH-07）**：Agent Teams 在 2.1.178 已收缩成 session 隐式存在，删了 TeamCreate/TeamDelete。本工具**不做** team 的增删管理，只在页面用一段说明承接这个事实——agent 是配置实体（`.md` 文件），team 是运行时 session 概念，工具只读配置不碰运行时编排。

agent `.md` 真实形态（Claude Code subagent 标准）：

```markdown
---
name: code-reviewer
description: Reviews code for correctness and style
tools: Read, Grep, Bash
model: claude-sonnet-4-5
---

You are a meticulous code reviewer. When given a diff...
（这一段正文就是 subagent 的 system prompt）
```

三层来源目录：

```
user   ：~/.claude/agents/*.md
project：<cwd>/.claude/agents/*.md
plugin ：<plugin installPath>/agents/*.md   （来自 installed_plugins.json，复用 spec004 逻辑）
```

## 现状（引用真实 file:line）

- `src/pages/Agents.tsx:1`-`:13` 整页占位（`Agents management coming soon...`）。
- `electron/services/file-manager.ts:501`-`:525` `getAgents()`：用 `scanDirectory(..., '.json')` 扫 **project/user 两层的 `.json`**，再 `readJSONFile<Agent>`。**问题**：
  - 只扫 `.json`，扫不到真实的 `.md` agent（本机 `~/.claude/agents/` 若有 `.md` 全被忽略）。
  - 无 plugin 层。
  - `:518` `readJSONFile<Agent>` 把文件当 JSON 解析，`.md` 直接失败。
- `shared/types/agent.ts:26`-`:39` `Agent` 接口面向"自动化触发的旧 agent 模型"（`trigger`/`capabilities`/`events`），**缺** subagent 的真实字段：`systemPrompt`、`tools`（字符串数组）、`model`（override）、source/plugin 元信息。
- `electron/ipc/agents.ts` 透传 `getAgents()`（与 skills 同构）。

## 改动方案

### 1. 类型 diff（`shared/types/agent.ts`）

保留旧字段兼容，新增 subagent 真实字段：

```diff
 export interface Agent {
   name: string
   type: 'subagent'
   description: string
   enabled: boolean
-  trigger: AgentTrigger
-  instructions: string
-  capabilities: AgentCapabilities
+  /** @deprecated 旧自动化模型，新代码不填；保留避免编译破坏 */
+  trigger?: AgentTrigger
+  /** @deprecated 旧字段；subagent 用 systemPrompt */
+  instructions?: string
+  /** @deprecated 旧字段 */
+  capabilities?: AgentCapabilities
+  /** subagent 的 system prompt（.md frontmatter 之后的正文） */
+  systemPrompt?: string
+  /** 允许使用的 tool 列表（frontmatter tools，CSV 或数组解析后的数组）；空/缺省 = 继承全部 */
+  tools?: string[]
+  /** model override（frontmatter model），缺省 = 用会话默认模型 */
+  model?: string
   interruptible?: boolean
   maxRuntime?: number
   dependencies?: string[]
   filePath?: string
-  location?: 'user' | 'project'
+  /** @deprecated 用 source；映射 plugin→'user' */
+  location?: 'user' | 'project'
+  /** 来源层 */
+  source?: 'user' | 'project' | 'plugin'
+  /** 仅 plugin：所属 marketplace / plugin / 版本（复用 spec004 概念） */
+  marketplace?: string
+  pluginName?: string
+  version?: string
+  /** 同名被更高优先级来源覆盖时记录覆盖者（user>project>plugin） */
+  overriddenBy?: string
 }
```

### 2. 后端 FileManager（`electron/services/file-manager.ts`）

重写 `getAgents()`（`:501`），并加 `parseAgentMarkdown`：

```ts
async getAgents(): Promise<Agent[]> {
  const out: Agent[] = []

  // 1. user / project 层：扫 *.md（不再扫 .json）
  await this.scanAgentDir(path.join(this.userConfigPath, 'agents'),
                          { source: 'user' }, out)
  await this.scanAgentDir(path.join(this.projectPath, '.claude', 'agents'),
                          { source: 'project' }, out)

  // 2. plugin 层：复用 spec004 的 readInstalledPlugins() + enabledPlugins 过滤
  const installed = await this.readInstalledPlugins()   // spec004
  const enabled   = await this.readEnabledPlugins()     // spec004
  for (const [key, entries] of Object.entries(installed)) {
    if (enabled[key] === false) continue
    const [pluginName, marketplace] = key.split('@')
    for (const entry of entries) {
      await this.scanAgentDir(path.join(entry.installPath, 'agents'),
        { source: 'plugin', marketplace, pluginName, version: entry.version }, out)
    }
  }

  // 3. 覆盖检测：同 name，user>project>plugin（复用 spec004 同款 rank 逻辑）
  this.markOverrides(out, a => a.source === 'user' ? 3 : a.source === 'project' ? 2 : 1)
  return out
}

// scanAgentDir：readdir <dir>/*.md，对每个调 parseAgentMarkdown(content, opts)；dir 不存在静默
private async scanAgentDir(dir: string, opts: AgentScanOpts, out: Agent[]): Promise<void>

private parseAgentMarkdown(filePath: string, content: string, opts: AgentScanOpts): Agent | null {
  // 复用 parseSkillMD/parseCommandMarkdown 的 frontmatter 提取（:959 同款正则）
  const fm = this.parseFrontmatter(content)            // 抽公共方法（见下）
  const systemPrompt = content.replace(/^---[\s\S]*?---\n/, '').trim()
  const tools = fm.tools
    ? fm.tools.split(',').map(s => s.trim()).filter(Boolean)   // CSV；也兼容 YAML 数组
    : undefined
  return {
    name: fm.name || path.basename(filePath, '.md'),
    type: 'subagent',
    description: fm.description || '',
    enabled: true,
    systemPrompt,
    tools,
    model: fm.model,
    filePath,
    source: opts.source,
    location: opts.source === 'project' ? 'project' : 'user',  // 兼容旧字段
    marketplace: opts.marketplace,
    pluginName: opts.pluginName,
    version: opts.version,
  }
}
```

- **抽公共 frontmatter 解析** `private parseFrontmatter(content): Record<string,string>`——把 `:959`-`:970` 的逐行 `key: value` 解析抽出来，agent/command/skill 共用（顺手降复杂度，非必须但推荐）。
- `markOverrides(out, rank)`：与 spec004 覆盖检测同款，按 name 分组、标 `overriddenBy`。可抽成泛型 `private markOverridesByName<T extends {name:string; source?:string; overriddenBy?:string}>(...)` 供 skill/agent 共用。
- `getAgent` / `saveAgent` / `deleteAgent`（`:527`/`:532`/`:542`）：`saveAgent` 现写 `.json`（`:538`），需改为写 `.md`（frontmatter + systemPrompt 拼装）才与新数据源一致——本 spec 范围以**读取展示为主**；写回（编辑 agent）可标"P1 读优先，编辑留增量"，但至少 `saveAgent` 不能再写 `.json` 误导。建议本 spec 直接实现 `.md` 写回（拼 frontmatter）。

### 3. IPC（`electron/ipc/agents.ts`）

`agents:getAll` 签名不变（返回 `Agent[]`，新字段随对象带出）。无新 handler。

### 4. 前端（`src/pages/Agents.tsx`，整页重写）

参考 Skills.tsx 的列表 + 详情双栏布局：

- **列表**：每个 agent 一行/一卡，显示 name、description、来源 Badge（user 绿 / project 蓝 / plugin 紫显示 `pluginName@version`，复用 spec004 `SourceBadge`）。`overriddenBy` 的灰显 + line-through + "被覆盖" Badge。
- **source 过滤**：全部 / user / project / plugin（同 Skills）。
- **详情面板**：
  - **System Prompt**：用 Monaco（`@monaco-editor/react` 已在依赖）只读展示正文，或 `<pre>` + 折叠。
  - **Tools**：tool 列表渲染成 tag；空时显示"继承全部工具"。
  - **Model override**：显示 `model` 值；空时显示"会话默认模型"。
  - plugin 来源时显示 marketplace/pluginName/version。
  - 被覆盖时醒目提示条。
- **Agent Teams 说明卡（ORCH-07）**：页面顶部或侧栏一段只读说明——"Agent Teams 自 2.1.178 收缩为 session 隐式存在，不再有 TeamCreate/TeamDelete。本页只浏览 agent 配置（.md 文件），team 的运行时编排（tmux teammate panes）属会话运行时，不在配置层管理。"

## 实现步骤

- [ ] 1. `shared/types/agent.ts`：按 diff 加 `systemPrompt`/`tools`/`model`/`source`/`marketplace`/`pluginName`/`version`/`overriddenBy`，旧字段转可选。
- [ ] 2. `file-manager.ts`：抽 `parseFrontmatter`；加 `scanAgentDir`、`parseAgentMarkdown`、`markOverridesByName`（或复用 spec004）。
- [ ] 3. `file-manager.ts`：重写 `getAgents()` 三层 + plugin（复用 spec004 `readInstalledPlugins`/`readEnabledPlugins`）+ 覆盖检测。
- [ ] 4. `file-manager.ts`：`saveAgent` 改为写 `.md`（frontmatter + systemPrompt）；`deleteAgent` 按 filePath（已是）。
- [ ] 5. `src/pages/Agents.tsx`：整页重写——列表 + source 过滤 + 详情（systemPrompt/tools/model）+ Teams 说明卡，复用 `SourceBadge`。
- [ ] 6. i18n：agent / systemPrompt / tools / model override / Teams 说明文案。

## 验收标准

- [ ] 在 `~/.claude/agents/` 放一个标准 subagent `.md`（含 name/description/tools/model frontmatter + 正文），Agents 页能列出它并在详情显示 system prompt、tools tag、model。
- [ ] plugin 自带 agent（某 enabled plugin 的 `installPath/agents/*.md`）被扫出并标 plugin 来源 `pluginName@version`。
- [ ] 旧 `.json` agent 不再是唯一数据源；`.md` agent 不再因 JSON 解析失败而丢失（`getAgents` 不抛错）。
- [ ] `tools` frontmatter 为 `Read, Grep, Bash` 时解析为 `['Read','Grep','Bash']`；缺省时详情显示"继承全部工具"。
- [ ] 同名 agent user 层 + plugin 层：plugin 那条标 `overriddenBy` 灰显，user 那条正常。
- [ ] source 过滤选 plugin 只列 plugin 来源 agent。
- [ ] 页面有 Agent Teams 收缩说明卡，且**无** TeamCreate/TeamDelete 类按钮（验证不做运行时编排）。
- [ ] `installed_plugins.json` 缺失时 plugin 层为空、user/project agent 仍正常（ENOENT 静默，依赖 spec004 行为）。

## 风险与备注

- agent `.md` 的 `tools` frontmatter 可能是 CSV（`Read, Grep`）也可能是 YAML 数组（`[Read, Grep]` 或多行 `- Read`）。`parseAgentMarkdown` 先按现有逐行 `key: value` 解析（`:964` 同款，只处理单行 CSV）；YAML 数组多行形式当前解析器读不全——本 spec 至少兼容 CSV 与方括号内联数组，多行 `- item` 形式留备注（与 spec007/008 一样，复杂 YAML 留作后续，先覆盖主流写法）。
- 现有 `Agent` 的旧字段（`trigger`/`capabilities`/`instructions`）被 `getAgents`/`saveAgent`/Dashboard 等多处引用，改为可选后需全仓 grep 修编译错（给默认值或可选链）。迁移期保留字段降低爆炸面。
- subagent 五层嵌套（ORCH-06）的**运行时调用树**是 Phase 2 spec016 的事；本 spec 只读静态 agent 配置，不画调用树。
- plugin agent 的发现与 spec004 plugin skill 完全同构（同一 `installed_plugins.json` + `installPath` + enabled 过滤），**强烈建议把 plugin 根遍历抽成一个共用迭代器**（`private *iterEnabledPluginDirs(subdir: 'skills'|'agents'|'commands')`），skill/agent/command 三层来源共用，避免三处重复。这条若 spec004 已落地则直接复用。
- `saveAgent` 写 `.md` 时 frontmatter 字段顺序/缩进无严格要求，但要保证再读回能还原（round-trip）；systemPrompt 原样写在 `---` 块之后。
