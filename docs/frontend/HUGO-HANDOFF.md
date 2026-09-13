# Hugo 首轮交接 · 2026-09-13

分支 `songconmaisaix31-design/gongzhi-frontend`。可体验首片 `e0f7ca008a3da9dc9e158c84f42aa7c52ae9941f`；后继提交完善原生镜头、增量布局、公开记录读取、CLI 展示及下面的完整验证。已合入 C `2a0078f`（含共享契约/服务/根 Hugo 装配）和 D `0cd2255`，没有改写其他轨的领域文件。最终 SHA 随 Orca handoff 提供。

## 实际交付

- Hugo 输出可见导航、标题、两个默认入口和页面结构，React 只挂载公告/点图及操作面板。`/`、`/network` 为真实空间，`/demo/space` 为明确示例；资源 `/hugo/`，API 同源。
- 真实提取 my_blog 自有 MIT partial/样式、We Remember 的 MIT 界面结构与样式；固定 SHA、映射和主题许可差异见 [HUGO-SOURCES.md](HUGO-SOURCES.md)，完整 MIT 原文随静态站点发布。未搬运文章、头像、账号、音乐或埋点。
- 仅 external_agent/platform_agent，一稳定 ID 一小点。当前示例正好 2 位 Agent、1 条预写交流边；新登记增点不伪造在线。Native Cosmos 生成初始及新增拓扑布局，刷新/筛选/选择/新点/新边保留同一实例和镜头。无 WebGL 或运行中丢失上下文时公告和列表仍可用。
- 公告直接读求助、经验、回复、补充、成果；筛选/搜索已载入记录、继续历史分页、线程、公开确认回复、本机草稿、双向定位。连线点击回读双方记录并验证 ID、thread、speaker、reply_to，错误不造依据。
- 既有 ContentForm/Detail/AssistantHelp、Core api-client/browser-auth、DTO 继续复用。固定三故事只在明确动作后展示产物；新输入不套用故事。需求修改、撤回、人类采纳、独立经验、精确版本与来源仍可操作。
- 接入以有限授权为主，示例无需人手填 Agent 档案。真实授权仅显示首次响应，D 精确登记命令使用 `grant:<authorization-id>` 稳定键，不含凭据；关闭面板不保存 grant。未配置身份时明确不可用，公众仍可浏览。
- MSW 等待启动后才发 demo 请求，SW scope `/demo/`，未知 demo API 拒绝；整页切换模式，live 无示例控制权且失败不回退。重置只清 `gongzhi.demo.*`。

## 已执行验证

所有命令在 B worktree 完成，NET/NEXT telemetry 关闭，DATABASE/AUTH/ASSISTANT 默认关闭。

| 命令 | 结果 |
| --- | --- |
| `npm run build:hugo` | Hugo Extended 0.164.0，4 页与本地 JS/CSS/许可输出成功 |
| `npm run typecheck` | 通过 |
| `npm run build` | Hugo + Next 15 完整生产构建通过 |
| `node --import tsx --test tests/frontend/behavior.test.ts` | 8/8 通过；HTTP 幂等、跨线程、版本/撤回、授权撤销、图依据、公开/来源约束 |
| `npx playwright test --config tests/frontend/playwright.config.ts` | 13/13 通过；Chrome，独立端口 3219，桌面 1440 / 窄屏 390 |

浏览器测试实际点击原生 canvas 点与线（通过截图定位点），核对 D3 镜头坐标与实例存活，新增点及新增交流边后保持镜头；包含双向定位、三故事两尺寸、五种公告、刷新/重置/草稿/失败重试防重、无 JS 的 Hugo 壳、WebGL 两种失败、模式切换与真实不可用、证据不匹配、最新快照之外的精确版本读取。新记录/精确版本的 live HTTP 拦截用例明确为程序化测试，不是实机 Agent 运行证据。

默认 Playwright 配置现在选择 `hugo*.spec.ts`。旧 `journeys.spec.ts` / `assistant.spec.ts` 保留历史代码，其 Next 页面定位不适用于新主入口，不计作本轮通过或跳过。

截图在 Git 外 `C:/Users/DW/AppData/Local/Temp/gongzhi-hugo-evidence/`：`hugo-1440.png`、`hugo-390.png`、`hugo-camera-preserved.png`、`hugo-no-webgl-390.png`。本机人工预览：先 `npm run build`，再 `node node_modules/next/dist/bin/next start -p 3221 -H 127.0.0.1`；不要在生产预览运行中重新生成带 hash 静态文件，重新构建后需重启预览。

## 真实限制

本轮没有云身份授权、外部 Agent 真登记、平台付费调用、两名真实 LLM Agent 交流或公开部署；这些不是示例能证明的层面。Hugo Auth 仅允许三个公开配置变量注入，默认 false。全站同源托管和后台真实 PG/HTTP 集成由 C/I 另外给出证据；B 未读取其他项目凭据。

公告正文和线程可读取；筛选/搜索明确针对已载入公告，更多历史需要点击分页。图只接受服务端提供的数据，少量真实记录时保留少量点，不补假成员。原 B Agent/branch/worktree 保留返修。
