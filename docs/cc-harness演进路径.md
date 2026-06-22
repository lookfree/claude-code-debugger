# cc-harness 演进路径——从"配置浏览器"到"Harness 工作台"

写给自己看的产品思路梳理。把这个一年前的项目，接到 Claude Code 2.1.183 的现实，以及自己 harness 系列的产品命题上。

核心结论先放这——**项目最大的问题不是哪个页面有 bug，是它的世界观停在了 2.0 早期。** 那时候 Claude Code 还是一个"单会话、靠几个配置文件驱动"的工具，所以项目把自己定位成"配置文件浏览器"。但过去这大半年，Claude Code 已经长成了一个"多会话编排 + 自动循环 + 后台调度 + 可观测 + 可治理"的复杂系统。项目要重做的，是世界观，不是几个控件。

---

## 一、现状是啥

### 项目当下的样子

`~/Documents/projects/cc-harness`，一年前的产物（原名 claude-code-debugger）。Electron + Vite + React + shadcn/ui + Zustand + i18next，双模式（桌面 Electron + Web Express）。九个页面：Dashboard、Skills、Agents、Hooks、MCP、Commands、ClaudeMd、Graph、Models、Settings。

它的数据模型是这样的——

```
FileManager 扫描：
  ~/.claude/skills/*/SKILL.md
  ~/.claude/plugins/marketplaces/anthropic-agent-skills/*/SKILL.md   ← 写死一个源
  ~/.claude/commands/*.md
  ~/.claude/settings.json
  ~/.claude/claude_mcp_config.json
```

只认"user 级 + 一个固定 marketplace"的静态配置文件。**它是一台只会读配置的扫描器，看不到 Claude Code 运行时在干什么。**

### Claude Code 这大半年都长出了什么

我把手头这十几篇 changelog（2.0.65 一路到 2.1.183）通读了一遍，把项目还没体现、但其实已经成为 Claude Code 核心能力的东西，按主题归一下。这张表是后面所有规划的依据——

**编排与多会话（这是过去半年最大的主线，项目几乎零覆盖）**

| 能力 | 版本 | 是什么 | 项目状态 |
|---|---|---|---|
| agent view（Research Preview） | 2.1.139 | 把所有 Claude Code 会话——running/blocked/completed——汇总到一个 dashboard | 无 |
| `claude agents` 子命令 | 2.1.139+ | shell 入口看所有会话，`--cwd` 限项目，`--json` 给脚本化出口 | 无 |
| `/goal` | 2.1.139 | 声明式目标循环，overlay 实时显示用时/轮数/token，达成自动停 | 无 |
| `/bg` + `claude --bg` | 2.1.142 | 后台会话，`/resume` 能 attach，完成通知带时长 | 无 |
| Pinned sessions（Ctrl+T） | 2.1.147 | pin 住的 session 不被回收、更新时原地重启 | 无 |
| subagent 五层嵌套 | 2.1.172 | subagent 可以自己再起 subagent，最多五层（2.1.181 加防无限嵌套护栏） | Agents 页是占位 |
| Agent Teams 概念收缩 | 2.1.178 | 删 TeamCreate/TeamDelete，team 改成 session 隐式存在，tmux teammate panes | 无 |
| `/loop` | 2.1.71 | 会话级定时调度器，自然语言转 cron，轮询/提醒/盯 PR；session 级、3 天过期、不并发（2.1.73 修兼容性） | 无 |
| **Dynamic Workflows（CLI Workflow 工具）** | 2.1.154 引入 / 2.1.160 触发词 `workflow`→`ultracode` / `/workflows` 看运行 2.1.152 / worktree 隔离 2.1.151 | 让 Claude 自己生成 workflow，**在后台编排几十到几百个 agent**；确定性控制流（loop/分支/fan-out），不是模型即兴 | 无 |
| **dream / AutoDream（做梦式记忆固化）** | Research Preview（未进主 changelog，需申请访问） | 读 MEMORY.md + topic 文件 + 历史 session transcript，合并重复、删过期、解决矛盾、重组记忆；浮现"反复犯的错、收敛出的工作流、团队共享偏好"。手动 `/dream` + 自动 AutoDream 两种 | 无 |

**可观测与成本（项目今天最大的空白，也是用户最痛的）**

