# spec003 · 扫描路径配置化地基

- 对应功能 ID：SKILL-01（地基部分）
- 所属 Phase：P0
- 前置依赖：建议在 spec002 之后（缺失降级统一后再抽函数更干净），但可并行
- 工作量估计：M（1-3 天）

## 目标

把 `getSkills` 里硬编码的 `anthropic-agent-skills` 路径下掉，换成**可配置的扫描根** + **递归 glob 工具函数**，让本机已装的 plugin（superpowers / last30days / rust-analyzer-lsp 等）能被扫到，并为 Phase 1（spec004 三层来源模型）打好地基——后续只需往配置里加来源根，不再改扫描逻辑。

这是 SKILL-01「cache 多源多版本目录结构」的**地基部分**：本 spec 只做「扫描层」（能扫到、带上 source/marketplace/plugin/version 元数据），三层来源的合并、覆盖检测、UI 染色留给 spec004。

## 现状

`getSkills`（file-manager.ts:187-251）把路径写死：

```ts
// file-manager.ts:192
const pluginSkillsPath = path.join(this.userConfigPath, 'plugins', 'marketplaces', 'anthropic-agent-skills')
// 第 195 行：非递归单层 readdir
const pluginDirs = await fs.readdir(pluginSkillsPath)
for (const dir of pluginDirs) {
  const skillMdPath = path.join(skillPath, 'SKILL.md')  // 只看一层：<root>/<dir>/SKILL.md
  ...
}
```

两个硬伤：

1. **路径写死且过时**——`plugins/marketplaces/anthropic-agent-skills` 在本机不存在。实测真实布局（`find ~/.claude/plugins/cache -name SKILL.md`）是：

   ```
   ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/<skill>/SKILL.md

   例：
   cache/claude-plugins-official/superpowers/6.0.3/skills/test-driven-development/SKILL.md
   cache/last30days-skill/last30days/3.3.2/skills/last30days/SKILL.md
   ```

   即任务给定的 glob `plugins/cache/*/*/*/skills/*/SKILL.md`，已核实匹配。

2. **扫描非递归**——只 `readdir` 一层、只认 `<root>/<dir>/SKILL.md`，扫不进 `<marketplace>/<plugin>/<version>/skills/<skill>/` 这种五段深的结构。

附带事实：cache 里同一 plugin 有多版本目录（superpowers 5.0.7 / 5.1.0 / 6.0.0 / 6.0.2 / 6.0.3 共 5 个）。但**已安装/登记的版本**记录在 `~/.claude/plugins/installed_plugins.json`（数组条目的 `scope`/`version`/`installPath`），本机只登记 2 个（5.0.7 project + 6.0.3 user）——cache 里另 3 个是废弃残留。**是否 enable** 则是另一个真相源 `settings.json` 的 `enabledPlugins`（plugin 级，spec005 消费）。本 spec 以 installed_plugins.json 为准只扫登记版本（实际落地见下），「同 plugin 多 scope 去重选当前版」交给 spec004，「enable 状态」交给 spec005。

## 改动方案

### 1. 数据结构：扩展 Skill 的来源元数据

`shared/types/skill.ts` 当前只有（第 46-47 行）：

```ts
filePath?: string
location?: 'user' | 'project'
```

`location` 表达力不足（区分不了 plugin 来源、marketplace、version）。新增一个**不破坏现有字段**的来源描述（追加，不替换 `location`，避免动现有 UI）：

```ts
// shared/types/skill.ts 追加
export type SkillSource = 'user' | 'project' | 'plugin'

export interface SkillOrigin {
  source: SkillSource           // 三层来源
  marketplace?: string          // plugin 来源时：marketplace 目录名，如 'claude-plugins-official'
  plugin?: string               // plugin 来源时：plugin 名，如 'superpowers'
  version?: string              // plugin 来源时：版本号，如 '6.0.3'
}

// 在 Skill 接口里追加（保留 location 兼容旧 UI）：
//   origin?: SkillOrigin
```

### 2. 扫描根配置：抽出可配置的来源根列表

在 FileManager 里新增一个集中定义的扫描根（替代第 192 行散落的硬编码），紧邻已有的 `ALLOWED_SCAN_ROOTS`（file-manager.ts:18-26）：

```ts
/** Skills 扫描来源根。Phase 0 先含 user + plugin cache 两类；spec004 会补 project 级。 */
private getSkillScanRoots(): Array<{ source: SkillSource; root: string; glob: string }> {
  return [
    // 1) plugin cache：<marketplace>/<plugin>/<version>/skills/<skill>/SKILL.md
    {
      source: 'plugin',
      root: path.join(this.userConfigPath, 'plugins', 'cache'),
      glob: '*/*/*/skills/*/SKILL.md',
    },
    // 2) user 级：<skill>/SKILL.md
    {
      source: 'user',
      root: path.join(this.userConfigPath, 'skills'),
      glob: '*/SKILL.md',
    },
    // spec004 在此追加 project 级：path.join(this.projectPath, '.claude', 'skills') + '*/SKILL.md'
  ]
}
```

