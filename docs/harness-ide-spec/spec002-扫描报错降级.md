# spec002 · 扫描报错降级

- 对应功能 ID：项目自身 bug（无功能 ID）
- 所属 Phase：P0
- 前置依赖：无（与 spec001 可并行）
- 工作量估计：S（<1 天）

## 目标

让 FileManager 在遇到「配置文件 / 目录本就不存在」（`ENOENT`）时**静默返回空**，不再用 `logger.error` 刷屏。当前一台没建 `claude_mcp_config.json` 的机器，每次刷新都打一片红色 ERROR，把真正的错误（权限、JSON 解析失败、磁盘错误）淹没了。原则：**「文件不存在」是正常状态，不是错误；只有真错误（`EACCES`、`EISDIR`、JSON 解析失败、其它非 ENOENT）才 `logger.error`。**

## 现状

报错刷屏的根因是 `readJSONFile` 把所有失败都当 error 打，而它被多个「文件可能不存在」的入口调用。

### 1. `readJSONFile`（核心，file-manager.ts:156-164）

```ts
private async readJSONFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch (error) {
    this.logger.error(`Error reading JSON file ${filePath}:`, error)  // ← 第 161 行：ENOENT 也走这里
    return null
  }
}
```

调用它、且目标文件**经常不存在**的入口：

- `getMCPServers`（file-manager.ts:866）读 `~/.claude/claude_mcp_config.json` —— 本机实测**不存在**，是刷屏主源。
- `getMCPServers`（file-manager.ts:871）读 `<cwd>/.claude/mcpServers.json` —— 多数项目没有。
- `getHooks`（file-manager.ts:562）读三个 settings 文件 —— `settings.local.json` 常缺。
- `getAgents`（file-manager.ts:518）/ `getHooks`（file-manager.ts:625）经由 `scanDirectory` 拿到路径后逐个 `readJSONFile`（这层路径已存在，ENOENT 概率低，但仍走同一函数）。

### 2. 插件 skills 扫描（file-manager.ts:194-214）

```ts
const pluginDirs = await fs.readdir(pluginSkillsPath)   // ← 第 195 行：路径不存在直接 throw ENOENT
...
} catch (error) {
  this.logger.error('Error scanning plugin skills:', error)  // ← 第 213 行：ENOENT 当 error 打
}
```

`pluginSkillsPath`（第 192 行硬编码的 `anthropic-agent-skills`）在本机**根本不存在**（实际目录是 `plugins/cache/...`，见 spec003），所以每次都 error。

### 3. 命令文件读取（file-manager.ts:914、940）

```ts
} catch (error) {
  this.logger.error(`Error reading command file ${mdPath}:`, error)  // 第 914/940 行
}
```

`getCommands` 用「目录名即文件名」约定（`<dir>/<dir>.md`），但有些命令目录里 `.md` 文件名不等于目录名 → `readFile` ENOENT → 误报 error。

### 4. SKILL.md 无 frontmatter（file-manager.ts:269）

```ts
this.logger.error(`No frontmatter found in ${filePath}`)  // 第 269 行
```

这是「内容格式不对」，属于**可降级为 warn**（不是文件不存在，但也不该红字 error，应作为可跳过的解析告警）。

### 已经处理对的（作为对照，不动）

- `scanDirectory`（172-184）：`fileExists` 守门 + catch 返回 `[]`，**已静默**。
- `getHooks` settings 循环（604-606）：`catch {}` 空捕获，**已静默**。
- `getClaudeMDFiles` global 读（1161-1164）：catch 走 `logger.info` + `exists:false`，**已合理**。
- `deleteHookFromSettings`（750-752）：catch 走 `logger.warn`，**已合理**。

## 改动方案

### 类型/工具：新增 ENOENT 判定与分级日志助手

在 FileManager 内（紧邻 `logger` 定义，file-manager.ts:71 之后）加一个静态判定：

```ts
/** Node fs 错误中「文件/目录不存在」的判定。ENOENT=不存在，ENOTDIR=路径中段不是目录，两者都视作「正常缺失」。 */
private isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}
```

### 改 `readJSONFile`：区分缺失与真错误（file-manager.ts:156-164）

```diff
   private async readJSONFile<T>(filePath: string): Promise<T | null> {
     try {
       const content = await fs.readFile(filePath, 'utf-8')
       return JSON.parse(content) as T
     } catch (error) {
-      this.logger.error(`Error reading JSON file ${filePath}:`, error)
+      if (this.isMissing(error)) {
+        // 文件不存在是正常状态（如未配置 MCP），静默返回 null
+        return null
+      }
+      // 真错误：权限不足 / 是目录 / JSON 解析失败等，保留 error 以便排查
+      this.logger.error(`Error reading JSON file ${filePath}:`, error)
       return null
     }
   }
```