| 能力 | 版本 | 是什么 | 项目状态 |
|---|---|---|---|
| `/usage` 分项明细 | 2.1.149 | token 按 skills/subagents/MCP/plugins/base session 拆开看 | 无 |
| 插件 token 成本预估 | 2.1.142 | `claude plugin details` 看单会话预估 token 成本 | 无 |
| Monitor 工具 | 2.1.98 | 让 Claude 实时感知后台脚本输出流（2.1.105 加 plugin background monitor 配合） | 无 |
| OTEL span agent_id | 2.1.145 | 可观测埋点带 agent_id | 无 |
| session jsonl transcript | 一直有 | `~/.claude/projects/<cwd>/<session>.jsonl` 完整记录每个 turn | 无 |

**Hooks（体系扩了一大圈，项目只认最老的几个字段）**

| 能力 | 版本 | 是什么 | 项目状态 |
|---|---|---|---|
| MessageDisplay hook | 2.1.152 | Claude 输出显示前干预——转换内容或隐藏 | 无 |
| PreCompact hook | 2.1.105 | 压缩前介入（PostCompact 在 2.1.76） | 无 |
| ConfigChange hook | 2.1.49 | 配置变更审计，企业级 | 无 |
| HTTP hooks | 2.1.63 | `type:http`，触发时 POST JSON 到端点并收响应，不只本地命令 | 无 |
| Elicitation / ElicitationResult hook、StopFailure hook | 2.1.76 / 2.1.78 | hook 体系从"跑脚本"长成"流程控制总线" | 无 |
| PostToolUse 输出替换 | 2.1.121 | hook 可修改/替换工具输出，让 Claude 看到处理过的版本 | 无 |
| SessionStart reloadSkills / sessionTitle | 2.1.152 | 启动时动态加载 skill、预设会话标题 | 无 |
| args(exec form)、continueOnBlock、terminalSequence | 2.1.134-143 | hook 新执行形态与字段 | 无 |
| effort.level 透传 + stop-hook 8 次阻断上限 | 2.1.133 / 2.1.143 | hook 拿到 effort，循环有硬边界 | 无 |
| PermissionRequest hook | 2.0.45 | 权限请求自动化 | 无 |

**权限与配置（从"菜单里点"演进到"命令行里写"——可编程化）**

| 能力 | 版本 | 是什么 | 项目状态 |
|---|---|---|---|
| `Tool(param:value)` 权限语法 | 2.1.178 | 权限精确到参数，如 `WebFetch(domain:github.com)` | 无 |
| `/config key=value` + `--help` | 2.1.181/183 | 任意设置项一行设定 | 无 |
| Bash 权限写到 local settings | 2.1.131 | 权限分层 | 无 |
| disallowed-tools frontmatter | 2.1.152 | skill/command 里声明禁用工具 | 无 |
| availableModels / enforceAvailableModels | 2.1.174 之前有 availableModels / 2.1.175 加 enforce | 组织管理员约束团队能用哪些模型（2.1.176 修强制逻辑贯穿 subagent/dispatch） | 无 |

**模型**

| 能力 | 版本 | 是什么 | 项目状态 |
|---|---|---|---|
| Fast mode 升 Opus 4.7 | 2.1.142 | Fast mode 默认模型升级 | Models 页不体现 |
| `/model` 列 gateway 模型、this-session vs default | 2.1.131 列 gateway / 2.1.144 改 session 级 / 2.1.153 又改回默认保存 | 模型选择粒度反复调（两周内 U 形弯） | 无 |
| 废弃/自动切换模型警告 | 2.1.183 | 模型下线后会话不卡死（Fable 5 善后） | 无 |
| modelOverrides | 2.1.73 | 分场景覆盖模型 | 无 |

**Skills / Commands / Plugins（三层来源 + marketplace 生态）**

| 能力 | 版本 | 是什么 | 项目状态 |
|---|---|---|---|
| Skills/Commands 概念大统一 | 2.1.2-2.1.7（2.1.4） | 两个概念归一 | 部分 |
| 嵌套 skills 自动加载、`/reload-skills` | 2.1.152 reloadSkills / 2.1.178 嵌套自动加载 | skill 动态加载 | 无 |
| `/skills` 过滤搜索、marketplace 搜索 | 2.1.121 / 2.1.172 | 多了搜索 | 部分 |
| plugin 依赖管理、`claude plugin details/enable/disable` | 2.1.142 起 | plugin 生命周期管理 | 无 |
| cache 多源多版本目录结构 | 现状 | `plugins/cache/<mp>/<plugin>/<ver>/...` | 写死单源，扫不到 |

