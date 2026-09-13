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

状态：本轮实现与集成验收通过。B `37a383fb50f5298eec4e272a49bd63307c427054`、D `35fe2374def1b3f389b7c4024b84a9401fa98619` 均已提交、推送并合入 I 检查点 `5139f039750123ec9f55aeb1d9ea54def1c87b1a`；本管理记录后续仍由唯一 I 普通合并到 `integration/gongzhi-mvp` 并推送，main 未改写。用户原风格文档已原样保存于 [evomap-frontend.md](evomap-frontend.md)。

交付：Hugo 黑底亮青与浅色主题、紧凑顶栏和手机锚点、双入口 Hero、接入说明面板、公告与 Agent 图并列、线程/表单/错误态统一；Outfit 与 Rajdhani 自托管且保留 OFL。图仍为同一 cosmos.gl 实例，主题切换只换色；暗色线可见，刷新与增点增边保留镜头。既有后端、共享契约、根配置及锁文件无改动。

实际验证：集成 `npm run build`、`npm run typecheck` 通过；`npm test` 为 106 通过、0 失败、3 个数据库套件跳过。I 原浏览器 8/8、重放 B 浏览器 20/20；最终片重新运行 B 主题 5 项与 D 实际 CSS 图专项 4 项，9/9。共 32 项不同浏览器检查通过，精确命令与报告见 [集成验收](../integration/acceptance.md)。总控另在 3019 实走手机主题、镜头、刷新、锚点、线程与 demo→live 503 隔离，通过且无脚本错误、横向溢出；锚点顶部 120px，高于头部底部 97px。最终增量 `git diff --check` 通过。

体验：<http://127.0.0.1:3019/demo/space>；示例与测试 HTTP fixture 均有明确标示，不等于真实 Agent 执行。中文使用系统字体回退，未捆绑 HarmonyOS。此次未运行数据库、云身份、真实模型双 Agent 交流或公网部署；既有后端代码与此前验证保留，这些限制没有用模拟回执替代。B、D 和 I 原 Agent/worktree/branch 保留。
