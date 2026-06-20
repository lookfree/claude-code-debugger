# spec006 · Commands 三层来源模型

- 对应功能 ID：SKILL-02 / SKILL-04（Commands 侧）
- 所属 Phase：P1
- 前置依赖：spec003（扫描路径配置化）、spec004（`InstalledPlugins`、`readInstalledPlugins/readEnabledPlugins`、`SourceBadge` 组件）
- 工作量估计：M

## 目标

把 Commands 的扫描重写成 **user / project / plugin 三层来源模型**，与 spec004 对齐，但针对 commands 的目录形态：**命令是单文件 `commands/*.md`**（plugin 也是 `commands/*.md`），不是 skill 那样的 `*/SKILL.md` 目录。扩 `SlashCommand` 类型加 source / plugin 元信息 / 覆盖标记。前端 Commands 页加 source 列染色 + 覆盖提醒。

三层目录：

- user：`~/.claude/commands/*.md`
- project：`<cwd>/.claude/commands/*.md`
- plugin：`<installPath>/commands/*.md`（`installPath` 来自 `installed_plugins.json`，见 spec004）

> 注意命令名 = 文件名去 `.md`（如 `commands/brainstorm.md` → `/brainstorm`），plugin 命令实际调用时带 plugin 前缀（如 `superpowers:brainstorm`），见"备注"。

## 现状（引用真实 file:line）

- `electron/services/file-manager.ts:891` `getCommands()`：
  - `:897`-`:920` 扫 project `<cwd>/.claude/commands/`，但用的是 **`<dir>/<dir>.md` 子目录约定**（`path.join(cmdDir, `${dir}.md`)`，`:905`）——这与真实 plugin 结构 `commands/*.md`（平铺单文件，如本机 `superpowers/5.0.7/commands/brainstorm.md`）**不一致**，会漏扫平铺文件。
  - `:922`-`:946` 扫 user `~/.claude/commands/`，同样的子目录约定。
  - 完全没扫 plugin commands。
- `electron/services/file-manager.ts:952` `parseCommandMarkdown(filePath, content, location: 'user' | 'project')`——`:972` `commandName = path.basename(path.dirname(filePath))`（取父目录名，对应子目录约定），平铺文件下会取错名；`location` 只两值。
- `shared/types/command.ts:35` `location?: 'user' | 'project'`——无 source/marketplace/pluginName/version/overriddenBy；`scope: 'global' | 'project'`（`:2`）。
- `src/pages/Commands.tsx:219`-`:220` 按 `cmd.location` 分 user/project 两组；`:312` 列表项 Badge 只认 user/project；无 plugin、无 source 过滤、无覆盖提醒。

## 改动方案

### 1. 类型 diff（`shared/types/command.ts`）

```diff
 export interface SlashCommand {
   name: string
   description: string
   usage: string
   type: CommandType
   pattern: string
   arguments?: CommandArgument[]
   handler: CommandHandler
   instructions?: string
   rawContent?: string
   aliases?: string[]
   scope: CommandScope
   enabled: boolean
   filePath?: string
-  location?: 'user' | 'project'
+  /** @deprecated 用 source。plugin→'user' 兼容映射 */
+  location?: 'user' | 'project'
+  source?: 'user' | 'project' | 'plugin'
+  marketplace?: string         // 仅 plugin
+  pluginName?: string          // 仅 plugin
+  version?: string             // 仅 plugin
+  pluginScope?: 'user' | 'project'  // 仅 plugin
+  overriddenBy?: string        // 被同名更高优先级来源覆盖时，记覆盖者 uid
+  /** 实际调用名：plugin 命令为 `${pluginName}:${name}`，否则 = name */
+  invokeName?: string
   disallowedTools?: string[]   // 见 spec008（disallowed-tools frontmatter），此处先占位
 }
```

`disallowedTools` 字段由 spec008 正式定义解析，这里仅声明，便于类型不冲突。

### 2. 后端 FileManager（`electron/services/file-manager.ts`）

复用 spec004 的 `readInstalledPlugins()` / `readEnabledPlugins()` / `computeSkillUid`（commands 版叫 `computeCommandUid`，同构）。

重写 `getCommands()`：

```ts
async getCommands(): Promise<SlashCommand[]> {
  const out: SlashCommand[] = []
  const installed = await this.readInstalledPlugins()
  const enabled = await this.readEnabledPlugins()

  await this.scanCommandDir(path.join(this.userConfigPath, 'commands'),
    { source: 'user' }, out)
  await this.scanCommandDir(path.join(this.projectPath, '.claude', 'commands'),
    { source: 'project' }, out)

  for (const [key, entries] of Object.entries(installed)) {
    const [pluginName, marketplace] = key.split('@')
    if (enabled[key] === false) continue
    for (const e of entries) {
      await this.scanCommandDir(path.join(e.installPath, 'commands'), {
        source: 'plugin', marketplace, pluginName,
        version: e.version, pluginScope: e.scope,
      }, out)
    }
  }

  // 覆盖检测：同 name，user > project > plugin（与 spec004 同规则）
  markOverrides(out)   // 复用 spec004 的覆盖工具，winner 不标，其余标 overriddenBy
  return out
}

// scanCommandDir：用 spec003 的递归 glob 或 readdir 扫 <dir>/**/*.md（commands 可有子目录分组，
// 子目录形成命名空间，如 commands/git/commit.md → /git:commit）。
//   对每个 .md 调 parseCommandMarkdown(filePath, content, opts)。
//   命令名 = 相对 <dir> 的路径去 .md，用 ':' 连子目录（Claude Code 命名空间约定）。
//   dir 不存在静默返回。
```