**代码审查 / worktree / MCP / 记忆 / 其它**

| 能力 | 版本 | 是什么 | 项目状态 |
|---|---|---|---|
| `/code-review`（原 /simplify）+ effort + --comment + --fix | 2.1.147 改名+comment / 2.1.152 加 --fix | 本地审查工具链 | 无 |
| `/ultrareview` 云端多智能体审查（进 CLI） | 2.1.119 | 深度审查 | 无 |
| `--worktree` 隔离模式 / worktree.baseRef / worktree.bgIsolation | 2.1.49 / 2.1.133 / 2.1.143 | worktree 隔离与基准配置 | Settings 看不到 |
| MCP elicitation（追问/向你要答案） | 2.1.76 | MCP 不只接工具，能反向跟你要答案 | 只读配置 |
| claude.ai MCP 连接器 | 2.1.46 | 在 Claude Code 里用 claude.ai 的 MCP 连接器，打通账号体系 | 无 |
| alwaysLoad MCP / MCP 并行启动 | 2.1.121 / 2.1.116 | 强制加载、启动提速 | 只读配置 |
| Auto Memory（自动记忆） | 首发 2.1.20-2.1.37，2.1.38-2.1.49 持续演进 | Claude 给自己记笔记，按 git repo 根隔离；dream 固化的就是这套记忆 | 无 |
| Context Editing + Memory Tool | API 能力（非 CLI 版本号） | 长 Agent 的上下文管理与记忆 API | 无 |
| `fallbackModel`（最多 3 个） | 2.1.166 | 主模型过载/不可用时按序回退（呼应 Fable 5 下线那条"模型可替换是刚需"） | 无 |
| `claude agents --json` 加 `waitingFor` | 2.1.162 | 等待中的 session 显示在等什么（observe 的现成数据源） | 无 |
| `/plugin list` / `claude plugin init <name>` | 2.1.163 / 2.1.157 | 列已装插件、脚手架新插件 | 无 |
| `--safe-mode` / `disableBundledSkills` / `/cd` | 2.1.169 | 禁所有定制排障、隐藏内置 skill、不断缓存换工作目录 | 无 |
| post-session 生命周期 hook、requiredMin/MaxVersion managed setting | 2.1.169 / 2.1.163 | 自托管 runner 善后、企业版本约束 | 无 |
| Remote Control（手机遥控） | 2.1.51 起（2.1.53 修关闭、2.1.58 扩用户） | 手机端控制会话，Research Preview | 无 |
| LSP 集成 | 2.0.74 | 语言服务接入 | 无 |
| native binary | 2.1.113-2.1.133 | 原生二进制，架构重新站队 | 部分 |
| Windows PowerShell 工具 / ARM64 原生 | 2.1.82 / 2.1.38-2.1.50 | Windows 生态正式纳入 | 部分 |
| Rewind / Summarize from here | 2.1.139-143 | 回溯与"总结到此处" | 部分 |

一句话总结这张表——**项目停在"翻看静态配置"这一层，而 Claude Code 早就进入了"运行时编排 + 自动循环 + 可观测 + 可治理"这一层。差的不是几个功能，是整整一代。**

### 项目还能留什么

不是推倒重来。它已经搭好的东西值得继续用——

- Electron + Web 双模式的 IPC 抽象（`src/lib/api.ts` 自动探测环境）；
- shadcn/ui 的设计语言、i18n 中英双语（注：reactflow 虽在 deps 但项目尚未实际用上，Graph.tsx 是 lucide 自绘——Phase 2 的拓扑图是 reactflow 首次接入，不是复用）；
- 干净的 IPC 注册器（`electron/ipc/`）。

**架子留，数据层和业务页按上面这张表全面重做。**

---

## 二、准备成为啥

### 一句话定位

把它从"Claude Code 配置浏览器"重做成 **"Harness 工作台"**——围绕 Claude Code 这个参考 harness，提供**配置 / 调试 / 观测 / 编排 / 教学**五件事的桌面工作站。

这个定位跟自己 harness 系列对得上——

