# spec021 · 记忆面板与 dream 可视化

- 对应功能 ID：ORCH-10 / MISC-07 / MISC-08
- 所属 Phase：P2
- 前置依赖：spec014（解析层，dream 触发探测）
- 工作量估计：M

## 目标

两件事：① **记忆面板**——浏览 Auto Memory（MISC-07）写的 `MEMORY.md` + topic 文件，按项目隔离呈现；② **dream 可视化**（ORCH-10）——dream/AutoDream 跑完后，把"固化前 vs 固化后"做成 diff（哪些重复被合并、哪些过期被删、哪些矛盾被解决、浮现哪些新模式）。dream 是 Research Preview、黑盒、未定型——谁能照亮"前后对比"谁就帮用户建立信任。dream 部分**诚实标注未定型、需探测**。

## 现状（引用真实 file:line / 真实磁盘事实）

- **项目无记忆/dream 任何覆盖**。
- **Auto Memory 数据源已核实存在**（本机实测，每个项目一个 memory 目录）：
  - 路径：`~/.claude/projects/<encoded-cwd>/memory/`，内含 `MEMORY.md`（索引）+ 若干 topic 文件（如 `feedback_keep_helper_scripts.md`、`feedback_no_confirmations.md`）。
  - `MEMORY.md` 实测是**链接索引**：每行 `- [标题](topic_file.md) — 摘要`（本机 bpm 项目 MEMORY.md 实测两条 feedback 链接 + 摘要）。
  - 本机 7 个项目有 memory 目录（agenes-core / feature-2026-06 / tailsync / feature-agents / superchat / rollax / bpm）。
  - 按项目（encoded-cwd）隔离——与演进路径"Auto Memory 按 git repo 根隔离"一致。
- **dream 数据源未核实**：`~/.claude` 下 `grep -i dream` 无文件；dream 是 Research Preview，未进主 changelog，本机无 dream 产物。**dream 的固化前/后快照如何落盘完全未知——本 spec 给探测方案，不假设。**

## 改动方案

### 1. 记忆类型（新增 `shared/types/memory.ts`）

```ts
export interface MemoryStore {
  cwd: string                   // 真实项目路径
  encodedCwd: string
  dir: string                   // memory 目录绝对路径
  index: MemoryIndexEntry[]     // 解析 MEMORY.md 的链接索引
  topics: MemoryTopic[]
  lastModifiedAt: string
}
export interface MemoryIndexEntry {
  title: string
  file: string                  // topic 文件名
  summary?: string              // ' — ' 后的摘要
}
export interface MemoryTopic {
  file: string
  title?: string                // topic md 首个 # 标题或 index 标题
  content: string               // 完整 markdown
  sizeBytes: number
  modifiedAt: string
  /** 是否在 MEMORY.md 索引里被引用（孤儿 topic 检测） */
  referenced: boolean
}

/** dream 固化前后对比（结构待 dream 落盘格式坐实，先按通用 diff 设计） */
export interface DreamRun {
  id: string
  ranAt: string
  cwd: string
  /** 固化前后的记忆快照（来源依探测确定） */
  before?: MemorySnapshot
  after?: MemorySnapshot
  changes: DreamChange[]
  status: 'unknown' | 'detected' | 'reconstructed'  // 数据可信度
}
export interface MemorySnapshot { files: Array<{ file: string; content: string }> }
export interface DreamChange {
  type: 'merged' | 'deleted' | 'added' | 'resolved-conflict' | 'modified'
  file: string
  detail: string
  beforeText?: string
  afterText?: string
}
```

### 2. 后端：记忆读取（新增 `electron/services/memory/memory-reader.ts`）

```ts
/** 列出所有项目的 memory store（扫 ~/.claude/projects/*/memory/） */
export async function listMemoryStores(): Promise<MemoryStore[]>
/** 读单个项目的 memory（解析 MEMORY.md 索引 + 全部 topic 文件） */
export async function readMemoryStore(encodedCwd: string): Promise<MemoryStore | null>
```

解析：
- `MEMORY.md` 按行正则 `^- \[(.+?)\]\((.+?)\)(?:\s*—\s*(.+))?$` 抽 `title/file/summary`。
- 扫 memory 目录所有 `*.md`（除 MEMORY.md）为 topic，`referenced` = 是否在 index 里。
- `cwd` 用 spec014 的 `decodeCwd` 占位，若该项目有 session 则用行内 cwd 校正。

### 3. 后端：dream 探测 + diff（新增 `electron/services/memory/dream-tracker.ts`）

dream 落盘未知，分两条路走：

**A. 主动快照 diff（可控、不依赖 dream 内部）**：
本工具自己在 dream 前后给 memory 目录拍快照对比——
```ts
/** 给某项目 memory 目录拍快照存到本工具自己的存储（不依赖 dream） */
export async function snapshotMemory(encodedCwd: string): Promise<MemorySnapshot>
/** 对比两个快照产出 DreamChange[]（按文件 + 文本 diff 推断 merged/deleted/added） */
export function diffMemory(before: MemorySnapshot, after: MemorySnapshot): DreamChange[]
```
用户在跑 `/dream` 前点"记录当前记忆"→跑 dream→点"对比"，本工具用自存快照算 diff。**这条不依赖 dream 任何内部契约，一定能用。**

