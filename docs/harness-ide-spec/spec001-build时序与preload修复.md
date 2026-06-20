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

## 实现步骤

1. [ ] 改 `package.json` 第 12 行 `copy:preload`，在 `cp` 前加 `mkdir -p dist-electron &&`。
2. [ ] 改 `package.json` 第 13 行 `electron:dev`，把 `wait-on http://localhost:5173` 改成 `wait-on http://localhost:5173 dist-electron/main.js`。
3. [ ] 删除已存在的 `dist-electron/` 目录（`rm -rf dist-electron`），模拟首次启动，跑 `npm run electron:dev` 验证。
4. [ ] 确认 `electron:build`（第 14 行）也复用了改后的 `copy:preload`，构建产物里 preload 到位。

## 验收标准

- [ ] 在**全新克隆 / 删空 `dist-electron/`** 的状态下，`npm run electron:dev` 一把过，无需手动 `cp`。
- [ ] 主进程日志 `[Main] preload exists:` 打印 `true`（`electron/main.ts` 第 36 行），无 `[Main] Preload error`（第 59 行）。
- [ ] 渲染进程 DevTools 控制台 `window.electronAPI` 非 `undefined`，任意一个 IPC（如 Skills 页加载）能拿到数据。
- [ ] 连续删 `dist-electron/` 重跑 3 次，均成功（验证竞态确实关闭，而非偶然过）。
- [ ] `npm run electron:build` 产物 `dist-electron/preload.cjs` 存在。

## 风险与备注

- `wait-on dist-electron/main.js` 依赖 `vite-plugin-electron` 确实把 main 输出到该路径——已由 `vite.config.ts` 第 14 行 `outDir: 'dist-electron'` 保证；若将来改了插件 outDir，此处要同步。
- 方案 B（preload 纳入 Vite 插件第二 entry）是更彻底的解法，建议在 Phase 1 重构 FileManager 时顺手做掉，届时可删 `copy:preload` 整个脚本。本 spec 先用方案 A 止血，不扩大改动面。
- 本修复建议按演进路径第六节「立刻能开始做的三件事」之一，提 PR 回原仓库 `lookfree/claude-code-debugger`。