改 `parseCommandMarkdown`：

- 签名改为 `(filePath, content, opts: { source; marketplace?; pluginName?; version?; pluginScope?; commandName: string })`。
- 用传入的 `commandName`（由 scanCommandDir 按相对路径算好），**不再用 `path.basename(path.dirname(filePath))`**（`:972` 那行删掉）——修复平铺文件取错名的 bug。
- 写入 source/marketplace/pluginName/version/pluginScope。
- `invokeName = opts.source==='plugin' ? `${opts.pluginName}:${commandName}` : commandName`。
- `scope`：plugin/user → `'global'`，project → `'project'`（保留旧字段语义）。

### 3. IPC（`electron/ipc/commands.ts`）

`commands:getAll` 无需改签名，新字段随对象带出。无新增 handler。

### 4. 前端（`src/pages/Commands.tsx`）

- 复用 spec004 的 `SourceBadge`。
- 把 `:219`-`:220` 的 user/project 两组改为按 source 三组（或扁平列表 + source 过滤 Select），plugin 组显示 `pluginName@version`。
- 列表项（`:290`-`:319`）：source 染色 Badge；`overriddenBy` 行灰显 + line-through + 橙色"被覆盖"Badge。
- 详情面板（`:353` 附近）：plugin 来源显示 marketplace/pluginName/version/pluginScope/invokeName；被覆盖时提示条。
- 新建/编辑表单（`editForm`，`:42`-`:48`）：source 仍只允许 user/project（plugin 命令只读，不允许在工具内编辑 plugin 自带命令——给只读标记禁用编辑/删除按钮）。

## 实现步骤

- [ ] 1. `shared/types/command.ts`：按 diff 加 source/marketplace/pluginName/version/pluginScope/overriddenBy/invokeName（+ disallowedTools 占位）。
- [ ] 2. `file-manager.ts`：加 `scanCommandDir(dir, opts, out)`、`computeCommandUid`、复用 `markOverrides`。
- [ ] 3. 同文件：改 `parseCommandMarkdown` 签名与命令名来源；删 `:972` `basename(dirname)`。
- [ ] 4. 同文件：按伪代码重写 `getCommands()`，去掉 `<dir>/<dir>.md` 子目录约定，改扫 `*.md` / `**/*.md`。
- [ ] 5. `src/pages/Commands.tsx`：source 染色 + 覆盖提醒 + plugin 命令只读 + source 过滤/分组。
- [ ] 6. i18n：commands 页 source/overridden/invokeName 文案。

## 验收标准

- [ ] 本机 Commands 页能看到 superpowers 的 plugin 命令（brainstorm / write-plan / execute-plan 等，来自 `superpowers/.../commands/*.md`），各带 plugin Badge 与 `superpowers@版本`。
- [ ] plugin 命令的 `invokeName` 显示为 `superpowers:brainstorm` 形式。
- [ ] 在 `~/.claude/commands/` 放一个与某 plugin 命令同名的 `.md`：plugin 那条被标 overriddenBy 灰显，user 那条正常。
- [ ] 平铺 `commands/foo.md`（无同名子目录）能被正确扫出且命令名为 `foo`（验证 `:972` bug 已修）。
- [ ] 子目录 `commands/git/commit.md` 命令名为 `git:commit`。
- [ ] plugin 命令的编辑/删除按钮禁用（只读）。
- [ ] `installed_plugins.json` 缺失时 `getCommands()` 不抛错，仅返回 user/project 命令。

## 风险与备注

- 现状 `getCommands()` 的"`<dir>/<dir>.md` 子目录"约定不符合 Claude Code 实际（commands 是平铺 `.md`），这是个**真实 bug**，本 spec 顺手修掉——改完后旧的 `commands/foo/foo.md` 形态若仍想兼容，可在 scanCommandDir 里对"目录内同名 md"也兜底，但优先按平铺 `*.md` 标准走。
- plugin 命令命名空间：Claude Code 用 `plugin:command` 调用，子目录用 `:` 分隔。`invokeName` 字段承载这层，`name` 仍保留纯命令名供展示/搜索。
- 覆盖规则与 spec004 完全一致（user>project>plugin），实现时抽 `markOverrides(items, getName, getSource, computeUid)` 泛型工具，skills/commands 共用。
- `disallowedTools` 的 frontmatter 解析归 spec008，本 spec 只占类型位，不实现解析。
```