> 设计意图：来源由「配置数组」驱动，扫描逻辑通用。Phase 1 加来源 = 往数组里加一行，不改扫描函数。

### 3. 工具函数：递归 glob

新增一个轻量 glob 工具——只支持本场景需要的 `*`（单层通配，不跨 `/`），避免引第三方 glob 库（项目无 glob 依赖，且无需 `**`）。放在 file-manager.ts 内作为私有方法（或抽到 `electron/services/glob-scan.ts` 以便 Phase 2 复用，推荐后者）。

**签名：**

```ts
/**
 * 在 root 下按由 '/' 分段的 glob 模式匹配文件，每段仅支持 '*'（单层通配，不跨目录分隔符）。
 * @param root    扫描根的绝对路径
 * @param pattern 形如 '*​/*​/*​/skills/*​/SKILL.md' 的相对模式
 * @param opts.maxDepth     最大目录深度护栏（默认 8）
 * @param opts.maxResults   最大命中数护栏（默认 2000）
 * @returns 命中文件的绝对路径数组；root 不存在时返回 []（不抛错）
 */
export async function globScan(
  root: string,
  pattern: string,
  opts?: { maxDepth?: number; maxResults?: number }
): Promise<string[]>
```

**实现要点：**

- 把 `pattern` 按 `/` 切成 segments，逐层递归：字面段直接 `path.join`，`*` 段 `readdir` 后对每个 entry 继续匹配剩余 segments；混合段（含 `*` 但非纯 `*`，如 `v*`）转成锚定正则 `^...$`（把 `*` 译为 `.*`，其余字符转义）匹配 entry 名。
- 命中条件：走完所有 segment 且最后一段对应一个**文件**（`stat.isFile()`）。
- **缺失即空**：任何一层 `readdir`/`stat` 抛 `ENOENT`/`ENOTDIR` 时静默跳过返回 `[]`（复用 spec002 的 `isMissing` 判定），不 `logger.error`。
- 护栏：超过 `maxDepth` 或累计命中 `>= maxResults` 即停（防符号链接环、超大目录），与现有 `MAX_SCAN_DEPTH`/`MAX_FILES_TO_SCAN`（file-manager.ts:15-16）同款思路。
- 跳过符号链接目录（`lstat().isSymbolicLink()` 则跳过），沿用 `scanForClaudeMD`（file-manager.ts:1259-1264）的安全做法。

### 4. 从 plugin cache 路径解析元数据

新增一个纯函数，把命中的 SKILL.md 绝对路径反解成 `SkillOrigin`：

```ts
/**
 * 从 plugin cache 命中路径解析 marketplace/plugin/version。
 * 输入 .../plugins/cache/<mp>/<plugin>/<ver>/skills/<skill>/SKILL.md
 * 返回 { marketplace, plugin, version }；不匹配时返回 {}。
 */
private parsePluginOrigin(skillMdPath: string): Pick<SkillOrigin, 'marketplace' | 'plugin' | 'version'>
```

实现：以 `path.sep + 'plugins' + path.sep + 'cache' + path.sep` 为锚点切出后缀，按段取 `[mp, plugin, version, 'skills', skill, 'SKILL.md']`。

### 5. 重写 `getSkills` 的 plugin/user 扫描段

把 file-manager.ts:191-236（plugin 硬编码段 + user 段）替换为遍历 `getSkillScanRoots()` 的统一循环：

```ts
async getSkills(): Promise<Skill[]> {
  const skills: Skill[] = []

  for (const { source, root, glob } of this.getSkillScanRoots()) {
    const hits = await globScan(root, glob, { maxDepth: 8, maxResults: 2000 })
    for (const skillMdPath of hits) {
      const skill = await this.parseSkillMD(skillMdPath, source === 'project' ? 'project' : 'user')
      if (!skill) continue
      const origin: SkillOrigin =
        source === 'plugin'
          ? { source, ...this.parsePluginOrigin(skillMdPath) }
          : { source }
      skills.push({ ...skill, origin })
    }
  }

  // project 级 JSON 格式 skills（file-manager.ts:238-248）保持不变，原样保留
  ...
  return skills
}
```

> `parseSkillMD` 第二参当前签名是 `'user' | 'project'`（file-manager.ts:253）。为不扩签名，plugin/user 都先传 `'user'`，真正的三层 source 走新的 `origin.source` 字段。spec004 再统一收口 `location` 与 `origin`。

### 6. 缓存与 watcher 不动

- `skillCache`（file-manager.ts:46）按 `filePath` 缓存，路径变了仍正确命中，无需改。
- chokidar watcher（file-manager.ts:97-130）目前 watch `~/.claude` 整棵树，已覆盖 `plugins/cache/`，无需改（但注意第 108 行 `ignored: /(^|[/\\])\../` 会忽略 cache 里的 `.in_use`/`.claude-plugin` 等 dotfile，对 SKILL.md 扫描无影响）。

## 实际落地（实现后修订 —— 两处偏离原文，已与你确认）

