# spec009 · 配置写入与 settings 分层

- 对应功能 ID：PERM-02 / PERM-07
- 所属 Phase：P1
- 前置依赖：无（但 spec007 Hooks、spec008 权限编辑器、spec010 模型治理、spec011 Worktree、spec013 MCP 都消费本 spec 提供的统一写入层，建议先落地本 spec；spec007/008 写定在前，需回填依赖本 spec，见"现状"末与实现步骤）
- 工作量估计：M

## 目标

实现工具内修改 `settings.json` 的**统一写入层**，是 Phase 1 所有"改配置"类 spec（spec008/010/011/013）的公共地基。覆盖三件事：

1. **PERM-02** `/config key=value` 的等价写入——任意点号路径 key（如 `model`、`permissions.allow`、`worktree.baseRef`）一行式 read-modify-write，**保留未知字段、不破坏其他 key、保留格式约定**。
2. **user / project / local 三层 settings 的读取合并**——把三层 settings.json 读出来、给出"每个有效 key 来自哪一层""写到哪一层"的合并视图。
3. **PERM-07** `--safe-mode` / `disableBundledSkills` / `/cd` 等开关的展示——这些是 CLI flag 或顶层 settings 字段，工具只读展示其当前态与说明（不可在工具里真正启动 safe-mode session，但能读 `disableBundledSkills` 这类落盘字段并提示）。

> 核心约束（演进路径已核实）：`claude` CLI 不在 PATH，所以"改配置"必须以**直接读写 settings.json 为主路径**，`/config` CLI 调用仅作可选增强。本 spec 不依赖 CLI。

settings 三层真相源（与 spec008 `:554`-`:558` 一致）：

```
user   ：~/.claude/settings.json
project：<cwd>/.claude/settings.json
local  ：<cwd>/.claude/settings.local.json   （不进 git，优先级最高）
```

合并优先级 **local > project > user**（与 spec008 权限合并一致）。

## 现状（引用真实 file:line）

- 写 settings.json 的代码散落、各写各的，没有统一层：
  - `electron/services/file-manager.ts:678`-`:728` `saveHookToSettings`：自己 `fs.readFile` + `JSON.parse` + 改 `settings.hooks` + `fs.writeFile(JSON.stringify(settings,null,2))`。这是目前**唯一**正确保留未知字段的写法（read-modify-write 整个对象），但只服务 hooks，且没抽出来。（注：函数起于 `:678`，spec007 引用一致；早前本 spec 误标 `:691`，已校正。）
  - `electron/services/provider-manager.ts:218`-`:267` `syncToClaudeSettings`：另起一套 read-modify-write，只动 `env.ANTHROPIC_*`，用 `.tmp` + `rename` 原子写。两套写法不一致（一个原子写、一个直写）。
  - `electron/services/file-manager.ts:166`-`:170` `writeJSONFile`：**整文件覆盖**（`JSON.stringify(data,null,2)`），不保留未知字段——任何用它写 settings.json 的路径都会丢字段，**禁止用于 settings.json**。
- 无任何"三层 settings 合并视图"的读取代码。`getHooks()`（`:550`）逐层读但只取 `.hooks` 子树、不合并、不记录来源层。
- **local 层被错标成 project（需本 spec 一并修正）**：现状 `file-manager.ts:557` 那个三层路径数组里，`settings.local.json` 这一条的 `location` 被硬编码成 `'project' as const`——即 local 层在现有代码里根本没被当成独立的一层。spec008（权限）、spec011（worktree）、本 spec 都依赖能区分出 local 层（`SettingsLevel='user'|'project'|'local'`），所以本 spec 的 `settingsLayerPaths()` 必须把 local 正确标成 `'local'`，并在迁移 `getHooks`/`saveHookToSettings` 时把那条 `location:'project'`（local 行）改对。
- 本机 `~/.claude/settings.json` 实测顶层 key：`statusLine` / `enabledPlugins` / `extraKnownMarketplaces` / `effortLevel` / `tui` / `skipWorkflowUsageWarning`——**工具任何写入都不能动到这些它不认识的 key**。
- 无 safe-mode / disableBundledSkills 的任何读取或展示。
- **spec007（Hooks）、spec008（权限）写定在本 spec 之前，正文未回指统一写入层**：spec008 的 `savePermissionRule` 明确"对标 `saveHookToSettings:728` 旧直写风格"自己 read-modify-write，spec007 也在自己范围内改 `saveHookToSettings`——两者都没说"改走 SettingsWriter"。若不回填，落地后 settings 仍是"hooks 一套、permissions 一套、provider 一套、本 spec 一套"的多套并行写入，正是本 spec 要消灭的。本 spec 的迁移清单（实现步骤第 4 步）因此必须**同时认领 hooks 和 permissions 两条**，并在 spec007/008/013 各回填一句依赖声明。

