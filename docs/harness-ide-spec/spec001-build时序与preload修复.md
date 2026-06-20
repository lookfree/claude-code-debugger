# spec001 · build 时序与 preload 修复

- 对应功能 ID：项目自身 bug（无功能 ID）
- 所属 Phase：P0
- 前置依赖：无
- 工作量估计：S（<1 天）

## 目标

修掉 `npm run electron:dev` 首次启动时的时序竞态——`copy:preload` 在 Vite 还没把 `electron/main.ts`/`preload.cjs` 产出到 `dist-electron/` 之前就跑，导致 `cp` 失败、preload 没拷过去、IPC 全断，整个桌面端打不开。这是 Phase 0「止血」的第一刀，不修后面所有功能都无从验证。

## 现状

`package.json` 第 12-13 行：

```json
"copy:preload": "cp electron/preload.cjs dist-electron/preload.cjs",
"electron:dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && npm run copy:preload && electron .\"",
```

时序问题链条：

1. `concurrently` 同时起两条命令：`vite`（dev server + 通过 `vite-plugin-electron` 构建 `electron/main.ts` 到 `dist-electron/`）和 `wait-on http://localhost:5173 && npm run copy:preload && electron .`。
2. `wait-on http://localhost:5173` 只等 **HTTP dev server** 起来，**不等** `dist-electron/main.js` 产出。dev server 通常比 electron 主进程构建先就绪。
3. 首次运行时 `dist-electron/` 目录还不存在，`cp electron/preload.cjs dist-electron/preload.cjs` 因**目标父目录缺失**直接报错 `cp: dist-electron/preload.cjs: No such file or directory`，`&&` 链中断，`electron .` 不再执行；即使手动重试，preload 也可能因为时序仍未到位。
4. `electron/main.ts` 第 33 行 `path.join(__dirname, 'preload.cjs')` 在 `dist-electron/` 下找 preload，第 36 行 `fs.existsSync(preloadPath)` 为 false，第 58-60 行 `preload-error` 触发，打印 `[Main] Preload error`，渲染进程拿不到 `window.electronAPI`，全部 IPC 调用失败。

关键事实——`vite.config.ts` **已经**配了 `vite-plugin-electron`（第 11-24 行），`entry: 'electron/main.ts'`，`outDir: 'dist-electron'`。也就是说 `main.js` 本来就由 Vite 插件构建出来。问题只在于 `preload.cjs` 是一个独立的 CommonJS 文件（不走 TS 编译），靠手动 `cp` 搬运，而搬运时机和等待条件都不对。

> ⚠️ **实现时发现的更深根因（原方案 A 不足）**：`vite-plugin-electron` 的 entry **没配 `onstart` 时会默认自动启动 electron**。所以实际上一直有**两个** electron 实例：① 插件自动起的（在 `cp` 之前就启动 → `preload exists: false` + Preload error）；② 脚本里 `electron .` 起的（`wait-on`+`cp` 之后 → `preload exists: true`）。方案 A 只让 ② 拿到 preload，**① 那个仍然报错**，验收"无 Preload error"过不了。实测 `rm -rf dist-electron` 跑 3 次，日志里 `[0]` 流（vite/插件）始终 `Preload error`、`[1]` 流（`electron .`）才 `true`。真正的修法见下方「实际落地」。

## 改动方案

### 方案对比

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| A（推荐） | `cp` 前 `mkdir -p dist-electron`，且把 `wait-on` 的目标从 HTTP 换成产物文件 | 改动小、确定性强、不引入新构建配置 | 仍保留独立 `cp` 步骤 |
| B | 把 preload 也纳入 `vite-plugin-electron` 的第二个 entry，由插件输出，删掉 `copy:preload` | 最干净，时序由插件保证 | preload 是 `.cjs` 手写文件，需改 `preload.ts`→产物命名链路，改动面大，留给后续重构 |
| C | 仅把 `wait-on http://localhost:5173` 换成 `wait-on dist-electron/main.js` | 等到 main 产出再 cp | 仍不保证 `dist-electron/` 在 cp 那一刻一定存在（main.js 与目录创建有极小窗口），且没解决目录缺失 |

**推荐方案 A**——一行 `mkdir -p` 消灭「目录不存在」这个根因，再把 `wait-on` 等待条件从「HTTP 就绪」改成「electron 产物就绪」，让 `cp` 与 `electron .` 都在 main.js 真正产出之后才跑。两处叠加后竞态被彻底关闭。

### 确切 diff（package.json）

```diff
   "scripts": {
     "dev": "vite",
     "build": "tsc && vite build && electron-builder",
     "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
     "preview": "vite preview",
-    "copy:preload": "cp electron/preload.cjs dist-electron/preload.cjs",
-    "electron:dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && npm run copy:preload && electron .\"",
+    "copy:preload": "mkdir -p dist-electron && cp electron/preload.cjs dist-electron/preload.cjs",
+    "electron:dev": "concurrently \"vite\" \"wait-on http://localhost:5173 dist-electron/main.js && npm run copy:preload && electron .\"",
     "server": "npx tsx server/index.ts",
     "web:dev": "concurrently \"npm run server\" \"vite --config vite.config.web.ts\"",
     "web:build": "vite build --config vite.config.web.ts"
   },
```

要点：

