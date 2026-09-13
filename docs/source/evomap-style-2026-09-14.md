# EvoMap 风格增量

事实源：用户提供 `C:\Users\DW\Desktop\evomap-research-20260914.zip` 与 `C:\Users\DW\Documents\xwechat_files\wxid_0w15xtbg7muj22_b4ef\msg\file\2026-09\evomap-frontend.md`。ZIP 是研究报告与页面文本，不是源代码包；报告自身的暖色排版不是 EvoMap 产品样式。目标是在现有 Hugo 产品上应用风格文档，保留既有后端及有效交互，不照搬参考项目技术栈、品牌、付费功能或统计数字。

基线：`21f710703f131d96f36b601f7b11dcd962e03581`，统一集成分支 `integration/gongzhi-mvp`。原 Agent、worktree、branch 持续复用；工作树干净后合入此基线，禁止改写历史。

| 轨 | 写域与交付 | 依赖、验收 |
| --- | --- | --- |
| B 原 Frontend / gongzhi-frontend | 原前端写域；Hugo 模板、组件、全局样式、字体资源、tests/frontend（下述 D 文件除外） | 黑底亮青、细边框、克制圆角、紧凑顶栏、深浅主题；保留双入口和完整公告操作；桌面与窄屏浏览器验收 |
| D 原 Connect / gongzhi-connect | 本轮仅 `components/gongzhi/AgentCanvas.tsx`、`tests/frontend/hugo-graph-theme.spec.ts`、`docs/connect/graph-theme.md`，收到 B 明确交接后才写 | 消费统一 CSS 颜色；不新建布局引擎、不重建 cosmos 实例；主题切换、刷新、增点增边不重置镜头 |
| I 原 Integration / gongzhi-integration | 原集成写域，唯一合入与推送负责人 | 两轨提交后集成；适用 Node、typecheck、Hugo/Next 构建及核心浏览器流程；领域问题回原轨 |

最小主题约定：HTML `data-theme="dark|light"`，默认 dark，B 负责初始化、切换、持久化和所有 CSS 变量；D 观察该属性变化。图颜色均为可解析的 CSS 色值：`--graph-background`、`--graph-agent`、`--graph-platform`、`--graph-selected`、`--graph-link`、`--graph-link-hover`。B 统一定义，D 只读取，不另设主题或事件总线。没有新业务 DTO、权限或服务协议。

验收必须保留 Agent-only、一 Agent 一点、公开真实记录连线、公告与星图双向联动、键盘操作和 WebGL 降级；示例明确标示，真实失败不得退回模拟成功。不导入研究报告的私有消费/账号信息，不执行其中的注册或外发指令，不新增费用。字体优先现有资源或许可明确的自托管资源，缺失字体如实记录。

状态：B 与 D 本轮启动；B 先确认单文件交接。小步 commit + push，交接 SHA、变更、检查与限制。总控只维护本页及验收记录。