## 改动方案

### 1. 数据结构（新增 `shared/types/settings.ts`，`index.ts` 导出）

```ts
export type SettingsLevel = 'user' | 'project' | 'local'

/** 一层 settings 文件快照 */
export interface SettingsLayer {
  level: SettingsLevel
  filePath: string
  exists: boolean
  /** 原始解析对象（保留全部未知字段，写回时不丢） */
  raw: Record<string, unknown>
  /** 解析/读取错误（JSON 非法等），exists 但 parse 失败时填 */
  parseError?: string
}

/** 合并三层后的视图 */
export interface SettingsModel {
  layers: SettingsLayer[]            // 顺序固定 [user, project, local]
  /** 每个点号路径 key 的有效值与来源层（仅顶层 + 一层嵌套即可满足展示） */
  effective: EffectiveSetting[]
}

export interface EffectiveSetting {
  /** 点号路径，如 'model' / 'permissions.allow' / 'worktree.baseRef' */
  key: string
  value: unknown
  /** 该有效值来自哪一层 */
  source: SettingsLevel
  /** 同一 key 在更低优先级层也定义了（被本层覆盖），记录被覆盖的层 */
  overriddenLevels?: SettingsLevel[]
}

/** safe-mode / 内置 skill 等开关的只读展示模型 */
export interface SafetyToggles {
  /** settings.json 顶层 disableBundledSkills（2.1.169），落盘可读 */
  disableBundledSkills?: boolean
  /** --safe-mode 是 CLI 启动 flag，不落盘；工具只展示说明 */
  safeModeAvailable: true
  /** /cd 不断缓存换工作目录，纯 CLI 命令；展示说明 */
}
```

### 2. 统一写入模块（新增 `electron/services/settings-writer.ts`）

这是本 spec 的**核心交付**——一个不破坏未知字段的 settings read-modify-write 模块，所有改 settings 的 spec 调它，不再各写各的。