- **05 篇 Thin Harness, Fat Skills**——工具本身是个瘦壳子，把所有"肥料"（skills、agents、CLAUDE.md、hooks、plugin、workflow 模板）摆出来让你看、改、测。工具不抢风头。
- **07 篇 解剖 Claude Code**——这工具就是把"解剖图"做成可交互版本。
- **14 篇 解剖 ECC（agent harness performance optimization system）**——工具的"评估"功能就是 ECC 那套思路的落地：token 怎么花、subagent 套几层、skill 命中率、hook 触发频次，全可量化。
- **15 篇 Skills 生态**——marketplace 浏览器是生态入口。
- **17 篇 安全、可观测与评估**——"调试"和"观测"两根支柱直接对应 harness 上生产后的三件大事。
- **18 篇 自己动手搭一个 Harness**——工具是这篇的配套实操。

### 五根支柱，每根都对应上面那张表里的一片

**一、配置（Configure）** Claude Code 所有可改的地方一网打尽，且跟上 2.1.183 的现实——三层来源的 skills/commands、plugin marketplace 多源多版本、新 hook 类型、`Tool(param:value)` 权限语法、worktree、managed settings。重点是**搜索、对比、覆盖检测、改完即时校验**。对应表里的"Hooks / 权限配置 / Skills/Commands/Plugins"三片。

**二、调试（Debug）** 让用户能"运行"一个 hook、一个 skill、一个 command，看输入输出，不用真在 Claude Code 里试错。MessageDisplay/PreCompact/HTTP hook 都能 dry-run。对应表里的"Hooks"片的可执行化。

**三、观测（Observe）** Live 看 Claude Code 在干什么——解析 session jsonl、画 subagent 五层调用树、把 `/usage` 分项拉到面板、画 hook 触发时间线、显示 `/loop` 定时任务队列、显示后台会话状态、**把 Workflow 工具编排的几十上百个 agent 实时画出来**、**把 dream 固化前后的 MEMORY.md 做成 diff 给你看**。**这是项目今天最大的空白，也是最大的差异化点**，对应表里整个"可观测与成本"片，外加记忆固化这条新线。

**四、编排（Compose）** 业务工作流的具象化。把"针对某业务的 CLAUDE.md + skills + hooks + commands"打包成工作流模板，能存、能复用、能导出成 plugin、能分享。对应表里"编排与多会话"片里那些用户其实想要但 CLI 里很碎的东西——`/goal`、`/loop`、subagent 编排、**Dynamic Workflows（CLI 的 Workflow 工具，2.1.154 起就能让 Claude 后台编排几百个 agent）**，用 UI 把它们攒成可复用的业务流程。Workflow 工具是个确定性控制流原语（loop/分支/fan-out），但它现在只能靠 Claude 在会话里临时写脚本——工具可以做成"可视化 workflow 编辑器 + 运行监视器"，把这个最强的编排原语从"高手才会用"变成"人人能搭"。这是用户说的"定制基于特定业务的工作流"的落点。

**五、教学（Teach）** 引导式配置。给一个空目录或已有项目，工具陪你走一遍——hooks 该干啥、skill 该写啥、CLAUDE.md 该长啥样、plugin 该装哪些。在工具里摸着真实状态学，不是看文档。这是用户后面想做"教学项目"的承接点。

### 跟竞品的关系

- **上游**：官方 `claude config`、`claude plugin`、`claude agents` CLI——它们是事实标准的管理入口。工具不跟它们对着干，做的是**把 CLI 没暴露的东西可视化、把要跨命令组合的工作流凝聚成 UI**（比如 `claude agents --json` 给了数据，工具把它画成实时面板）。
- **同代**：claudia、claude-code-templates——更偏 GUI 客户端或模板市场。工具差异化在"调试 + 观测 + 编排"这三根它们都不擅长的支柱。
- **思想**：DeepAgents Studio、LangSmith、Hermes 自带 ops 面板——隔壁 harness 的运维工具。工具要长成 Claude Code 这一派的对应产品。

---

## 三、路径是啥

四个 phase，每个都有清晰的"做完之后能干啥"。

### Phase 0——止血（一周内）

先让项目重新跑起来，否则后面所有事不能开始。

