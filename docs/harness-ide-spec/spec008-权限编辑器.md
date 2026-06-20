# spec008 · 权限编辑器

- 对应功能 ID：PERM-01 / PERM-03 / PERM-04
- 所属 Phase：P1
- 前置依赖：spec006 已为 SlashCommand 占位 `disallowedTools` 字段；**settings.json 写入依赖 spec009 的 `SettingsWriter`**——`savePermissionRule`/`deletePermissionRule` 不得自己 read-modify-write，统一走 `settingsWriter.writeKey(level,'permissions',permsObj)`（spec009 实现步骤 4 已认领此迁移；本 spec 只管 permissions 子树的规则增删逻辑）。
- 工作量估计：M

## 目标

做一个 **`Tool(param:value)` 参数级权限语法的可视化构造器**，覆盖三件事：

1. **PERM-01** `Tool(param:value)` 参数级权限——选工具、填参数匹配，生成/解析 `WebFetch(domain:github.com)`、`Bash(npm run *)` 这类规则字符串。
2. **PERM-04** `disallowed-tools` frontmatter——在 skill/command 里声明禁用工具，UI 可视化编辑该 frontmatter 列表。
3. **PERM-03** 权限分层——user（`~/.claude/settings.json`）/ project（`<cwd>/.claude/settings.json`）/ local（`<cwd>/.claude/settings.local.json`）三层 `permissions.allow` / `permissions.deny` / `permissions.ask`，可视化展示哪层定义了哪条、哪层覆盖哪层。

settings.json 权限真实形态：

```json
{
  "permissions": {
    "allow": ["Bash(npm run test)", "WebFetch(domain:github.com)", "Read(src/**)"],
    "deny":  ["Bash(rm -rf *)"],
    "ask":   ["Bash(git push:*)"]
  }
}
```

## 现状（引用真实 file:line）

- 项目无任何权限编辑界面、无 permission 类型、无解析 `Tool(param:value)` 的代码。grep 全仓 `permissions`/`allow`/`deny` 仅散落在 settings.json 读写，无结构化处理。
- `electron/services/file-manager.ts` 读 settings.json 的现成入口：`getHooks()` 内 `:554`-`:558` 已枚举三层 settings 文件路径（user settings.json / project settings.json / project settings.local.json）——权限层复用同一组路径。
- `shared/types/command.ts`（经 spec006）已占位 `disallowedTools?: string[]`，但无解析实现。
- `src/pages/Settings.tsx` 是放权限面板的候选页（或新建 `Permissions.tsx`）。

## 改动方案

### 1. 数据结构（新增 `shared/types/permission.ts`，`index.ts` 导出）

```ts
export type PermissionLevel = 'user' | 'project' | 'local'
export type PermissionEffect = 'allow' | 'deny' | 'ask'

/** 解析后的单条权限规则 */
export interface PermissionRule {
  /** 原始字符串，如 'WebFetch(domain:github.com)' 或 'Bash' */
  raw: string
  tool: string                       // 'WebFetch' / 'Bash' / 'Read' ...
  /** 参数约束。无括号时为空数组（= 整工具放行/禁止） */
  params: PermissionParam[]
  effect: PermissionEffect           // 来自所属 allow/deny/ask
  level: PermissionLevel             // 来自所属文件层
  /** 若被更高优先级层的同规则覆盖（见优先级），记覆盖层 */
  overriddenBy?: PermissionLevel
}

/** 单个参数约束：param:value 形式 */
export interface PermissionParam {
  key: string                        // 'domain' / 'command' / 路径模式时 key 省略
  value: string                      // 'github.com' / 'npm run *'
  /** 是否含 glob（* / **） */
  isGlob: boolean
}

/** 一层文件的完整权限快照 */
export interface PermissionLayer {
  level: PermissionLevel
  filePath: string
  allow: PermissionRule[]
  deny: PermissionRule[]
  ask: PermissionRule[]
  exists: boolean
}

/** 合并三层后的视图（供 UI 展示覆盖关系） */
export interface PermissionModel {
  layers: PermissionLayer[]          // [user, project, local]
  /** 有效规则（合并后实际生效），按 tool 分组 */
  effective: PermissionRule[]
}
```

### 2. 解析 / 生成 `Tool(param:value)` 的函数（新增 `shared/permission/parse.ts`，前后端共用）