**B. dream 产物探测（增强，需坐实）**：
探测 dream 是否落盘 before/after：
- 监控 `/dream` 期间 memory 目录与 `~/.claude` 的文件变化（chokidar）。
- 查 dream 是否在 memory 目录留备份（如 `.memory-backup/` 或带时间戳的旧文件）。
- 查 jsonl 是否有 dream 触发/结果事件（spec014 扫 `/dream` user_turn + 后续 system 事件）。
坐实后填 `DreamRun.before/after`，`status='detected'`；未坐实则只用 A 路径，`status='reconstructed'`。

### 4. IPC（新增 `electron/ipc/memory.ts`，在 `index.ts` 注册）

```ts
ipcMain.handle('memory:list', () => listMemoryStores())
ipcMain.handle('memory:read', (_e, encodedCwd) => readMemoryStore(encodedCwd))
ipcMain.handle('memory:snapshot', (_e, encodedCwd) => snapshotMemory(encodedCwd))
ipcMain.handle('memory:dreamDiff', (_e, beforeId, afterId) => /* 取两快照 diff */)
```

preload + `src/lib/api.ts` 加 `memory` 命名空间。Web 模式：`memory:list`/`read` 只读可支持（`GET /api/memory`），snapshot/dreamDiff 桌面端独占。

### 5. 前端面板（新增 `src/pages/Memory.tsx`）

- **项目选择**：左侧列有 memory 的项目（7 个），选一个。
- **记忆视图**：上方 MEMORY.md 渲染（索引 + 摘要，点链接跳 topic）；下方 topic 列表/卡片，点开渲染 markdown。孤儿 topic（未被索引）标记。
- **dream 工作流区**：
  - "记录当前记忆"按钮（snapshotMemory）→ 列出已存快照（时间戳）。
  - 选两个快照（或一个快照 vs 当前）→ "对比"→ 显示 `DreamChange[]`：merged/deleted/added/resolved-conflict 分组，文本 diff（红绿）。
  - 若 dream 产物探测坐实，自动列出检测到的 DreamRun，标 `status`。
- 诚实标注：dream 区顶部 banner "dream 是 Research Preview，固化内部不透明；此对比基于本工具记忆快照（或检测到的产物）"。

## 实现步骤

- [ ] 1. `shared/types/memory.ts`：`MemoryStore` / `MemoryTopic` / `DreamRun` / `DreamChange` / `MemorySnapshot`。
- [ ] 2. `electron/services/memory/memory-reader.ts`：`listMemoryStores` / `readMemoryStore`（解析 MEMORY.md 索引 + topic）。
- [ ] 3. `electron/services/memory/dream-tracker.ts`：`snapshotMemory` / `diffMemory`（A 路径）+ dream 产物探测（B 路径，监控变化）。
- [ ] 4. `electron/ipc/memory.ts`：4 个 handler；`index.ts` 注册。
- [ ] 5. preload + `src/lib/api.ts`：`memory` 命名空间；`server/index.ts` 加 `GET /api/memory`（只读）。
- [ ] 6. `src/pages/Memory.tsx`：项目选择 + 记忆视图 + dream 快照/对比 + 诚实 banner。
- [ ] 7. i18n + 路由 + 侧栏。

## 验收标准

- [ ] `memory:list` 返回本机 7 个有 memory 目录的项目。
- [ ] 选 bpm 项目，MEMORY.md 渲染出两条 feedback 链接 + 摘要，点链接能打开对应 topic（feedback_keep_helper_scripts.md 等）的 markdown。
- [ ] topic 卡片正确显示内容、大小、修改时间；未被 MEMORY.md 引用的 .md 标为孤儿。
- [ ] "记录当前记忆"在某项目存一个快照，再改 memory 目录一个文件，"对比"显示 modified 的文本 diff（红绿）。
- [ ] 构造 before/after（删一个 topic、合并两个、加一个），`diffMemory` 正确归类 deleted/merged/added。
- [ ] dream banner 明确标注 Research Preview + 数据可信度（status）。
- [ ] Web 模式 `GET /api/memory` 返回只读记忆列表。

## 风险与备注

- **dream 数据源完全未坐实**（本机无 dream 产物，`grep dream` 空）。本 spec 的可靠交付是 **A 路径（本工具自拍快照 diff）**——不依赖 dream 任何内部契约，一定能跑。B 路径（探测 dream 是否自己落 before/after）是增强，**坐实前不假装有**，UI 用 `status` 字段诚实标注数据来源与可信度。
- **MEMORY.md 格式可能变**：实测是链接索引格式，但 Auto Memory 仍在演进（演进路径标"2.1.38-2.1.49 持续演进"）。解析器对非链接行兜底（当纯文本展示），不因格式变化崩。
- **topic 文件无固定命名约定**：本机是 `feedback_*.md`，但 dream 重组后可能改名。靠扫目录所有 .md，不硬编码前缀。
- **MISC-08（Context Editing + Memory Tool）是 API 能力**（非 CLI 版本号），本地无对应文件，本 spec 不覆盖其 API 侧，只做本地 Auto Memory 文件的可视化；若未来 Memory Tool 在本地留痕再扩。
- **快照存储**：本工具自存快照放哪需定（建议 `app.getPath('userData')/memory-snapshots/`，不污染 `~/.claude`）。
- **隐私**：memory 含用户偏好/项目细节，面板纯本地读，不外传；dream banner 不附带任何上报。