- **build 时序竞态**——`copy:preload` 在 vite 首次 build 前就跑，导致 `dist-electron/preload.cjs` 不存在、IPC 全断（这次启动我已经踩到并手动 cp 绕过）。改成 `wait-on dist-electron/main.js`，或 cp 前 `mkdir -p`。
- **ENOENT 报错降级**——`claude_mcp_config.json` 不存在就别 ERROR，静默返回空。
- **扫描根目录换掉**——把写死的 `plugins/marketplaces/anthropic-agent-skills` 下掉，先临时改成扫 `plugins/cache/*/*/*/skills/*/SKILL.md`，让本机已装的 superpowers / last30days / handdrawn-diagram 至少能出现。
- **依赖刷一遍**——electron 大版本跟上（plugin marketplace 的 ESM 体系对 Electron 32+ 比较关键）。

完成标志——`npm run electron:dev` 一把过，本机已装的 plugin/skill 都能在 Skills 页扫到。

### Phase 1——补齐配置层（两到三周）

跟 Claude Code 当前数据模型对齐，不加运行时功能，只把"它今天看不到的静态配置"全补上。对应第一节表里的"配置类"三片。

**Skills/Commands 三层来源模型**——重写 FileManager——

```
user 级：     ~/.claude/skills/、~/.claude/commands/
project 级：  <cwd>/.claude/skills/、<cwd>/.claude/commands/
plugin 级：   ~/.claude/plugins/cache/<mp>/<plugin>/<ver>/{skills,commands}/
```

UI 加 source 列染色，加"被覆盖"提醒（同名时 user 赢）。

**Plugin Marketplace 浏览器**——新增 Plugins 页，列 marketplace → plugin → 各版本 → 当前 enable 哪个版本。能在 UI 里点 `claude plugin enable/disable`、看 `claude plugin details` 的组件清单和 token 成本预估。

**Hooks 新字段全支持**——把 MessageDisplay、PreCompact、ConfigChange、HTTP hook、PostToolUse 输出替换、SessionStart 的 reloadSkills/sessionTitle、args(exec form)、continueOnBlock、terminalSequence、effort.level、stop-hook 阻断上限——全部映射到 UI 控件，加 schema 校验。

**权限编辑器**——支持 `Tool(param:value)` 语法的可视化构造（选工具、填参数匹配），支持 disallowed-tools frontmatter，支持权限分层（user / project / local）。

**Worktree + 模型治理面板**——Settings 加 Worktree 子面板（baseRef、bgIsolation），加 managed settings 视角（availableModels、enforceAvailableModels、requiredMin/MaxVersion）、`fallbackModel`（最多 3 个回退模型）、`disableBundledSkills`、`--safe-mode` 说明。这些是 2.1.154-2.1.169 那段我之前没写博客的空档里落的企业向配置，工具要一并认。

**Agents 页真正实现**——读 `~/.claude/agents/*.md`、项目级、plugin 自带的 agent，展示 system prompt、tool 列表、model override。

完成标志——一个装了 5 个 plugin、若干 user skill、自己写了几个 agent 的真实项目，打开工具能**完整看懂**今天的 harness 配置全貌。

### Phase 2——运行时观测与调试（一个月以上）

进入"看到 Claude Code 在干什么"。这是项目**最大差异化**，也是技术挑战最大的阶段。对应第一节表里"可观测与成本"整片，加 Hooks 的可执行化。

**Session 监视器**——tail `~/.claude/projects/<encoded-cwd>/<session>.jsonl`，实时解析每个 turn——user prompt、assistant 调了哪些 tool、tool 输入输出、subagent 在哪步 spawn 跑多久 return 什么、token 怎么花（input/output/cache hit，按 model 分）。做成"对话回放 + 时间线"双视图。`claude agents --json` 给的就是这数据的现成出口，工具把它画出来——**目前没有第三方面板能把多 session 横向比对，这是发力点。**

**Subagent 五层调用树 + Workflow 编排视图**——2.1.172 之后 subagent 能套五层，2.1.154 的 Workflow 工具更能一口气编排几十上百个 agent，关系复杂度上了一个量级。用 React Flow 画成实时长出来的树/图，每个节点显示 agent 名、用时、token、嵌套深度、所属 workflow 阶段。这正好是工具差异化最直观的一张图——CLI 里那个 inline 进度条只能看个计数，看不到这张拓扑。Workflow 跑着几百个 agent 的时候，这张图就是用户唯一能看懂"它在干什么"的窗口。

