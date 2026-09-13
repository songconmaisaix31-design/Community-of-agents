# 共治集成验收

2026-09-13；分支 `integration/gongzhi-mvp`。最终实现验收目标 `19aeb6cab95021d1d5c1a5ca967b097ff32d4398`，包含 Core `004404e`、Connect `97d9189`、Frontend `3d57b68`，以及中文 layout 装配与 Integration 测试。三轨实现已统一，初始检查点 `079242d` 的全量测试失败已修复；以下检查全部针对该统一实现，后继仅追加验收/管理文档。

## 已实际执行

| 命令 / 层次 | 当前结果 |
| --- | --- |
| `npm ci --prefer-offline --registry=https://registry.npmjs.org --no-audit --no-fund` | 退出 0，沿锁文件；B 后继未改依赖或锁，按总控要求未重复安装 |
| `npm run typecheck` | 构建完成后独立复核退出 0；不要与 build 并发，重建 `.next/types` 会引发短暂 TS6053 |
| `npm run build` | 退出 0，Next 15.5.25 生成入口、demo、network 与 API；脚本仅 `next build`，不含迁移 |
| `npm test`，启用 Core 专用 PG 与 localhost HTTP，关闭 I HTTP DB 开关 | 101 pass / 0 fail / 1 skip；唯一跳过项在下一独立进程执行 |
| `node --test tests/integration/live-http.test.mjs`，只启用 I HTTP DB 开关 | 7 pass / 0 fail / 0 skip；实际 Next HTTP + PG，A 发布、B 外部 Agent 读写、A 采纳、越权/旧版本/撤销拒绝、幂等及 Next 重启后记录保留；关闭的助手返回 503，无虚构 run |
| `node node_modules/playwright/cli.js test --config tests/integration/playwright.config.ts` | 最终统一实现 8/8 通过、0 skip；桌面 1440×960 / 窄屏 390×844，截图在下述 final 目录 |
| `node node_modules/playwright/cli.js test --config tests/frontend/playwright.config.ts journeys.spec.ts` | I 在统一分支实跑 B 的 10/10 浏览器测试；包括星点/引用连线点击、连续缩放/平移、图失败仍可发布、响应丢失后去重；其中匿名助手/快照外版本读取一项采用测试 HTTP 回执，不算真实服务读取 |
| 浏览器用户流程 | 自然入口、三表单；F-A 预写帮助须手动触发与采纳，新需求不自动出现帮助；F-B 待回应、修改、撤回；F-C 独立经验、保存不等于引用、精确 v1 引用；刷新草稿、旧版拒采纳均通过 |
| 浏览器边界 | 实际 SW scope `/demo/`，未知示例 API 503，示例请求真实 API 409；整页 `/network/` controller=null，真实 network 503/live 且无 fixture；两模式草稿独立，重置保留真实存储 |
| Cosmos | 两种宽度均观察到 ready；统一分支实际验证放大/缩小/复位、平移改变位置、星点打开同一记录、版本引用连线打开依据；强制 WebGL/GPU 不可用时明确降级，列表仍可搜索与发布 |

先执行 Core PG 套件，再执行 I HTTP PG 套件，不并发使用同一库。`live-http.test.mjs` 在两个数据库开关同时存在时明确拒绝启动；不要把 `--test-concurrency` 追加在 npm 脚本的文件列表后当作可靠串行保证。

```powershell
$env:GONGZHI_TEST_DATABASE_ENV = 'C:\Users\DW\AppData\Local\Temp\gongzhi-integration-ZP8gyl\database.env'
$env:GONGZHI_TEST_BASE_URL = 'http://127.0.0.1:3019'
Remove-Item Env:\GONGZHI_TEST_HTTP_DATABASE_ENV -ErrorAction SilentlyContinue
npm test
$env:GONGZHI_TEST_HTTP_DATABASE_ENV = $env:GONGZHI_TEST_DATABASE_ENV
Remove-Item Env:\GONGZHI_TEST_DATABASE_ENV
node --test tests/integration/live-http.test.mjs
```

## 保留的本地体验与证据

入口：<http://127.0.0.1:3019/> → `/demo/` → `/demo/space`；真实空间 <http://127.0.0.1:3019/network/>。最终 Next PID `79920` 仅监听 `127.0.0.1:3019`，命令为 `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3019`；数据库、Auth、助手开关均关闭，遥测关闭。中文 lang/title/description 与本地全局样式由 layout 装配，无外网字体。

浏览器为 Playwright 1.63.0 驱动已安装 Chrome `152.0.7977.83`，使用独立 context。最终截图/报告在 Git 外：`C:\Users\DW\AppData\Local\Temp\gongzhi-browser-I-20260913-final`，`report.json` 记录 8 项通过；`results/browser-acceptance-natural-acf1d--exact-experience-reference-{desktop,narrow}/` 包含 `landing.png`、`demo-space.png`、`human-accepted.png`、`version-reference.png`。I 已查看桌面/窄屏最终截图；B 旅程复跑截图在 `C:\Users\DW\AppData\Local\Temp\gongzhi-frontend-evidence`。总控已对前一实现检查点 `c21f22a` 独立完成首页→示例发布→真实错误/无 SW 控制体验，本最终实现继续交总控复核。

保留原专用容器 `gongzhi-integration-73b8bb40-8d6`，仅 `127.0.0.1:56406`，PG 17.11 / vector 0.8.6，已应用 10 个迁移；`crier_app` 无 superuser / BYPASSRLS。本轮未重建、清空或修改其他数据库；业务测试只写随机命名记录，凭据仅使用总控已授权的上述 Git 外 env。

## 真实限制

Supabase Auth 是本地 HTTP stub，不是云 Auth；PG 为专用真实数据库。SDK 测试使用官方 MockLanguageModelV4，知乎使用测试传输；未调用付费模型、真实知乎或读取其他项目凭据，不能据此宣称模型/云登录/真实外部 Agent 完整联机通过。示例故事为明确标识的预写内容。没有真实用户试用反馈、公开部署、生产迁移或正式赛事提交。

B 另报告助手状态/同 key 重试/取消与绑定凭据一次展示 2 项测试通过，使用虚拟 Auth 构建和拦截 HTTP 回执，详见 `docs/frontend/README.md`；I 未重复该特殊 Auth 构建，保留默认关闭预览。本轨通过实际 Next HTTP + PG 确认关闭助手返回 503/unavailable 且无虚构 run，不声称助手模型实际执行成功。