```ts
import { promises as fs } from 'fs'
import * as path from 'path'

/** 按点号路径读一个值（'a.b.c'） */
export function getByPath(obj: Record<string, unknown>, keyPath: string): unknown

/** 按点号路径写一个值，沿途缺失的对象自动补 {}；返回新对象（不可变） */
export function setByPath(
  obj: Record<string, unknown>, keyPath: string, value: unknown
): Record<string, unknown>

/** 按点号路径删一个 key（用于 unset，等价 /config key=） */
export function unsetByPath(
  obj: Record<string, unknown>, keyPath: string
): Record<string, unknown>

export class SettingsWriter {
  constructor(private resolvePath: (level: SettingsLevel) => string) {}

  /** 读一层，返回 SettingsLayer。ENOENT → exists:false、raw:{}；JSON 非法 → parseError */
  async readLayer(level: SettingsLevel): Promise<SettingsLayer>

  /**
   * 写一个 key 到指定层：read-modify-write 整个对象，
   * 只改目标 key 路径，其余字段（含工具不认识的）原样保留。
   * value===undefined 时等价 unset（删 key）。
   * 原子写：写 .tmp 再 rename（与 provider-manager 一致）。
   */
  async writeKey(
    level: SettingsLevel, keyPath: string, value: unknown
  ): Promise<void> {
    const filePath = this.resolvePath(level)
    let raw: Record<string, unknown> = {}
    try {
      raw = JSON.parse(await fs.readFile(filePath, 'utf-8'))
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e   // JSON 非法不静默吞，避免覆盖坏文件
    }
    const next = value === undefined
      ? unsetByPath(raw, keyPath)
      : setByPath(raw, keyPath, value)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const tmp = `${filePath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf-8')
    await fs.rename(tmp, filePath)
  }

  /** 批量写多个 key（一次 read-modify-write，避免多次落盘竞态） */
  async writeKeys(
    level: SettingsLevel, entries: Array<{ keyPath: string; value: unknown }>
  ): Promise<void>

  /** 读三层、计算 effective 合并视图 */
  async getModel(): Promise<SettingsModel>
}
```

`getModel()` 合并逻辑：

```ts
// 收集每层所有"顶层 key + 一层嵌套 key"的点号路径，
// 按 local > project > user 取胜者；低层定义过同 key 的记入 overriddenLevels。
```

**effective 的产出契约（下游依赖，必须写死）**：对一个值为对象的顶层 key（如 `modelOverrides`、`worktree`），effective **同时产出两类条目**——① 父 key 整对象条目（`key:'modelOverrides', value:{...整个对象}`），② 各叶子条目（`key:'modelOverrides.subagent'` 等）。这样 spec010 用 `effective.find(e => e.key==='modelOverrides')` 能拿到整对象、spec011 用 `effective.find(e => e.key==='worktree.baseRef')` 能拿到叶子，两种取法都成立。**不要只产叶子**，否则 spec010 取 `modelOverrides` 会落空。`mcpServers` 这种大对象不在 settings.json（在独立文件），不适用此规则。

### 3. 后端 FileManager 接入（`electron/services/file-manager.ts`）

- 抽 `private settingsLayerPaths(): Record<SettingsLevel, string>`（与 spec008 共用，取代 `:554`-`:557` 那个把 local 误标 `'project'` 的旧数组）：
  ```ts
  return {
    user:    path.join(this.userConfigPath, 'settings.json'),
    project: path.join(this.projectPath, '.claude', 'settings.json'),
    local:   path.join(this.projectPath, '.claude', 'settings.local.json'),  // 正确标为 local，不再误标 project
  }
  ```
  现状 `:554`-`:558` 那个数组（`getHooks` 在用）里 local 行写死 `location:'project' as const`，迁移时一并改为 `'local'`，让 hooks 的三层来源也能正确区分 local。
- 持有一个 `private settingsWriter = new SettingsWriter(l => this.settingsLayerPaths()[l])`。
- 新增门面方法：
  - `async getSettingsModel(): Promise<SettingsModel>` → `settingsWriter.getModel()`
  - `async setSettingKey(level, keyPath, value): Promise<void>` → `settingsWriter.writeKey(...)`
  - `async getSafetyToggles(): Promise<SafetyToggles>`——读三层 effective 的 `disableBundledSkills`，组装只读展示对象。
- **迁移既有写入到统一层（关键，防字段丢失回归 + 防多套并行写入）**：把当前所有写 settings.json 的路径**全部**收口到 `settingsWriter`，不留一条游离：
  - `saveHookToSettings`（`:678`，spec007 改写）→ 内部用 `settingsWriter` 读 raw、改 `hooks` 子树、`writeKey(level, 'hooks', hooksObj)` 写回。
  - **`savePermissionRule` / `deletePermissionRule`（spec008 新增）→ 同样走 `settingsWriter.writeKey(level, 'permissions', permsObj)`**，不得自己 read-modify-write。这条之前被漏掉，是本次回填的重点：否则 permissions 写入会永久停在 spec008 的旧式非原子直写，成为第 4 套游离实现。
  - `provider-manager.ts:218 syncToClaudeSettings`（只动 `env.*`）→ 列入跟进迁移：长期也应改走 `settingsWriter`（统一一把写锁，消除与本 spec 并发写同文件的 lost-update，见风险段）。本 spec 不强制立即迁，但必须在风险登记。
  - `writeJSONFile`（`:166`）保留给非 settings 的 JSON（providers.json 等）；在其上方加注释"禁止用于 settings.json，settings 走 SettingsWriter"。

### 4. IPC（新增 `electron/ipc/settings.ts`，`index.ts` 注册）

```ts
ipcMain.handle('settings:getModel',     () => fileManager.getSettingsModel())
ipcMain.handle('settings:setKey',       (_e, level, keyPath, value) =>
  fileManager.setSettingKey(level, keyPath, value))