**Token / Usage 烧钱面板**——把 `/usage` 的分项数据源（skills/subagents/MCP/plugins/base）拉过来做成面板。对接 14 篇 ECC 方法论——告诉用户"换 sonnet 省 60%""MAX_THINKING_TOKENS 降到 10000 省 70%"在他这个项目里具体能省多少。

**Hook 沙箱执行器 + 触发时间线**——选一个 hook 给模拟输入 dry-run，看 stdout/stderr/blocked/转换结果，不用真启 session；session 监视开着时，每次 hook 触发在时间线掉个点，悬浮看 input/output。MessageDisplay/PreCompact 这类新 hook 尤其需要这种"先试再用"。

**`/loop` 定时任务面板**——`/loop` 是 session 级的 cron，但它跑在哪个 session、还有几次、几点触发，CLI 里看不全。工具把当前所有 session 的 `/loop` 任务汇总成一个调度面板，能看能取消。配合后台会话状态，把"Claude Code 在后台替我盯着的那些事"可视化。

**MCP 健康面板**——每个 MCP server 的连接状态、上次握手、暴露 tool count、最近调用成功/失败/耗时。

**记忆面板 + dream 可视化**——把 Auto Memory 写的 MEMORY.md 和 topic 文件做成可浏览的记忆视图；dream/AutoDream 跑完之后，把"固化前 vs 固化后"做成 diff——哪些重复被合并了、哪些过期项被删了、哪些矛盾被解决了、浮现出哪些新模式。dream 是 Research Preview、还是黑盒，谁能把它的"前后对比"照亮，谁就帮用户建立了对这个功能的信任。这条线跟 ECC 的"harness 可观测"也接得上——记忆是 harness 最难观测的状态之一。

完成标志——用户能回答这种问题："我这个 session 花了多少 token 在哪个 subagent 上""我这个 hook 是不是在我没想到的时候触发了""我设的那个 `/loop` 还在跑吗""这个 MCP server 是不是经常超时""我那个 workflow 现在跑到第几个 agent 了""dream 把我的记忆改成什么样了"。

### Phase 3——编排与教学（长期）

往"业务工作流模板 + 教学项目"走，是 Phase 0-2 扎实后的产品溢出。对应第一节表里"编排与多会话"片的产品化。

**业务工作流模板**——一个工作流 = CLAUDE.md 模板 + 一组 skills + commands + hooks + MCP 配置 + 推荐 settings + 可选的 `/goal` 目标模板、`/loop` 调度模板、**Workflow 脚本模板（即 ultracode 触发的那种确定性多 agent 编排）**。工具提供"导出为 plugin"——打包成 marketplace 格式，直接能发布。自带几个业务模板示例：前端代码评审 harness、后端微服务设计 harness、技术博客写作 harness（用户自己的场景）、数据分析 harness。每个就是一个完整 plugin。其中"博客写作 harness"可以内置一个 Workflow 脚本——比如你写 changelog 这种活，fan-out 几十个 agent 各读一个版本区间、各自核对版本号、再汇总成稿，正是 Workflow 工具的主场。

**配置评估（Harness Benchmark）**——接 ECC 思路。选一个标准任务集，用当前配置跑一遍 Claude Code，输出"分数 + token + 步数 + 成功率"，再给调优建议——"CLAUDE.md 太长，拆成 user+project 两层""这个 hook 触发太频繁，换 condition""plugin A 和 B 的 skill 在同类问题上冲突""subagent 套到第五层了，收一收"。把"harness 性能优化"这件目前没有标准工具的事做成可量化、可复现。

**教学引导（Onboarding Tour）**——给全新项目目录，工具按步引导：写 CLAUDE.md → 按业务推荐 plugin → 配常用 hook → 设几个 `/goal` / `/loop`。每步对应 harness 系列一篇文章，**文章 + 工具页面 + 实际配置**三件套同步走完。这是从"工具"长成"教学项目"的关键。

**社区分享**——工作流模板一键分享到一个简单社区页（GitHub repo + index.json），浏览别人的 harness 配置、一键导入。给 harness 系列的长尾内容生产提供基础设施——读者看完文章想"我也搭一个我业务的 harness"，工具给他发布渠道。

