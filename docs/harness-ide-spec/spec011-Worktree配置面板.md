# spec011 · Worktree 配置面板

- 对应功能 ID：MISC-03
- 所属 Phase：P1
- 前置依赖：spec009（统一 settings 写入层 `SettingsWriter`）
- 工作量估计：S

## 目标

在 Settings 加一个 **Worktree 子面板**，可视化读写 settings.json 的 `worktree.*` 配置——`worktree.baseRef`（worktree 基准 ref，2.1.133）、`worktree.bgIsolation`（后台会话隔离模式，2.1.143）。让用户不用记 `/config worktree.bgIsolation=none` 这种命令，在 UI 里点选即可。

`--worktree` 隔离模式本身（2.1.49）是 CLI 启动 flag，工具不代启动会话；本 spec 只管它的**落盘配置项**（`worktree.baseRef` / `worktree.bgIsolation`）。

settings.json `worktree` 字段真实形态：

```json
{
  "worktree": {
    "baseRef": "main",
    "bgIsolation": "none"
  }
}
```

`bgIsolation` 取值（按 changelog 2.1.143 后台隔离语义）：`"none"`（不隔离，后台会话共享工作区） / `"worktree"`（每个后台会话独立 worktree 隔离）。落地时以官方枚举为准，UI 用下拉。

## 现状（引用真实 file:line）

- `src/pages/Settings.tsx:1`-`:13` 整页是占位（`coming soon`）。无任何 worktree 相关 UI。
- `electron/services/file-manager.ts` 全文无 `worktree` 字符串、无相关读取。
- 本机 `~/.claude/settings.json` 实测无 `worktree` key——本 spec 写入是**新增 key**，靠 spec009 `SettingsWriter` 保证不破坏 `enabledPlugins`/`tui` 等既有字段。

## 改动方案

### 1. 数据结构（新增 `shared/types/worktree.ts`，`index.ts` 导出）

```ts
/** 后台会话隔离模式（2.1.143）；以官方枚举为准 */
export type WorktreeBgIsolation = 'none' | 'worktree'

export interface WorktreeConfig {
  /** worktree 基准 ref，如 'main' / 'origin/main'（2.1.133） */
  baseRef?: string
  /** 后台会话隔离模式（2.1.143） */
  bgIsolation?: WorktreeBgIsolation
  /** 每个字段来源层（来自 spec009 effective），UI 染色 */
  sources?: Partial<Record<keyof Omit<WorktreeConfig, 'sources'>, 'user' | 'project' | 'local'>>
}

/** bgIsolation 选项的展示元数据（驱动下拉 + 说明） */
export const BG_ISOLATION_OPTIONS: Array<{ value: WorktreeBgIsolation; label: string; hint: string }> = [
  { value: 'none',     label: '不隔离', hint: '后台会话共享当前工作区' },
  { value: 'worktree', label: 'worktree 隔离', hint: '每个后台会话独立 git worktree' },
]
```

### 2. 后端 FileManager（`electron/services/file-manager.ts`）

复用 spec009，不另起读取：

```ts
async getWorktreeConfig(): Promise<WorktreeConfig> {
  const model = await this.getSettingsModel()                 // spec009
  const baseRef     = model.effective.find(e => e.key === 'worktree.baseRef')
  const bgIsolation = model.effective.find(e => e.key === 'worktree.bgIsolation')
  return {
    baseRef: baseRef?.value as string | undefined,
    bgIsolation: bgIsolation?.value as WorktreeBgIsolation | undefined,
    sources: {
      ...(baseRef     && { baseRef: baseRef.source }),
      ...(bgIsolation && { bgIsolation: bgIsolation.source }),
    },
  }
}

async setWorktreeKey(
  level: 'user'|'project'|'local',
  key: 'baseRef'|'bgIsolation', value: string | undefined
): Promise<void> {
  // 点号路径写入，走 spec009；value===undefined 时 unset
  await this.setSettingKey(level, `worktree.${key}`, value)   // spec009
}
```

