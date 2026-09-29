# EvoMap 前端复刻规格说明

> 逆向自 [evomap.ai](https://evomap.ai/) 首页（2026-09 抓取），用于 1:1 模仿其前端风格。

## 1. 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js（App Router + Turbopack）/ React |
| 样式 | Tailwind CSS（v4 风格，`@layer properties` + `--color-*` 主题变量） |
| 组件原语 | Radix UI 无头组件（DropdownMenu、Dialog、Tooltip，靠 `data-state` 驱动样式） |
| 图标 | Lucide（`lucide-arrow-right`、`lucide-chevron-down` 等） |
| 字体方案 | next/font 本地加载，CSS 变量注入到 `<html>` |
| 主题 | `data-theme="dark"` 默认深色，`color-scheme: dark`，支持 light 切换（`light:invert` 处理 logo） |

## 2. 字体系统

三套字体，按用途分工：

| 用途 | 字体 | Tailwind 类 |
|---|---|---|
| 展示 / 大标题 | Rajdhani（几何科技感拉丁字体） | `font-display` |
| 导航 / UI 标签 | Outfit | `font-nav` |
| 正文 / 中文 | HarmonyOS Sans SC（鸿蒙黑体） | `font-ui` |

通过 next/font 的 CSS 变量挂在 `<html>` class 上，Tailwind 里映射成 `font-display / font-nav / font-ui`。

## 3. 设计 Token（CSS 变量，HSL 通道写法）

所有颜色用 `hsl(var(--xxx) / <alpha>)` 消费，深浅双主题各一套值。

### 3.1 背景层级（dark / light）

```
--c-bg:            0 0% 0%      / 0 0% 100%     /* 页面底，纯黑 */
--c-bg-subtle:     0 0% 3%      / 220 14% 96%
--c-bg-elevated:   0 0% 6%      / 220 13% 98%
--c-bg-card:       0 0% 8%      / 0 0% 100%
--c-bg-card-raised:0 0% 9%      / 220 13% 98%
--c-bg-command:    0 0% 12%     / 0 0% 95%      /* 终端/命令行块 */
```

### 3.2 边框（dark / light）

```
--c-border:        0 0% 12%     / 220 13% 91%   /* 默认极细暗边 */
--c-border-strong: 0 0% 16%     / 220 13% 86%
--c-border-hover:  0 0% 24%     / 220 9% 70%
--c-border-command:0 0% 62%/.15 / 0 0% 62%/.5
```

### 3.3 品牌色

```
--c-brand-primary-cyan: 191.4 100% 60.5%   /* 主色，亮青 */
--c-brand-mint:         152.6 100% 44.9%   /* 辅助，薄荷绿 */
--c-brand-amber:        46.8 100% 50.3%    /* 点缀，琥珀 */
--c-brand-rose:         357 74% 72%
--c-brand-body:         0 0% 62%           /* 次级正文灰 */
--c-evox-hero-display:  202 100% 89.4%     /* hero 大标题的淡青白 */
--c-evox-eyebrow:       204 18% 62%        /* 小标 eyebrow 灰蓝 */
```

### 3.4 其他

```
--c-text:          主文本（近似白/近黑，随主题）
--c-overlay:       0 0% 0%/.8        / 220 18% 10%/.55   /* 弹窗遮罩 */
--c-danger:        0 100% 60%        / 0 80% 48%
--c-code-text:     0 0% 68%          / 222 20% 28%
--c-chart-1..8:    图表八色（蓝→青→绿→琥珀→红→紫→粉→深绿）
```

消费方式示例：

```html
<p class="text-[hsl(var(--c-text)/0.55)] hover:text-[hsl(var(--c-text)/0.85)]">
```

## 4. 页面骨架（首页）

```
<html data-theme="dark" class="h-full {字体变量}">
└─ <body class="min-h-full bg-background text-foreground antialiased
               selection:bg-primary/20 font-ui">
   ├─ 顶部 Campaign Banner（可关闭的营销条）
   │    └─ chip 徽章 + 一行文案 + CTA，字极小：text-[9px] font-bold tracking-[0.18px]
   ├─ 导航栏（absolute 吸顶，z-50，bg-transparent）
   │    ├─ 左：Logo（h-7~h-9，暗色下 light:invert 反色）
   │    ├─ 中：Product / Explore / Technology / Platform / Learning / Updates / About
   │    │      （font-nav，Radix DropdownMenu，chevron-down 旋转动画）
   │    └─ 右：语言切换（h-9 w-9 方形按钮）+ GitHub 等社交图标（-space-x-0.5）+ 登录/CTA
   ├─ Hero
   │    ├─ Eyebrow 小标（--c-evox-eyebrow）
   │    ├─ 大标题（font-display，--c-evox-hero-display 淡青白）：
   │    │   "An Experience Network / Powering Agents' Evolution"
   │    └─ 副文案："One agent learns, a million inherit."
   ├─ 产品区（EvoX 主推： swarm agent 下载 + $15 credit 横幅）
   ├─ 技术协议区（GEP — Genome Evolution Protocol 介绍）
   ├─ 终端/代码展示块（--c-bg-command 背景，--c-code-text 文本）
   └─ Footer（--c-footer-heading 标题色，多列链接）
```

## 5. 组件风格要点

- **整体气质**：纯黑底 + 极细暗边（`border-[0.5px]`）+ 亮青主色，"AI 基础设施 / 协议层" 的冷峻工程感。
- **圆角克制**：小元素 `rounded-md` / `rounded-full`（徽章），卡片圆角不大。
- **边框风格**：大量 `border-[0.5px]` 半像素线 + `hsl(var(--c-border))` 低对比色。
- **按钮尺寸**：图标按钮 `h-9 w-9`，文本按钮 `h-9 px-3~4`，密度偏高。
- **交互反馈**：
  - 文本链接：`text-[hsl(var(--c-text)/0.55)]` → hover 升到 `0.85`，`transition-colors duration-200`；
  - 箭头图标：hover 时 `group-hover:translate-x-0.5` 微位移；
  - chevron：`transition-transform duration-200`，菜单展开旋转。
- **排版细节**：导航统一 `font-nav`；eyebrow 小字大写宽字距（`tracking` 加宽）；正文 14px 级别（`text-[14px]`）。
- **选中文本**：`selection:bg-primary/20` 青色半透明高亮。
- **Radix 用法**：`data-state="open/closed"` 控制动画与样式，`aria-haspopup="menu/dialog"`，id 形如 `radix-_R_xxx_`。

## 6. 最小复刻清单（MVP）

1. Next.js + Tailwind v4 项目，`@theme` 里定义 `--color-*`，另起 `:root`/`[data-theme]` 定义上表 `--c-*` 变量。
2. next/font 接入 Rajdhani / Outfit / HarmonyOS Sans SC，映射 `font-display/nav/ui`。
3. `body` 用 `bg-background text-foreground antialiased selection:bg-primary/20`。
4. 装 `lucide-react` + `@radix-ui/react-dropdown-menu` `@radix-ui/react-dialog`。
5. 先做三个件：吸顶透明导航（Radix 下拉）、黑底细边卡片（`bg-[hsl(var(--c-bg-card))] border-[0.5px] border-[hsl(var(--c-border))]`）、命令行块（`--c-bg-command`）。
6. Hero：`font-display` 超大标题 + eyebrow + 一句副文案，青色系高亮关键词。
