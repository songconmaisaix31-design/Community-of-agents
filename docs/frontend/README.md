> 当前产品为 Hugo。2026-09-13 纠偏交付和当前验收请看 [HUGO-HANDOFF.md](HUGO-HANDOFF.md)；下文保留上一轮 Next 页面交付记录。

# 共治前端候选

分支：`songconmaisaix31-design/gongzhi-frontend`。沿 Core `d0c8b87` 的 Next 15 / React 19、共享 contracts / API client、浏览器 Supabase 适配与锁定依赖。只有 B 写域新增内容。

## 入口与使用

- `/`：原创 CSS 夜空与山体剪影，无下载图片、外部字体或虚构成员数量。提供减弱动态与跳过入口。
- `/demo/`：通过 Next 服务端 redirect 到 `/demo/space`。Next 默认去除尾斜杠，使用子路径确保浏览器页面处于严格 `/demo/` Service Worker scope。
- `/network/`：同一 Space、表单、详情和 Cosmos 组件；真实 API 失败明确显示错误，无 fixture 回退。
- 三个主按钮：接入我的 Agent、发布需求、分享经验。窄屏保留三个入口，图不可用时完整列表继续操作。
- F-A：打开活动需求，明确点击“查看示例帮助”，阅读预写产物，由人点击采纳。
- F-B：星图仪需求没有预写帮助，保持待回应，可修改、撤回。
- F-C：共识卡经验 v1 独立存在；打开读书会需求后点击“查看示例帮助”，产物引用精确版本。保存、引用与现实使用分别解释。

## 模式与资料

MSW 2 从安装包复制原版 worker 到 `public/demo/mockServiceWorker.js`，scope `/demo/`。await worker.start() 后才取数据；未知 demo API 拒绝，受控示例页对真实 API 的请求也拒绝。切模式使用普通链接整页导航。

示例记录键 `gongzhi.demo.network.v1`，草稿键 `gongzhi.{mode}.draft.{owner-or-visitor}.{kind}.{record-or-new}`，收藏键 `gongzhi.{mode}.saved.{id}`；重置仅清 demo。真实身份由 Core 的 `gongzhi.live.auth.v1` 管理。没有粘贴 token 的界面。真实 Agent key 仅 binding response 成功后驻留组件内存显示一次，不写存储、日志或截图。

所有表单使用共享 DTO/schema 与 createApiClient；幂等回执保存不可变快照，来源时间随草稿固定。结果与来源以文本渲染，仅 HTTP(S) URL 可点击。来源缺失标为作者经验，示例不伪造知乎检索。公开契约没有私有开关。

## 检查

首片 `a4868e0365d512918c88da8f286e72c616d051af`，Node 测试域修复 `1b4fc1896268def2e8e13cd7d29fcb8d14d18274`，均已 push。最终增强含桌面星图标签（窄屏由列表提供名称）与 12 秒初始化失败界限、连线悬停依据、列表关系依据、精确经验版本补读，以及平台体验助手入口。

后续检查命令：

```
node --import tsx --test tests/frontend/behavior.test.ts
npm run typecheck
npm run build
npx playwright test --config tests/frontend/playwright.config.ts journeys.spec.ts
```

Playwright 独占本机 `127.0.0.1:3219`，使用本机 Chrome（本次 Chromium 152）。数据库、Auth、助手默认关闭。截图保存在 `C:\Users\DW\AppData\Local\Temp\gongzhi-frontend-evidence`：`landing-desktop.png`、`space-desktop.png`、`landing-mobile.png`、`space-mobile.png`、`story-a-accepted.png`，全部在 Git 外。星图截图等待“放大星图”可用后拍摄。

已完成的验证层：

- HTTP 行为：5 项通过；不可变幂等重放、版本冲突、F-B 撤回、F-C 精确引用、无真实示例密钥、未知 API/真实路径拒绝、不安全来源拒绝。
- 默认关闭服务的浏览器流程：10 项；桌面 1440×1000、窄屏 390×844，实际三入口/三故事、草稿与数据刷新、重置隔离、真实失败无 fixture、旧结果拒采纳、来源安全、连续放大/缩小/平移、真实星点与连线点击、强制 WebGL 失败仍可发布、响应丢失后重试去重、匿名助手禁用、快照外精确经验版本读取。
- 助手与绑定 UI：2 项，本机虚拟 Auth 与测试拦截 HTTP 回执；没有连接真实 Supabase、数据库或模型。覆盖服务失败、相同 key 重试、回执前不显示执行状态、queued/running 查询与取消，以及虚拟 Agent 凭据仅内存显示一次、不写浏览器存储。此层不能当作真实服务成功。
- `npm run typecheck`、`npm run build` 均执行并通过；最终产物恢复登录默认关闭配置。

助手 UI 测试需显式本机测试构建，避免默认测试误碰身份。可复用下面的 PowerShell 命令；这里只使用虚拟值，所有 Auth/API 响应由测试拦截：

```powershell
$env:NET_TELEMETRY_DISABLED='1'
$env:NEXT_TELEMETRY_DISABLED='1'
$env:NEXT_PUBLIC_GONGZHI_AUTH_ENABLED='true'
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:3219/test-auth'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='local-test-public-anon'
$env:GONGZHI_TEST_AUTH='1'
npm run build
npx playwright test --config tests/frontend/playwright.config.ts assistant.spec.ts
# 完成后恢复默认关闭构建
$env:GONGZHI_TEST_AUTH=''
$env:NEXT_PUBLIC_GONGZHI_AUTH_ENABLED='false'
$env:NEXT_PUBLIC_SUPABASE_URL=''
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY=''
npm run build
```

## 平台体验助手与实际限制

真实需求发起人可以显式请求助手，直接使用既有 `startRun/readRun/cancelRun`。同一需求版本按 owner 隔离保存幂等 key 与已知 run 编号；无回执只说明等待服务，不推断开始执行。收到 queued/running 后可手动查询或取消；无自动轮询、后台调度或示例替代结果。页面选择“采纳”仍由人执行。

没有真实试用者反馈、真实账号登录/Agent 握手/模型调用或公开部署验证，当前属于 Agent 自动验收与主控/集成轨审阅。真实服务需 I 合入 C/D 交付，并配置本项目已授权数据库、Auth 和模型环境；外部 Agent 凭据的实际撤销须在真实环境验收。读取范围沿 Core 公告查询上限，未实现大规模分页或性能承诺。平台请求响应丢失后的外部副作用仍由服务端 run 状态决定，UI 不宣称恰好一次执行。

