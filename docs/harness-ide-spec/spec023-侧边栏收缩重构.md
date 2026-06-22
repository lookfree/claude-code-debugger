# spec023 · 侧边栏收缩重构（lime 风格）

- 对应功能 ID：MISC（布局 UX 优化）
- 所属 Phase：P0
- 前置依赖：无
- 工作量估计：S

## 目标

参照 lime 的侧边栏设计，将 toggle 按钮从全宽 titlebar 移入侧边栏头部，收缩模式改为 **icon-only（72px）** 而非完全隐藏（0px），同时用 `padding-top` 垂直避让 macOS 流量灯，彻底解决「收缩按钮被流量灯遮盖」的问题。

## 现状（引用真实 file:line）

- `src/components/layout/Layout.tsx:56–74`：全宽 `h-14` titlebar，toggle 按钮在 titlebar 内，用 `pl-24`（96px）水平避让流量灯——脆弱：水平方向的流量灯区域随系统/缩放变化，固定 px 值容易失效，且侧边栏消失后 toggle 与流量灯在同一水平线产生遮盖。
- `src/components/layout/Layout.tsx:79–81`：侧边栏收缩到 `w-0 border-r-0`——完全消失，toggle 孤立在 titlebar 里。
- 无 macOS 平台检测，无垂直方向的流量灯高度避让。

## 改动方案

### 核心对比（当前 vs 目标）

| 项目 | 当前 | 目标（lime 风格） |
|---|---|---|
| toggle 位置 | 全宽 titlebar 内 | 侧边栏头部右上角 |
| 收缩宽度 | `w-0`（完全消失） | `w-[72px]`（icon-only，不消失） |
| 流量灯避让 | 水平 `pl-24` | **垂直** `padding-top: 46px`（macOS）/ `14px`（其他） |
| 全宽 titlebar | 存在（`h-14 border-b`） | **删除** |
| 导航文字 | 始终显示 | 收缩时隐藏，仅图标 + HTML `title` tooltip |
| drag 区域 | titlebar | 侧边栏自身（`WebkitAppRegion: drag`） |

### 数据结构 / 类型

无新增类型，纯 UI 重构。

### 后端

无改动。

### 前端：`src/components/layout/Layout.tsx`

#### 1. 删除全宽 titlebar（第 55–74 行）

```diff
-      {/* 全宽 titlebar — drag 区域，pl-24 避开 macOS traffic lights */}
-      <div
-        className="h-14 border-b border-border bg-card flex items-center px-3 shrink-0"
-        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
-      >
-        <div
-          className="pl-24 flex items-center"
-          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
-        >
-          <button onClick={() => setSidebarOpen(!sidebarOpen)} ...>
-            ...
-          </button>
-        </div>
-      </div>
```

#### 2. 侧边栏改为 icon-only 收缩 + drag 区域

```tsx
<div
  className={cn(
    'border-r border-border bg-card flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden',
    sidebarOpen ? 'w-64' : 'w-[72px]',
  )}
  style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
>
```

#### 3. 侧边栏头部：toggle 按钮 + 流量灯避让

在 `<nav>` 上方新增头部区域，padding-top 用 CSS 变量或内联计算垂直避让流量灯：

```tsx
const isMac = typeof navigator !== 'undefined'
  && /mac/i.test(`${navigator.platform} ${navigator.userAgent}`)

// 头部区域
<div
  className={cn(
    'flex items-center shrink-0 px-3 pb-2',
    sidebarOpen ? 'justify-between' : 'justify-center',
  )}
  style={{
    paddingTop: isMac ? '46px' : '14px',   // 46 = 12 + 34（流量灯高度）
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties}
>
  {sidebarOpen && (
    <span className="text-sm font-semibold text-foreground truncate">
      {t('appName')}
    </span>
  )}
  <button
    onClick={() => setSidebarOpen(!sidebarOpen)}
    className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
    title={sidebarOpen ? t('collapseSidebar') : t('expandSidebar')}
  >
    {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
  </button>
</div>
```