> 注意：JSON 解析失败抛 `SyntaxError`，无 `code`，`isMissing` 返回 false → 仍走 `logger.error`。符合「损坏的配置要报错」的预期。

### 改插件 skills 扫描（file-manager.ts:212-214）

```diff
     } catch (error) {
-      this.logger.error('Error scanning plugin skills:', error)
+      if (!this.isMissing(error)) {
+        this.logger.error('Error scanning plugin skills:', error)
+      }
+      // 目录不存在（未装任何 plugin）时静默
     }
```

> 这是临时降级；spec003 会把第 192 行硬编码路径整体替换为可配置递归扫描，届时此 catch 会被新扫描函数内统一的缺失处理取代。本 spec 先止血。

同理给「Scan user skills」的 catch（file-manager.ts:234-236）加同样的 `isMissing` 守卫（用户没建 `~/.claude/skills/` 时不该 error）。

### 改命令文件读取（file-manager.ts:913-915、939-941）

```diff
           } catch (error) {
-            this.logger.error(`Error reading command file ${mdPath}:`, error)
+            if (!this.isMissing(error)) {
+              this.logger.error(`Error reading command file ${mdPath}:`, error)
+            }
+            // 命令目录里 .md 文件名与目录名不一致时，按缺失静默跳过
           }
```

（项目级 913、用户级 939 两处都改。）

### 降级 frontmatter 告警（file-manager.ts:269）

```diff
-      this.logger.error(`No frontmatter found in ${filePath}`)
+      this.logger.warn(`No frontmatter found, skipping: ${filePath}`)
```

非 ENOENT，但属「内容不合规、可跳过」，从 error 降为 warn。

## 实现步骤

1. [x] 在 file-manager.ts `logger` 定义后（`:71` 后）新增 `private isMissing(error)` 助手。
2. [x] 改 `readJSONFile`——ENOENT/ENOTDIR 静默返回 null，其余 error。
3. [x] 改插件 skills 扫描 catch 与 user skills 扫描 catch——加 `isMissing` 守卫。
4. [x] 改 `getCommands` 两处命令读取 catch——加 `isMissing` 守卫（`replace_all`，两处同改）。
5. [x] frontmatter 缺失从 `logger.error` 降为 `logger.warn`。
6. [x] 自查：grep `logger.(error|warn)` 全文件，确认改过的 5 处都被 `isMissing` 守卫，剩余 error 点（解析 SKILL.md/命令、校验、扫描超时）均为真错误。`tsc --noEmit` file-manager.ts 零类型错误（hooks.ts/api.ts 的报错是既有问题，未碰）。

## 验收标准

> 验证方式：tsx 脚本驱动 `FileManager`（不依赖 electron），`userConfigPath`/`projectPath` 指向临时空目录，逐场景调 `getMCPServers`/`getSkills`/`getCommands` 并捕获 `console.error/warn`。不污染真实 `~/.claude`。4 场景全过。

- [x] 全缺失（无 claude_mcp_config.json / 无 skills/ / 无插件目录）→ **0 条** `[FileManager][ERROR]`，且 `getMCPServers` 返回 `{}`。
- [x] `getMCPServers` 文件缺失时返回 `{}`（空对象）。
- [x] `claude_mcp_config.json` 写**非法 JSON** → **仍** 1 条 `[FileManager][ERROR]`（真错误没被吞）。
- [x] `chmod 000` → 1 条 ERROR 且含 `EACCES`（权限错误仍上报）。
- [x] SKILL.md 缺 frontmatter → 0 ERROR + 1 `[FileManager][WARN]`（降级成功）。

## 风险与备注

- `isMissing` 把 `ENOTDIR` 也算缺失——覆盖「路径中段被一个文件占位」的边角情况（如 `a/b` 里 `a` 是文件），属于「该路径不可达」，按缺失处理合理。
- 不要把整条 catch 改成空 `catch {}`——那样会连真错误一起吞。务必保留 `isMissing(error)` 判定，让真错误继续 `logger.error`。
- spec003 落地后，插件扫描的缺失处理会收敛进新的递归 glob 工具函数，本 spec 在该模块的临时改动可随之清理；其余（`readJSONFile`、命令、frontmatter）是长期改动，保留。