```ts
/** 解析单条规则字符串 → PermissionRule（不含 level/effect，由调用方填） */
export function parsePermissionRule(raw: string): Omit<PermissionRule, 'effect' | 'level'> {
  // 形如 'Tool' | 'Tool(arg)' | 'Tool(key:value)' | 'Tool(key:value, key2:value2)'
  const m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?$/)
  if (!m) return { raw, tool: raw, params: [] }
  const tool = m[1]
  const inner = m[2]?.trim()
  if (!inner) return { raw, tool, params: [] }
  // 按逗号切多参数（注意 value 内可能含冒号，如 url；只在第一个冒号处切 key/value）
  const params: PermissionParam[] = inner.split(',').map(seg => seg.trim()).map(seg => {
    const ci = seg.indexOf(':')
    if (ci === -1) {
      // 无 key 的纯模式，如 Bash(npm run *) / Read(src/**)
      return { key: '', value: seg, isGlob: /[*]/.test(seg) }
    }
    const key = seg.slice(0, ci).trim()
    const value = seg.slice(ci + 1).trim()
    return { key, value, isGlob: /[*]/.test(value) }
  })
  return { raw, tool, params }
}

/** 由结构化字段生成规则字符串（保证 round-trip 与 parse 一致） */
export function formatPermissionRule(tool: string, params: PermissionParam[]): string {
  if (!params.length) return tool
  const inner = params.map(p => p.key ? `${p.key}:${p.value}` : p.value).join(', ')
  return `${tool}(${inner})`
}

/** 已知工具与其参数 key 提示（驱动 UI 下拉/自动补全） */
export const TOOL_PARAM_HINTS: Record<string, string[]> = {
  WebFetch: ['domain'],
  Bash: [''],              // 纯命令模式，无 key
  Read: [''], Write: [''], Edit: [''],   // 路径 glob
  WebSearch: [],
  // ... 可扩展
}
```

> 解析要点：value 里允许出现 `:`（如 `Bash(git push:*)` 这种 Claude Code 用 `:` 表示前缀匹配），所以**只在第一个冒号切 key/value，且当 tool 是 Bash 这类无 key 工具时整体当 value**——实现里对 `Bash`/`Read`/`Write` 等 `TOOL_PARAM_HINTS[tool]===['']` 的工具，inner 整体作为单个 `{key:'', value:inner}`，不按冒号切 key。

### 3. 后端 FileManager（`electron/services/file-manager.ts`）

- `async getPermissionModel(): Promise<PermissionModel>`：
  - 读三层 settings 文件（复用 `:554`-`:558` 的路径定义，抽成 `private settingsLayerPaths()`）。
  - 每层取 `.permissions.{allow,deny,ask}`，每条字符串过 `parsePermissionRule` + 填 effect/level，组成 `PermissionLayer`。
  - 合并：优先级 **local > project > user**（local 覆盖 project 覆盖 user）；同 `raw` 字符串在更高层出现时，低层那条标 `overriddenBy`。`effective` = 各 tool 取最高层有效规则。
- `async savePermissionRule(level, effect, rule: string)` / `async deletePermissionRule(level, effect, rule)`：用 spec009 `settingsWriter` 读对应层 raw → 改 `permissions[effect]` 数组（去重）→ `writeKey(level,'permissions',permsObj)` 写回（read-modify-write 整对象、原子写、保留未知字段，ENOENT 自动新建）。**不自己 `fs.writeFile`**。
- disallowed-tools frontmatter：`async getDisallowedTools(filePath): Promise<string[]>` / `async setDisallowedTools(filePath, tools)`——解析 skill/command 的 YAML frontmatter `disallowed-tools` 字段（CSV 或数组），写回 frontmatter（复用现有 frontmatter 解析/拼装，参考 `parseSkillMD:267`、`parseCommandMarkdown:959`）。

### 4. IPC（新增 `electron/ipc/permissions.ts`，`index.ts` 注册）

```ts
ipcMain.handle('permissions:getModel', () => fileManager.getPermissionModel())
ipcMain.handle('permissions:saveRule',   (_e, level, effect, rule) => fileManager.savePermissionRule(level, effect, rule))
ipcMain.handle('permissions:deleteRule', (_e, level, effect, rule) => fileManager.deletePermissionRule(level, effect, rule))
ipcMain.handle('permissions:getDisallowedTools', (_e, fp) => fileManager.getDisallowedTools(fp))
ipcMain.handle('permissions:setDisallowedTools', (_e, fp, tools) => fileManager.setDisallowedTools(fp, tools))
```

`src/lib/api.ts` + preload 暴露 `permissions` 命名空间。

### 5. 前端 UI（新增 `src/pages/Permissions.tsx`，或 Settings 子页签）

**A. 分层权限矩阵**（PERM-03）：
- 三列（user / project / local）× 三组（allow / deny / ask）的规则列表。
- 被覆盖规则（`overriddenBy`）灰显 + line-through + 标注覆盖层。
- 每条规则右侧删除按钮（调 `deleteRule`，按其 level/effect）。

