# spec022 · 依赖与 Electron 版本核验

- 对应功能 ID：MISC-11（native binary / 依赖刷新）—— 落实演进路径 Phase 0 第 (d) 项"依赖刷一遍、electron 大版本跟上"
- 所属 Phase：P0（追加；编号顺延，phase 归属以本字段为准）
- 前置依赖：无（可与 spec001/002/003 并行）
- 工作量估计：S

## 目标

Phase 0 的"完成标志"包含依赖就绪，但 spec001-003 只认领了 build 时序、报错降级、扫描路径，**没有任何 spec 对"依赖与 Electron 版本是否够用"负责**。本 spec 补上这一项：给出一个**可测的结论**——当前依赖矩阵能不能支撑 Phase 1/2 要做的事，要不要升级、升哪些。不是无脑 `npm update`，而是有依据地核验 + 出清单。

> 澄清一个常见误解：演进路径原文说"plugin marketplace 的 ESM 体系对 Electron 32+ 比较关键"——但本工具是把 plugin 配置**当数据读**（扫 `SKILL.md`/`plugin.json`/`installed_plugins.json`），**不加载、不执行 plugin 的 ESM 代码**。所以 Claude Code 的 plugin ESM 体系对本工具的 Electron 版本**没有硬约束**。真正要核验的是工具自身工具链的健康度，不是去追 Claude Code 的运行时要求。

## 现状（引用真实事实）

- `package.json:65` `electron: ^32.1.2`；`:66` `electron-builder: ^25.0.5`；`:75` `vite: ^5.4.3`；`:76` `vite-plugin-electron: ^0.28.7`；`:77` `vite-plugin-electron-renderer: ^0.14.5`。
- 本机实测 `node -v` = v25.9.0、`npm -v` = 11.12.1。
- `npm install` 实测输出：**49 个漏洞（3 low / 18 moderate / 27 high / 1 critical）**，以及一批 deprecated 警告：`eslint@8.57.1`（已不支持）、`glob@7.2.3`/`@8.1.0`、`rimraf@3.0.2`、`inflight@1.0.6`（内存泄漏）、`@humanwhocodes/*`、`npmlog`/`gauge`/`are-we-there-yet` 等。
- `package.json:5` `main: dist-electron/main.js`、`:6` `type: module`——ESM 工程，preload 用 `.cjs`（spec001 已处理时序）。
- Electron 32 对应 Node 18.x 内置（主进程），与本机系统 Node v25 解耦（Electron 自带运行时），所以系统 Node 版本不直接影响打包产物，但影响 `tsx`/`vite` 等开发期工具链。

## 改动方案

本 spec 不写业务代码，产出是一份**核验报告 + 一次有依据的依赖调整**。

### 1. 跑核验命令，记录基线

- `npm outdated`：列出落后依赖与 wanted/latest 差距。
- `npm audit`：49 个漏洞逐个看是 **运行时依赖** 还是 **构建期/devDependencies**（后者多数不影响产物安全，可降优先级）。重点看那 1 个 critical 在哪条依赖链上、是否在打包产物里。
- `npx electron --version` 确认实际拉到的 Electron patch 版本。
- 在本机跑一次 `npm run electron:build`（或 `electron-builder` dry-run），确认当前矩阵能出包（macOS dmg/zip）。

### 2. 判定标准（给"要不要升"一个明确依据）

- **Electron**：32.x 能正常 `electron:dev` + 出包即视为**够用**，不为"追新"而升大版本（大版本升级有 BrowserWindow/contextBridge API 变更风险，Phase 0 不引入）。仅当 32.x 在本机 macOS 26 上出现已知崩溃/签名问题才升。
- **构建期 deprecated（eslint 8、glob、rimraf、inflight 等）**：多数随 `electron-builder`/`eslint` 间接引入，**不单独硬升**（升 eslint 9 是 flat-config 破坏性变更，单列后续）。本 spec 只记录、不强升。
- **运行时依赖漏洞**：只有落在 **dependencies（进产物）** 且可利用的，才在 Phase 0 修；devDependencies 的漏洞登记到跟进清单。

### 3. 产出物

- 在本 spec 末尾（或 `docs/harness-ide-spec/deps-audit-<日期>.md`）追加一张表：依赖 / 当前版本 / 最新 / 类型(dep/dev) / 漏洞等级 / 结论(保持/升级/跟进)。
- 对"决定升级"的依赖，给确切的 `package.json` 改动 + 一次 `npm install` + 回归（`electron:dev` 一把过、`electron:build` 能出包）。

## 核验结论（2026-06-20 实跑）

**一句话：Electron 32 够用，保持不升；漏洞绝大多数在 dev/构建链、不进产物；非破坏性修复与主版本升级列为跟进，不在 Phase 0。**