完成标志——工具变成 harness 系列文章的**配套实验室**。文章里讲的每个 harness 案例（superpowers、gstack、ECC、Hermes），工具里都能装、能跑、能改、能评估。

---

## 四、节奏与取舍

### 优先级

Phase 0 立刻做，否则跑不起来；Phase 1 是"诚实义务"，不补齐别说这是 Claude Code 工具；Phase 2 是产品命门，立不立得住看这阶段；Phase 3 是溢出红利。

时间有限时——

- **只做 Phase 0 + Phase 1**——得到一个"今天能用、数据正确的 Claude Code 配置浏览器"。底线交付。
- **加上 Phase 2 的 session 监视器 + token 面板 + subagent 调用树**——已经显著超过任何现有第三方工具。这是 MVP。
- **再加上 Phase 3 的业务模板**——产品化、可推广、可接 harness 系列内容。发力线。

### 不做什么（防止"想做的太多→停在原地"）

- **不做 AI 辅助生成配置**——大模型给的 CLAUDE.md 模板都是花架子，不如让用户从工具里抄优秀范例。
- **不做 GUI 对话窗口**——claudia 在做，Claude Code 的 CLI 本身够好，不正面竞争。
- **不强化 Web 版**——Web 模式保持只读浏览角色，hook 执行/MCP 测试/session 监视都得桌面端。
- **不接其他 harness**——DeepAgents、pi-mono、Hermes 留在文章里讲，工具死死围绕 Claude Code 一个。原因：跟一家厂的 plugin 演化节奏跟得过来，跟五家跟不过来。

### 跟系列文章对齐

- Phase 0 完成——07 篇"解剖 Claude Code"贴工具截图。
- Phase 1 完成——15 篇"Skills 生态"演示 marketplace 浏览。
- Phase 2 完成——独立写产品发布文，挂在 17 篇"安全可观测评估"之后。
- Phase 3 完成——成为 18 篇"自己动手搭一个 Harness"的配套实操工具。

---

## 五、技术栈

不换。Electron + Vite + React + shadcn + Zustand + i18next 够用——

- Electron 必要：hook 执行、文件监听、MCP 子进程、session jsonl tail 都得桌面端。
- React + shadcn 生产力好；React Flow 给 subagent 五层树、plugin 依赖图都能用；Zustand 够轻；i18n 已搭好。

需要补的——

- **reactive 状态层**——Phase 2 的 live 监视引入文件 tail / EventEmitter 流，自己写个 EventTarget wrapper（rxjs 太重）。
- **文件监听**——chokidar 接进来，监听 `~/.claude/` 和 cwd 的 `.claude/`、以及 `~/.claude/projects/` 下的 jsonl。
- **解析层**——session jsonl 解析写成独立模块（CLI、Web 视图都能复用）。这是 Phase 2 的地基，值得单独写、单独测。
- **打包**——electron-builder 配 macOS/Windows/Linux 三平台签名。

---

## 六、立刻能开始做的三件事

**一**，修 Phase 0 的 build 时序 bug，提 PR 到原仓库 `lookfree/claude-code-debugger`。即使后面 fork 自己搞，这个 PR 也是"认真对待这个项目"的信号。

**二**，重写 FileManager，扫描路径配置化、支持递归 glob、支持三层来源。Phase 1 地基，独立 PR。

**三**，在 `harness` 目录下开 `harness-ide-spec/` 子目录，把每个 Phase 的功能点按第一节那张表拆成 issue 草稿，列清验收标准。

---

写这份的目的是把"项目要长成啥"讲清楚，不是定死路线。Claude Code 在跑、生态在变，每个 Phase 完成后都该重新审一次边界。但**"Thin Harness, Fat Skills"的产品哲学，和"配置/调试/观测/编排/教学"五根支柱**，这两条是长期定位锚，不轻易动。

最后留一句给自己——这工具真正的护城河不在"能不能编辑配置"，那是 CLI 已经做好的事；护城河在**"能不能让人看见 Claude Code 在干什么、钱花在哪、agent 套了几层、hook 在哪触发、loop 还在不在跑、workflow 编排的几百个 agent 跑到哪了、dream 把我的记忆改成了什么样"**。Claude Code 越复杂越像黑盒——subagent 五层、Workflow 几百 agent、dream 黑盒固化记忆，每加一个能力就多一层不透明。谁能把这个越来越深的黑盒照亮，谁就有价值。
