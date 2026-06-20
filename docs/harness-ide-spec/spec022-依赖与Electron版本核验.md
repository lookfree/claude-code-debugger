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

## 实现步骤

- [ ] 1. 跑 `npm outdated` / `npm audit` / `npx electron --version`，记录基线到 `deps-audit-<日期>.md`。
- [ ] 2. 把 49 个漏洞按 dep/dev + 是否进产物分类，标出那 1 个 critical 的依赖链。
- [ ] 3. 跑一次 `npm run electron:build`（依赖 spec001 的 build 时序修复已合入），确认能出包。
- [ ] 4. 按判定标准决策：列"保持/升级/跟进"三档清单；对升级档给 `package.json` diff。
- [ ] 5. 执行升级档（如有），`npm install` 后回归 `electron:dev` + `electron:build`。
- [ ] 6. 把结论写回本 spec / audit 文件，更新功能版本对照表 MISC-11 的状态。

## 验收标准

- [ ] 有一份 `deps-audit-<日期>.md`：列清 49 个漏洞的 dep/dev 归类、critical 那条的依赖链、以及"是否进产物"的判断。
- [ ] 有明确结论句：Electron 32.x **是否够用**（够用则不升，写明依据是"`electron:dev` + `electron:build` 均通过"）。
- [ ] `npm run electron:build` 在本机能出包（macOS dmg/zip 至少一个 target 成功）。
- [ ] "升级档"清单里每条都有 `package.json` 前后版本 + 升级后回归通过的记录；"跟进档"（如 eslint 9、那些 deprecated 构建依赖）单独登记，不在 Phase 0 强做。
- [ ] 功能版本对照表 MISC-11 状态从 TODO 更新为"已核验：保持 Electron 32 / 跟进 N 项"。

## 风险与备注

- **不为追新而升**：Phase 0 是"止血"，目标是"能稳定跑 + 心里有数"，不是把依赖全刷到 latest。大版本升级（Electron 33+、eslint 9、vite 6）都列入跟进，不在本 spec。
- **critical 漏洞的实际可利用性**：很多 `npm audit` 的 high/critical 在 devDependencies 或仅在特定调用路径触发，对一个本地桌面工具的实际威胁有限。判定要看"是否进产物 + 是否可达"，不被数字吓到、也不无视那 1 个 critical。
- **native binary（MISC-11 原始语义）**：对照表 MISC-11 原指 Claude Code 自身改用原生二进制（2.1.113-2.1.133）——那是 Claude Code 的事，与本工具无关。本 spec 借 MISC-11 的槽位落实演进路径 Phase 0 第 (d) 项"工具自身依赖核验"，两者不要混淆。