**B. `Tool(param:value)` 构造器**（PERM-01，弹窗/底部表单）：
- `tool` Select（来自 `TOOL_PARAM_HINTS` 的 key + 自由输入）。
- 参数动态行：每行 `key` Input（若 `TOOL_PARAM_HINTS[tool]` 有提示则给下拉）+ `value` Input + glob 提示标记；"+ 添加参数"。
- 目标层 Select（user/project/local）+ effect Select（allow/deny/ask）。
- **实时预览**：用 `formatPermissionRule` 显示将写入的字符串（如 `WebFetch(domain:github.com)`）。
- 保存调 `saveRule`。

**C. disallowed-tools 编辑器**（PERM-04，在 Skills/Commands 详情页内嵌或独立）：
- 给定 skill/command 文件，展示其 frontmatter `disallowed-tools` 为 tag 列表，可增删，保存调 `setDisallowedTools`。

### 6. 导航

- 新建独立 Permissions 页：`Layout.tsx` 加入口（lucide `ShieldCheck`），`App.tsx` 加路由；或作为 Settings 的一个 Tab。

## 实现步骤

- [ ] 1. `shared/types/permission.ts`：PermissionRule / Param / Layer / Model 等类型 + 导出。
- [ ] 2. `shared/permission/parse.ts`：`parsePermissionRule` / `formatPermissionRule` / `TOOL_PARAM_HINTS`，含 Bash 等无 key 工具的特殊处理。
- [ ] 3. `file-manager.ts`：`settingsLayerPaths()`、`getPermissionModel()`、`savePermissionRule()`、`deletePermissionRule()`、`getDisallowedTools()`、`setDisallowedTools()`。
- [ ] 4. `electron/ipc/permissions.ts`：5 个 handler；`index.ts` 注册。
- [ ] 5. `src/lib/api.ts` + preload：`permissions` 命名空间。
- [ ] 6. `src/pages/Permissions.tsx`：分层矩阵 + Tool(param:value) 构造器 + disallowed-tools 编辑器。
- [ ] 7. `Layout.tsx` + `App.tsx`：导航 + 路由。
- [ ] 8. 单测：`parsePermissionRule` / `formatPermissionRule` round-trip。
- [ ] 9. i18n。

## 验收标准

- [ ] round-trip 单测全过：`WebFetch(domain:github.com)`、`Bash(npm run test)`、`Bash(git push:*)`、`Read(src/**)`、`Bash`（无参）解析后再 format 得回原串。
- [ ] `Bash(git push:*)` 解析为单参数 `{key:'', value:'git push:*', isGlob:true}`（value 内冒号不被当 key 分隔符）。
- [ ] 构造器选 WebFetch + key=domain + value=github.com → 预览显示 `WebFetch(domain:github.com)`，保存后写入选定层 settings.json 的 `permissions.allow`。
- [ ] 三层都定义同一 `raw` 规则时，user/project 那条标 `overriddenBy:'local'`（或对应更高层）并灰显，local 那条生效。
- [ ] 删除一条规则只改对应层文件，其他层与其他规则不变。
- [ ] 在某 skill 的 SKILL.md frontmatter 加 `disallowed-tools: WebFetch, Bash`，Permissions/详情页能读出两个 tag；增删后写回 frontmatter 且 SKILL.md 其余内容不变。
- [ ] 任一层 settings 文件不存在时 `getPermissionModel()` 不崩，该层 `exists:false`、规则空。

## 风险与备注

- Claude Code 的 `Tool(param:value)` 里 `:` 既用于 `key:value`（如 `domain:github.com`）又用于前缀匹配（如 `git push:*`），二义性靠"工具是否有命名参数"区分。`TOOL_PARAM_HINTS` 用 `['']` 标记 Bash/Read/Write 这类"路径/命令整体匹配、无命名 key"的工具，解析时对它们不切 key。落地前对官方权限语法文档核对工具清单，补全 `TOOL_PARAM_HINTS`。
- 覆盖优先级 local>project>user 是 Claude Code settings 合并的通行约定；deny 通常无条件优先于 allow（安全语义），`effective` 计算时若同工具同时有 allow 与 deny，deny 胜——本 spec 在合并逻辑里对 deny 单独置顶，UI 标注"被 deny 覆盖"。
- 写回 settings.json 要保留用户原有字段——**统一走 spec009 `SettingsWriter.writeKey`（read-modify-write 整对象 + 原子写）**，不再自己 `fs.writeFile`、也不对标旧的 `saveHookToSettings:728` 直写实现（那条本身也在 spec009 迁移之列）。
- disallowed-tools frontmatter 的值格式（CSV vs YAML 数组）需兼容两种读法，写回统一用 CSV 或数组之一（建议 CSV，与 command frontmatter 现有平铺 key:value 解析 `:964` 兼容）。
- 与 spec007（hooks）同改 settings.json，permissions 与 hooks 是同一文件不同顶层 key——两者都走 spec009 `SettingsWriter`（整对象 read-modify-write、只改各自子树），不会相互覆盖；这正是 spec009 统一写入层要保证的，不再各写各的。
```