> **注**：用 HTML 原生 `title` 属性实现 hover tooltip，无需引入额外的 shadcn Tooltip 组件（项目当前未安装）。

#### 4. 导航项收缩时只显示图标

```tsx
<Link
  key={item.key}
  to={item.href}
  title={sidebarOpen ? undefined : t(`nav.${item.key}`)}   // 收缩时用 title tooltip
  className={cn(
    'flex items-center rounded-lg text-sm font-medium transition-colors',
    sidebarOpen ? 'gap-3 px-3 py-2' : 'justify-center p-2',
    isActive
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  )}
  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
>
  <item.icon className="w-5 h-5 shrink-0" />
  {sidebarOpen && t(`nav.${item.key}`)}
</Link>
```

#### 5. 底部区域收缩时折叠

```tsx
{sidebarOpen && (
  <div className="border-t border-border p-4 space-y-3 shrink-0"
    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
  >
    <LanguageSwitcher />
    <div className="text-xs text-muted-foreground">
      <p>{t('appName')}</p>
      <p className="mt-1">{t('version', { version: '0.1.0' })}</p>
    </div>
  </div>
)}
```

### i18n

在 `src/i18n/locales/en/layout.json` 和 `zh/layout.json` 各加两个 key：

```json
// en
"collapseSidebar": "Collapse sidebar",
"expandSidebar": "Expand sidebar"

// zh
"collapseSidebar": "收起侧边栏",
"expandSidebar": "展开侧边栏"
```

## 实现步骤

- [ ] 1. `src/components/layout/Layout.tsx`：删除全宽 titlebar（第 55–74 行）。
- [ ] 2. 侧边栏 div：`w-0` → `w-[72px]`，加 `WebkitAppRegion: drag`。
- [ ] 3. 侧边栏头部：新增含 `padding-top` 流量灯避让 + toggle 按钮的头部区域（no-drag）。
- [ ] 4. 导航项：收缩时 `justify-center p-2` + `title` tooltip，展开时还原 `gap-3 px-3 py-2` + 文字。
- [ ] 5. 底部区域：`sidebarOpen` 控制显隐。
- [ ] 6. i18n：en + zh `layout.json` 各加 `collapseSidebar` / `expandSidebar`。

## 验收标准

- [ ] 收缩状态：侧边栏宽 72px，只显示图标，toggle 按钮可见且与 macOS 流量灯无遮盖（垂直方向有间距）。
- [ ] 展开状态：侧边栏宽 256px，图标 + 文字，toggle 在头部右侧，appName 在头部左侧。
- [ ] 全宽 titlebar 已删除，主内容区 `<main>` 占满剩余宽度，无多余顶部间距。
- [ ] 导航项收缩时 hover 显示 `title` tooltip（内容跟随语言切换——中英文正确）。
- [ ] 侧边栏整体可拖动窗口（drag），按钮/链接区域 no-drag。
- [ ] 底部 LanguageSwitcher 和版本信息收缩时不显示（不破坏布局）。
- [ ] Web 模式下 `isMac` 检测正常（非 macOS 时 padding-top 用 14px，无多余空白）。

## 风险与备注

- `navigator.platform` 在现代浏览器已 deprecated，但 Electron 环境下仍可用且稳定，与 lime 完全同款写法。若后续迁移，可改为 `window.electronAPI` 传入平台信息。
- 主内容区 `<main>` 无独立 titlebar，macOS 流量灯视觉上浮在侧边栏上方——这是 `hiddenInset` 的标准用法，符合 macOS HIG（lime 同款）。
- 侧边栏收缩后宽度 72px（而非 0）——主内容区会相应减少 72px，页面布局无需特殊处理，Tailwind `flex-1` 自动填充。
- `transition-all duration-200` 同时处理宽度和 padding 过渡，视觉上平滑。如需更精细控制可改为 `transition-[width] duration-200`。