- `copy:preload` 前置 `mkdir -p dist-electron`：即使 `cp` 比 Vite 插件先跑、目录还没建，`mkdir -p` 幂等保证目录存在，`cp` 不再因父目录缺失而失败。（`electron:build` 第 14 行复用同一个 `copy:preload`，一并受益，不必单独改。）
- `wait-on` 同时等 `http://localhost:5173` **和** `dist-electron/main.js`：两者都就绪才进入 `cp && electron`，确保 electron 启动时 `dist-electron/` 里 main.js 已在、preload.cjs 刚拷好。`wait-on` 接受多个目标，全部满足才返回（已在 `devDependencies` 第 78 行，无需新增依赖）。

> 跨平台备注：`mkdir -p` 在 macOS/Linux 原生可用；Windows 下 npm 脚本经由 `sh`/`cmd`，`mkdir -p` 在 PowerShell/cmd 不识别 `-p`。本项目 README 主打 macOS，当前可接受。若要 Windows 兼容，后续可把 `copy:preload` 换成跨平台脚本（如 `node -e "require('fs').mkdirSync('dist-electron',{recursive:true})" && cp ...` 或引入 `shx`/`cpy`），归入方案 B 的重构里，不在本 spec 范围。

## 实际落地（实现后修订 —— 采用 onstart 方案，非方案 A）

方案 A 实测不足（双 electron，见现状的 ⚠️）。落地改用「让插件 `onstart` 掌管 electron 启动、启动前先拷 preload」——本质是方案 B 的轻量版（不动 preload 的 .cjs 产物链路，只接管启动时机），改动反而更小：脚本里整条 `concurrently`/`wait-on`/`electron .` 全删，单实例由插件启动。

**实际改动（已落地、已验证）**：

1. `vite.config.ts`：给 electron entry 加 `onstart(args)`——先 `copyPreload()`（`fs.mkdirSync(recursive)` + `copyFileSync` 把 `electron/preload.cjs` 拷到 `dist-electron/`），再 `args.startup()` 启动 electron。**提供 onstart 后插件不再自动启动**，于是只剩这一个实例，且它启动时 preload 已就位。reload 时 onstart 再次触发，preload 重新拷，热重载也安全。
2. `package.json`：`electron:dev` 从 `concurrently "vite" "wait-on ... && copy:preload && electron ."` 简化成 **`"vite"`**（插件经 onstart 负责起 electron）。`copy:preload` 保留 `mkdir -p` 版本，给 `electron:build` 用（build 模式插件不启动 electron、onstart 不触发，仍需脚本手动拷）。

**验证记录**：`rm -rf dist-electron` 连跑 3 次 `npm run electron:dev`，**3/3** 均 `[Main] preload exists: true`、**无** `Preload error`、`preload exists:` 行数=1（单实例）；run 日志出现 `[FileManager] getSkills() called`（证明 IPC 经 preload 通到主进程）；`vite build && npm run copy:preload` 产出 `dist-electron/{main.js,preload.cjs}` 齐全。

> 副作用：`dev`（也是 `vite`）现在同样会经 onstart 启动 electron——这其实是修正前的既有行为（插件本就自动启动），不算回归。纯前端无 electron 的场景走 `web:dev`。方案 B 里"把 preload 纳入插件第二 entry 彻底删掉 copy:preload"仍可作为后续清理，非本 spec 必需。

## 实现步骤

1. [x] `vite.config.ts`：加 `copyPreload()` + entry `onstart`（拷 preload 再 `args.startup()`）。
2. [x] `package.json`：`electron:dev` 简化为 `"vite"`；`copy:preload` 保留 `mkdir -p` 版本供 `electron:build`。
3. [x] `rm -rf dist-electron` 连跑 3 次 `npm run electron:dev` 验证，3/3 过。
4. [x] `vite build` + `copy:preload` 确认 build 产物里 `preload.cjs` 到位（electron-builder 完整打包未在本轮跑，仅验证 preload 拷贝路径）。

## 验收标准

- [x] 在**全新克隆 / 删空 `dist-electron/`** 的状态下，`npm run electron:dev` 一把过，无需手动 `cp`。
- [x] 主进程日志 `[Main] preload exists:` 打印 `true`（`electron/main.ts` 第 36 行），无 `[Main] Preload error`（第 59 行）。
- [x] 渲染进程经 preload 调到主进程：run 日志出现 `[FileManager] getSkills() called`（preload 若坏则 `window.electronAPI` 为 undefined、此调用不会发生），IPC 通。
- [x] 连续删 `dist-electron/` 重跑 3 次，均成功（3/3，且 `preload exists:` 行数=1 证明单实例）。
- [x] `vite build` + `copy:preload` 产出 `dist-electron/preload.cjs`（4325 字节）。electron-builder 完整打包未在本轮跑。

## 风险与备注

- `wait-on dist-electron/main.js` 依赖 `vite-plugin-electron` 确实把 main 输出到该路径——已由 `vite.config.ts` 第 14 行 `outDir: 'dist-electron'` 保证；若将来改了插件 outDir，此处要同步。
- 方案 B（preload 纳入 Vite 插件第二 entry）是更彻底的解法，建议在 Phase 1 重构 FileManager 时顺手做掉，届时可删 `copy:preload` 整个脚本。本 spec 先用方案 A 止血，不扩大改动面。
- 本修复建议按演进路径第六节「立刻能开始做的三件事」之一，提 PR 回原仓库 `lookfree/claude-code-debugger`。