ipcMain.handle('settings:getToggles',   () => fileManager.getSafetyToggles())
```

`src/lib/api.ts` + `preload.cjs` 暴露 `settings` 命名空间（`getModel` / `setKey` / `getToggles`）。Web 模式 `server/index.ts` 加 `GET /api/settings/model`、`PUT /api/settings/key`（local 层的写入桌面/web 都可，但与演进路径"Web 只读"约定一致——Web 模式 `setKey` 可返回 405 或仅放开非破坏性读取，本 spec 默认 Web 只暴露 `getModel`/`getToggles`）。

### 5. 前端（`src/pages/Settings.tsx`，当前是占位 `:8`）

Settings 页重写成多 Tab 容器（后续 spec010/011 往里塞子面板），本 spec 提供两块：

**A. 分层 settings 总览（`/config` 视角）**
- 表格列：`key` / `有效值` / `来源层 Badge`（user 绿 / project 蓝 / local 橙）/ `被覆盖层`（灰显标注）。
- 每行可"编辑"：点开弹出 `key=value` 编辑器——目标层 Select（user/project/local）+ value 输入（JSON 文本，校验可 parse）+ 删除按钮（unset）。保存调 `settings.setKey`。
- 顶部一个"原始 key=value 输入框"：输入 `worktree.baseRef=main` 形式，选层，回车写入（等价 `/config`）。

**B. 安全开关说明卡（PERM-07）**
- `disableBundledSkills`：Switch（读 effective，可写 user 层）+ 说明"隐藏内置 skill（2.1.169）"。
- `--safe-mode`：只读说明卡"启动 flag，禁所有定制排障；工具不可代启动，需 `claude --safe-mode`"。
- `/cd`：只读说明卡"不断缓存换工作目录的 CLI 命令"。

## 实现步骤

- [ ] 1. `shared/types/settings.ts`：`SettingsLevel` / `SettingsLayer` / `SettingsModel` / `EffectiveSetting` / `SafetyToggles`，`index.ts` 导出。
- [ ] 2. `electron/services/settings-writer.ts`：`getByPath` / `setByPath` / `unsetByPath` + `SettingsWriter`（`readLayer` / `writeKey` / `writeKeys` / `getModel`），原子写。
- [ ] 3. `file-manager.ts`：`settingsLayerPaths()`、持有 `settingsWriter`、`getSettingsModel()` / `setSettingKey()` / `getSafetyToggles()`；`writeJSONFile` 上方加禁用注释。
- [ ] 4. `file-manager.ts`：把**所有** settings 写入收口到 `settingsWriter`——`saveHookToSettings`（hooks，spec007）+ `savePermissionRule`/`deletePermissionRule`（permissions，spec008）都改走 `writeKey`；`getHooks` 那个三层数组里 local 行的 `location:'project'` 改成 `'local'`。回归测试 hooks 与 permissions 读写均不丢字段。
- [ ] 4b. `provider-manager.ts:218` 迁移列入跟进（风险登记）：要么也走 `settingsWriter`，要么所有写 `~/.claude/settings.json` 的路径共用一把进程内串行队列（mutex），消除并发 lost-update。
- [ ] 5. `electron/ipc/settings.ts` + `index.ts` 注册；`api.ts` + preload `settings` 命名空间。
- [ ] 6. `src/pages/Settings.tsx`：重写为 Tab 容器 + 分层 settings 总览表 + `key=value` 编辑器 + 安全开关说明卡。
- [ ] 7. 单测：`setByPath`/`unsetByPath`/`getByPath` 对深路径、缺失中间对象、删 key 的行为；`writeKey` 保留未知字段（写 `model` 不动 `enabledPlugins`）。
- [ ] 8. i18n。

## 验收标准

- [ ] 单测：`setByPath({a:{b:1},x:2}, 'a.c', 3)` 得 `{a:{b:1,c:3},x:2}`（不动 `x`、`a.b`）；`unsetByPath` 删叶子保留兄弟；`getByPath` 取深路径与缺失路径（返回 undefined）。
- [ ] 在含 `statusLine`/`enabledPlugins`/`tui` 等真实 key 的 `~/.claude/settings.json` 上，通过工具写 `model=claude-opus-4-...` 后，**re-read 这些原有 key 全部完好**（diff 仅多出 `model`）。
- [ ] 写一个不存在的 settings 文件（local 层）后，文件被创建且只含写入的 key；中间目录 `.claude/` 自动创建。
- [ ] `getModel()` 对三层都定义 `model` 时，`effective` 里 `model` 的 `source` 为 `local`，`overriddenLevels` 含 `['project','user']`。
- [ ] settings.json 内容是非法 JSON 时 `writeKey` 抛错（不静默覆盖坏文件）；`readLayer` 返回 `parseError` 而非崩溃。
- [ ] hooks 经迁移后的 `saveHookToSettings` 写回，settings.json 其他顶层 key 不丢（hooks 回归通过）。
- [ ] **permissions 经迁移后的 `savePermissionRule` 写回，settings.json 其他顶层 key（hooks/enabledPlugins 等）不丢**——证明 spec008 不再是游离的第 4 套写入。
- [ ] 全仓 grep 确认：除 `settingsWriter` 外，**没有任何代码**对 `settings.json`/`settings.local.json` 直接 `fs.writeFile`（provider-manager 若暂未迁，需在风险/跟进项中显式登记，不算违反）。
- [ ] local 层：在 `<cwd>/.claude/settings.local.json` 写一个 key 后，`getModel()` 的 `effective` 里该 key 的 `source` 为 `local`（而非被误标的 `project`）。
- [ ] Settings 页能显示三层来源染色表、能用 `key=value` 框写入并即时刷新、`disableBundledSkills` Switch 可读可写、safe-mode 卡为只读说明。
- [ ] 原子写：写入过程被中断不产生半截文件（仅 `.tmp` 残留，目标文件保持旧内容）。

## 风险与备注

- **点号路径 vs 含点 key**：极少数 settings key 名本身可能含 `.`。本 spec 的点号路径解析对常见两层 key（`permissions.allow`、`worktree.baseRef`）足够；若遇到 key 名含点的情况，`setKey` 额外支持传 `keyPath: string[]`（数组形式绕过分割）作为逃生口。
- **数组值合并**：`effective` 对数组类型 key（如 `permissions.allow`）按"整层覆盖"语义展示，不做数组逐项 union——逐项合并语义由 spec008 权限层自己处理，本 spec 只做 key 级覆盖视图，避免与 spec008 重复造合并逻辑。
- **格式保留**：JSON 无注释，`JSON.stringify(.,2)` 重序列化会丢用户自定义缩进/key 顺序。这是可接受损失（与现有 `saveHookToSettings:728` 行为一致）。若用户在意顺序，留备注：后续可换 `detect-indent` + 保序写库，非本 spec 范围。
- **Web 模式写入**：演进路径定"Web 保持只读浏览角色"。本 spec 默认 Web 只暴露 `getModel`/`getToggles`，`setKey` 走桌面端 IPC；如确需 Web 写 local 层，单独评审。
- 与 spec007（Hooks）、spec008（权限）、spec010（模型）、spec011（worktree）、spec013（MCP 部分字段）**共用** `SettingsWriter`——它们的"保存"动作统一调 `settings.setKey` / `writeKey`，不得新起 read-modify-write，否则字段丢失风险回归。spec007/008 写定在前，需各自回填一句依赖声明（本次已在那两个 spec 末尾补上）。
- **并发 lost-update（与 provider-manager）**：`SettingsWriter.writeKey` 是 read-(全量)-modify-(局部)-write-(全量)，与 `provider-manager.ts:218`（也全量读写同一 `~/.claude/settings.json`）若并发，原子 rename 只保证单次写不出半截文件，**保证不了两路串行**——后落盘者会用旧快照覆盖先落盘者的改动。"UI 上避免同时触发"约束不住（provider 切换、chokidar 回调都可能异步触发）。缓解：要么 provider-manager 迁到 `SettingsWriter`，要么对同一文件路径加进程内串行队列（mutex）。本 spec 在实现步骤 4b 登记为跟进项。
- `--safe-mode` 与 `/cd` 是运行时 CLI flag/命令，不落 settings，工具**不能**也不应该试图在 settings 里"打开"它们——UI 必须是只读说明，避免误导用户以为勾一下就生效。