- **Electron 32.3.3 验证全过**：`electron:dev`（spec001/003 已多次跑通，`preload exists:true`、getSkills 返回 31）、`vite build`、`electron:build` **完整出包**（产出 `Claude Code Debugger-0.1.0-arm64.dmg` + `-mac.zip`；代码签名因无 Developer ID 证书被跳过，本地构建正常）。依据充分 → **保持 Electron 32，不追 42**（大版本跳跃，BrowserWindow/contextBridge API 有破坏性变更风险，Phase 0 不引入）。
- **49 个漏洞分类**：1 critical = `shell-quote`（依赖链 `concurrently@8.2.2 → shell-quote`，**devDependency、仅 `web:dev` 用、不进 electron 产物**）；high+critical 经依赖链归类约 10 条纯 dev/构建期（eslint/electron-builder/babel/@xmldom 等）、其余多为 dev 与传入混合的传递依赖。**没有可利用的 critical 落在打进产物的运行时依赖上**。
- **三档决策**：
  - **保持**：electron 32、electron-builder 25、vite 5、react 18 —— 当前矩阵 dev+build+package 全通过，不动。
  - **升级（可选、非破坏）**：`npm audit fix` 能修一批（@babel/core、axios、@xmldom、ajv 等的非破坏补丁）。**本 spec 未执行**——它会大面积改 `package-lock.json`，应作为一次有意识的独立提交，不混进 Phase 0 功能改动。
  - **跟进（破坏性，单列）**：eslint 8→10（flat-config 破坏性）、electron 32→42、chokidar 3→5、@vitejs/plugin-react 4→6、concurrently 8→10（顺带消除 shell-quote critical）、@typescript-eslint 7→8——都不在 Phase 0。
- **既有 TS 错误（非依赖问题，登记）**：`tsc --noEmit` 报 6 条，全在 `electron/ipc/hooks.ts`（HookExecution status 联合类型、terminalProc 使用前赋值）与 `src/lib/api.ts`（`import.meta.env` 类型）——是 spec007/后续要碰的既有问题，与本 spec 无关，`npm run build` 的 `tsc` 步会被它们卡住（dev 用 esbuild 不受影响）。

## 实现步骤

- [x] 1. 跑 `npm outdated` / `npm audit` / `npx electron --version`，记录基线（见上结论）。
- [x] 2. 49 漏洞按 dep/dev + 是否进产物分类，critical `shell-quote` 依赖链已查（concurrently，dev-only）。
- [x] 3. 跑 `npm run electron:build` 确认出包——dmg + zip 均成功。
- [x] 4. 按判定标准给出"保持/升级/跟进"三档清单（见上）。
- [~] 5. 升级档未执行（`npm audit fix` 留作独立提交，避免污染 Phase 0；破坏性升级列入跟进）。
- [x] 6. 结论写回本 spec；更新功能版本对照表 MISC-11 状态。

## 验收标准

- [x] 49 个漏洞的 dep/dev 归类 + critical（`shell-quote` ← concurrently，dev-only）依赖链 + "是否进产物"判断（见核验结论，无可利用 critical 进产物）。
- [x] 明确结论：Electron 32.x **够用，不升**——依据 `electron:dev` + `vite build` + `electron:build` 出包均通过。
- [x] `npm run electron:build` 出包成功：`Claude Code Debugger-0.1.0-arm64.dmg` + `-mac.zip`（arm64）。
- [x] "升级档"（npm audit fix 非破坏）与"跟进档"（eslint10/electron42/chokidar5/concurrently10 等破坏性）已单列；Phase 0 不强做。
- [x] 功能版本对照表 MISC-11 状态更新为"已核验：保持 Electron 32 / 跟进若干"。

## 风险与备注

- **不为追新而升**：Phase 0 是"止血"，目标是"能稳定跑 + 心里有数"，不是把依赖全刷到 latest。大版本升级（Electron 33+、eslint 9、vite 6）都列入跟进，不在本 spec。
- **critical 漏洞的实际可利用性**：很多 `npm audit` 的 high/critical 在 devDependencies 或仅在特定调用路径触发，对一个本地桌面工具的实际威胁有限。判定要看"是否进产物 + 是否可达"，不被数字吓到、也不无视那 1 个 critical。
- **native binary（MISC-11 原始语义）**：对照表 MISC-11 原指 Claude Code 自身改用原生二进制（2.1.113-2.1.133）——那是 Claude Code 的事，与本工具无关。本 spec 借 MISC-11 的槽位落实演进路径 Phase 0 第 (d) 项"工具自身依赖核验"，两者不要混淆。