> 注意：spec009 的 `getModel()` 需保证 `worktree.baseRef` / `worktree.bgIsolation` 这类**两层嵌套 key** 出现在 `effective` 里（spec009 已约定"顶层 + 一层嵌套"）。

### 3. IPC（并入现有 settings handler 文件 `electron/ipc/settings.ts`）

```ts
ipcMain.handle('settings:getWorktree', () => fileManager.getWorktreeConfig())
ipcMain.handle('settings:setWorktreeKey',
  (_e, level, key, value) => fileManager.setWorktreeKey(level, key, value))
```

`api.ts` + preload 暴露 `settings.getWorktree` / `settings.setWorktreeKey`。

### 4. 前端（`src/pages/Settings.tsx` 的一个 Tab/卡片）

在 spec009 重写后的 Settings Tab 容器里加 **Worktree** 卡：

- `baseRef`：Input（placeholder `main`）+ 来源层 Badge。失焦保存。
- `bgIsolation`：Select（选项来自 `BG_ISOLATION_OPTIONS`，每项带 hint 副文案）+ 来源层 Badge。
- 目标层选择：卡片顶部一个 user/project/local Select（默认 project，worktree 多是项目级配置），决定写入哪层。
- 一段只读说明："`--worktree` 启动隔离是 CLI flag，此处仅配置 baseRef/bgIsolation 落盘项（2.1.133/2.1.143）。"

## 实现步骤

- [ ] 1. `shared/types/worktree.ts`：`WorktreeConfig` / `WorktreeBgIsolation` / `BG_ISOLATION_OPTIONS`，`index.ts` 导出。
- [ ] 2. `file-manager.ts`：`getWorktreeConfig()`（基于 spec009 `getSettingsModel`）、`setWorktreeKey()`（走 `setSettingKey('worktree.x')`）。
- [ ] 3. `electron/ipc/settings.ts`：加 2 个 worktree handler；`api.ts` + preload 暴露。
- [ ] 4. `src/pages/Settings.tsx`：Worktree 卡（baseRef Input + bgIsolation Select + 目标层 Select + 说明）。
- [ ] 5. i18n：worktree / baseRef / bgIsolation / 各选项 hint 文案。

## 验收标准

- [ ] Worktree 卡能读出 settings.json 现有 `worktree.baseRef`/`worktree.bgIsolation`；本机（无该 key）显示空状态、不报错。
- [ ] 在 baseRef 填 `main`、bgIsolation 选 `worktree`、目标层选 project，保存后 `<cwd>/.claude/settings.json` 写出 `{"worktree":{"baseRef":"main","bgIsolation":"worktree"}}`，且该文件原有其他 key 完好。
- [ ] 只改 bgIsolation 不动 baseRef：再次保存后 `worktree.baseRef` 保留（read-modify-write 不丢同级 key，依赖 spec009 `setByPath`）。
- [ ] 清空 baseRef（设 undefined）→ `worktree.baseRef` 被 unset，`worktree.bgIsolation` 仍在。
- [ ] 三层都定义 `worktree.bgIsolation` 时，UI 来源层 Badge 显示 local（最高优先级胜，依赖 spec009 effective）。
- [ ] `bgIsolation` 下拉只可选 `BG_ISOLATION_OPTIONS` 内的值，每项显示 hint。

## 风险与备注

- `bgIsolation` 的官方枚举可能不止 `none`/`worktree` 两值（changelog 仅明确 "none" 等）。`BG_ISOLATION_OPTIONS` 是可扩展常量，落地时对官方 `/config worktree.bgIsolation --help` 补全，类型 union 同步加值即可，UI 不动。
- worktree 配置多为**项目级**语义（不同 repo 不同 baseRef），UI 默认目标层 project；但 settings 三层都允许，保留层选择。
- 本 spec 极薄（仅 2 个字段），独立成 spec 是为对齐功能 ID MISC-03 与保持一图一档；与 spec010 一样完全复用 spec009 写入层，不引入新写入路径。
- `--worktree` 启动隔离、`/cd` 换目录等运行时行为不在本 spec——只配置落盘项，运行时观测（哪些会话在哪个 worktree）属 Phase 2。