经确认采用 **installed_plugins.json 数据源**（而非原文 glob 整个 cache），并把来源字段做成**扁平字段**（对齐 spec004 已写的去重代码），实现反而更简单：

1. **plugin 扫描源 = `installed_plugins.json`**（不盲扫 cache）：本机 cache 有 superpowers 5 个版本目录，但 installed_plugins.json 只登记 2 个（5.0.7 project + 6.0.3 user），盲扫会把 3 个废弃版本也列出。读 installed_plugins.json 天然只拿激活版本 → Skills 页干净。**省掉了原文的 `parsePluginOrigin`**（marketplace/plugin/version 直接来自 installed_plugins.json 条目，不必反解路径）。
2. **来源字段用扁平形态**：`Skill` 上加 `source/marketplace/pluginName/version/pluginScope/overriddenBy`（不是原文的嵌套 `origin: SkillOrigin`）——因为 spec004 的去重代码（rankTuple）引用的是 `s.source`/`s.pluginScope`/`s.version` 扁平字段，对齐后零返工。新增 `InstalledPluginEntry` 类型（spec004/005/006 共用）。
3. `globScan` 仍建并使用：plugin 层 glob `<installPath>/skills/*/SKILL.md`、user 层 glob `~/.claude/skills/*/SKILL.md`；它是可复用工具（Phase 2 也用）。

> 仍存在「同名 skill × 2 条」（superpowers 5.0.7 + 6.0.3 都登记）——这是激活版本的真实状态，去重（按 user-scope + 高版本选 winner）是 spec004 的 rankTuple 职责。前端已给 plugin 加 `pluginName@version` 标签区分。

## 实现步骤

1. [x] `shared/types/skill.ts`：加 `SkillSource`、扁平来源字段（`source/marketplace/pluginName/version/pluginScope/overriddenBy`）、`InstalledPluginEntry`。
2. [x] 新建 `electron/services/glob-scan.ts`，实现并导出 `globScan`（缺失静默、符号链接跳过、深度/数量护栏）。
3. [x] file-manager.ts：加 `readInstalledPlugins()`（解析 installed_plugins.json）。`parsePluginOrigin` 不需要了。
4. [x] file-manager.ts：重写 `getSkills`——plugin 走 installed_plugins.json + globScan、user 走 globScan、project JSON 段保留。
5. [x] 删除硬编码的 `anthropic-agent-skills` 路径与单层 readdir 逻辑（全文已无该字样）。
6. [x] `src/pages/Skills.tsx`：badge 改读 `source`（回退 `location`），plugin 加 `pluginName@version` 标签；list key 改复合 key 消除多版本同名的 React 重复 key 警告。
7. [x] tsx 手测脚本对本机 `~/.claude` 跑 `getSkills`/`globScan`，断言命中数、origin、激活版本、缺失返回 []。

## 验收标准

> 验证：tsx 驱动真实 `~/.claude` + app 实跑。`getSkills` 返回 **31**（原为 0），plugin 29 / user 2，全过。

- [x] 删掉所有 `anthropic-agent-skills` 字样后，app 打开 Skills 页**能看到** superpowers 子 skills（brainstorming/executing-plans 等 28 条）、last30days（1）；rust-analyzer-lsp 无 skills 目录故 0 条（正确）。app 日志 `getSkills() returning 31 skills`、`preload exists: true`、无崩溃。
- [x] plugin skill 来源字段正确：`{ source:'plugin', marketplace:'claude-plugins-official', pluginName:'superpowers', version:'6.0.3', pluginScope:'user' }`。
- [x] superpowers 只出现**激活的 2 个版本**（5.0.7 + 6.0.3），不是 cache 里的 5 个（installed_plugins.json 数据源的效果）；version 字段正确。
- [x] `globScan('/不存在的路径', '*/SKILL.md')` 返回 `[]`，不抛错、不打 ERROR。
- [x] `globScan(<6.0.3>/skills, '*/SKILL.md')` 命中 14，与 `find` 计数一致（14）。
- [x] user 级 `~/.claude/skills/*/SKILL.md` 仍被扫到（2 条），`source==='user'`。

## 风险与备注

- 自研 `globScan` 只支持单层 `*`，不支持 `**`——对本场景（固定深度的 cache 结构）足够；若 Phase 1/2 需要任意深度递归，再扩。刻意不引第三方 glob 库以保持依赖精简。
- plugin cache 里同一 plugin 多版本会让 Skills 列表出现「同名 skill × N 版本」。本 spec **不**做去重（那是 spec005 的「当前 enable 版本」职责），但 UI 若不染色会显得重复——可在步骤 6 临时按 `plugin@version` 分组或加 version 标签缓解。
- `installed_plugins.json` 的 `scope`(user/project) 与 `installPath` 是 spec005 判定「当前启用版本」的数据源，本 spec 已确认其结构，先不消费。
- 本 spec 完成后，spec002 中针对插件扫描 catch 的临时 `isMissing` 守卫可被 `globScan` 内统一的缺失处理取代，届时清理。
