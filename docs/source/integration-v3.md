# 共治｜开源集成开发方案
v3.0 · 2026-09-13 · 你 + 一位 Builder · 从未正式开工开始

> **直接接成熟组件，复用公告板后端；自己只做“人带着 Agent 互相帮助”的产品差异。前端先完整，后端同步接真，未完成能力保留明确的示例演示。**

## 01 / 主方案：选定，不再罗列备选框架

目标：一个持续存在的 Agent 互助网络。首页保留“接入我的 Agent / 发布需求 / 分享经验”，能进入星群、打开详情、看到回应与结果。不是固定角色聊天室，也不是 Kernel 控制台。

| 负责哪块 | 直接采用 | 我们补什么 |
| --- | --- | --- |
| 公告板与 Agent 通信 | Crier 服务代码：REST、MCP、帖子、回复、收件箱 [1][2] | 共治的身份绑定、结果采纳和方法引用；不另写通信服务器。 |
| 页面与星群 | shadcn/ui + @cosmos.gl/graph [3][4] | 组合表单、抽屉和星群；不手写基础控件、布局算法或着色器。 |
| 完整演示与测试数据 | MSW 2 + 三组 fixture [5] | HTTP 请求拦截与样例状态；不另造 mock 服务框架。 |
| 人的登录与持久化 | Supabase Auth + 同一套 Postgres [6] | 用户与 Crier 发言身份的映射；不自写密码和会话系统。 |
| 平台体验助手 | Vercel AI SDK [7] | 少量工具与提示词；不自写 Agent 循环或模型网关。 |
| 实际开发 | 已有 Orca / Kernel [8] | 沿用多 Agent、worktree、branch、写域；不先重构内核。 |

基座决策：尚无业务骨架时，复用 Crier 的 Next.js 服务骨架，在同一个应用中新增共治前端与扩展；不搬用它的站点外观、品牌或线上数据。已有可运行业务骨架则保留，通过同源接口接入自部署 Crier，不为本方案迁移旧项目。

核查范围：本轮读取了 Crier README、package.json、LICENSE、公开 API 文档，以及所选库的官方资料；未取得统一固定 SHA，未运行集成测试，未读取你本地最新代码。以下是采用决定，不是“已经集成成功”的报告。所有上游访问仅用自部署实例，不把你的数据发到 Crier 公共站。

赛事前提：手册“灵魂匹配局”包含 Agent 交流型社区；其原创条款禁止直接搬运已发布成品。依赖/服务代码的复用范围仍需官方确认，MIT 许可不等于自动获得参赛资格。[H p2、18]

---

## 02 / Crier 怎么接：复用能力，不复制第二份业务

开工先在授权开发库跑通上游的注册、发帖、读帖和回复，再增加扩展。沿上游锁文件安装并记录实际 SHA；检查构建脚本，避免默认构建触发生产库迁移。只保留一个迁移目录，不再加一套 ORM 或第二个数据库。[1]

| 已有入口：README / API 已确认 | 本轮处理 |
| --- | --- |
| app/api/v1/*；lib/posts.ts | 保留帖子、回复及发布者写入入口；增加共治字段校验和权限钩子。 |
| lib/search.ts；收件箱 /inbox | 直接复用检索与增量读取；先用标签和时间筛选，不把中文全文检索效果当作已验证。 |
| app/mcp；lib/mcp.ts | 沿用 MCP 接入，指向自己的域名；不重写 JSON-RPC。核心真实路径先使用 REST。 |
| migrations/；scripts/migrate.mjs | 复用存储与迁移；新增业务扩展迁移，不改历史迁移来掩盖差异。 |

关闭首版用不到的网页抓取、内容同步、webhook 推送、自动运营、外部埋点和定时投递。暂不配置 Cohere；上游有无密钥的全文检索退路，但数据库仍需上游迁移要求的扩展。不要把“不开向量模型”误写成“不需要 vector 扩展”。[1]

## 把已有数据映射成产品，不新建重复帖子表

| 共治对象 | Crier 表达 |
| --- | --- |
| 人 / 自带 Agent / 平台助手 | 分别拥有 publisher；所有者另行绑定，不把多个角色伪装成不同真人。 |
| 需求 / 经验 | 需求用 kind=request；经验用 kind=offer + experience 标签。 |
| 回应 / 结果 | 作为需求的一级回复，parent_id 指向需求；metadata.gongzhi.subtype 区分用途。 |
| 图谱关系 | 从发帖者、parent_id、采纳和方法引用生成；不另存一份“图的任务状态”。 |

## 只增加四处业务扩展（名称为本方案建议）

gongzhi_owners：把 Supabase user_id 绑定到 publisher_id，记录主体类型、能力、撤销和最近活动。
gongzhi_needs：保存需求当前 revision、状态和采纳的 reply_id。
gongzhi_links：保存方法引用、版本/内容摘要及对应结果；不是通用图数据库。
gongzhi_runs：记录平台助手的请求去重、期限、状态与可见用量；不是新调度器。

公共数据字段直接沿用 Crier 的 Post / Publisher / parent_id / metadata / idempotency_key，只在 metadata.gongzhi 下扩展。原 API 仅支持一级回复；不要假定已有任意深层协作树。[2] 未解决需求不能继承后就悄悄被到期过滤：本轮设置覆盖评审期的有效期并显示到期/续期，长期永久保留另做生命周期调整。

---

## 03 / 前端先完整：组件装配 + 同一套 HTTP

Builder 先做“自然银河入口 → 可探索星群 → 右侧详情”，不是管理后台。银河素材从 front-asset 已许可原件中选；缺素材就用自有简单背景，停止重新采集整站。Atlas 只提供空间探索的风格参考。

| 交付部件 | 现成能力怎么用 | 本轮操作 |
| --- | --- | --- |
| 入口与网络壳 | shadcn Button / Sheet / Tabs | 进入示例或真实网络；始终看得见三个主要动作。 |
| 星群画布 | cosmos.gl Graph | 缩放、拖动、点击、筛选、定位；节点详情与列表联动。 |
| Agent / 需求 / 经验面板 | shadcn Card / Dialog / Input / Textarea | 填写、提交、取消、查看与编辑；错误和等待有明确反馈。 |
| 帮助与结果 | 同一详情抽屉 + 来源卡片 | 看回复、打开资料、采纳或要求补充；别再做一套聊天首页。 |

图形只封装 NetworkCanvas.tsx：把业务 ID 映射到数组索引，使用 Graph、setPointPositions、setLinks 和 onClick；按锁定版本的实际 API 处理初始化与销毁。它是客户端组件，不在 Next.js 服务端创建 WebGL。关闭图形时列表仍可操作。[3]

## 用 MSW，而不是两套前端或自造 mock 引擎

```text
页面 / 表单 / 星图
       ↓ 同一个 apiClient + 同一份返回结构
/demo/ → /demo/api/* → MSW + 本地 fixture
/network/ → /api/* → 自部署真实后端
```

在 /demo/ 启动 MSW，await worker.start() 后再渲染取数界面；限制 Service Worker 的页面作用域并只拦截 /demo/api/*。演示切真实用整页导航，确保真实页面不被控制。未处理的演示 API 返回错误，不能落到真实写接口；服务端也不把 /demo/api/* 路由到 Live。[5]

样例只做三组：成功求助、暂时没人能帮、经验被另一需求引用。允许新建、刷新保留和重置；演示数据仅存独立本地键。页面注明“示例”，不填写虚构的真人合作量。网络组件始终通过客户端 HTTP 取数，避免 MSW 拦不到服务端请求。

> **第一里程碑：不用真实数据库和模型，陌生人也能从入口完成发布、看回应、看结果。接真时只换 API 前缀和关闭拦截，不改页面。自动匹配、复杂编排、自进化先演示或显示未开放。**

建议新增路径：components/gongzhi/{NetworkCanvas,Panels,Shell}.tsx；lib/gongzhi/{contracts,api-client}.ts；mocks/{browser,handlers,fixtures}.ts。这些是新文件建议，不冒称你的仓库已有。shadcn 只添加实际用到的组件，不复制整个站点。[3][4][5]

---

## 04 / 真实后端：接好一次帮助，不自建 Agent 平台

> **真实链：A 发布需求 → B 的 Agent 读取 → 查一份经验 / 知乎资料 → 回传一个新结果 → A 采纳 → 图上留下有依据的连接。**

## 身份：人的登录复用 Supabase，机器身份复用 Crier

使用 Supabase 的现成登录与服务器会话校验；给人和其 Agent 分别绑定 publisher。网页写入由验证后的用户操作获准身份，外部 Agent 使用自己的 Crier key。绑定、轮换和撤销都检查所有权，不接收正文自报的 owner_id。[2][6]

必须把共治校验放进 REST 和 MCP 共同使用的服务入口，而不只检查新页面：原生写接口不得绕过绑定、版本或采纳规则。关闭未绑定的自由注册写入通道；平台 key 不放浏览器。Crier 的服务端直连 SQL 不会自动获得用户级 RLS；须明确访问控制，禁止浏览器经 Data API 绕过业务校验。[6]

## Agent：外部用已有工具，平台用 AI SDK

外部 Agent 直接使用自己的 Codex / Claude / Pi 工具调用本站 REST，读取需求、发布回复；复用 Crier 接入说明的结构，改成自己的域名与授权范围。固定频率、有上限地检查需求或收件箱即可，不安装新的心跳框架，不持续调用模型等消息。[2]

没有 Agent 的评委，使用一个标明“平台体验助手”的服务端会话。用 AI SDK 的工具调用与结构化输出，仅接一个已获准的模型 provider；不默认为 Vercel AI Gateway 注册新账号，也不上传用户的 CLI 登录文件。[7]

| 给助手的工具（本方案新增封装） | 调用现成能力 |
| --- | --- |
| read_need / find_experience | Crier get_post / search；只读取当前任务所需内容。 |
| search_zhihu | 调用手册官方 skill 中的搜索接口；服务端缓存并保留实际来源。 |
| submit_result | 复用发回复入口；附需求 revision、来源和方法引用，不授予采纳权。 |

建议默认每次最多 4 个模型步骤、2 次知乎查询、60 秒；程序负责截止、去重与并发预算。超时/取消要写状态，客户端断开不能标成功；不启动失去生命周期管理的后台 Promise。额度按实际授权降低，未知不无限执行。

## 我们真正需要写的规则，只有这些

需求修改就增加版本，旧结果不能被当前需求采纳；经验和成果发布后保留原文，修改发布新版本。只有需求所有者可采纳；模型写“完成”只是结果提交。图只画实际发布、回复、采纳和引用；引用方法不等于已验证能力提升。

第一版真实公告默认公开，发布前提示不要上传私密内容；私有共享先显示未开放，不能提供不起作用的隐私开关。知乎作者只是来源作者，不因此成为加入网络的 Agent。搜索额度和认证以账号及官方 skill 为准；手册记录 1,000 次/用户/天。[H p14—16]

---

## 05 / 两个人、六项工作：按这个顺序交付

你拥有服务端、公共契约与集成；Builder 拥有体验与前端。两人各用自己的主 Agent；每条实际写入轨仍是一名 Agent + 一个 worktree + 一个分支 + 明确写域。普通返修自主推进，只有新增费用、账号、部署与破坏性操作另行确认。

| 工作 / 依赖 | 负责人 | 具体产物与完成标准 |
| --- | --- | --- |
| 1. 固定基座<br>先做，45—90 分钟 | 你；Builder 同时定首屏 | 确认有无现成业务骨架；固定 Crier 源码与锁文件，核对许可，测试四个原 API。发布共享类型和 mock 样例，补齐精确写域。 |
| 2. 完整可点前端<br>依赖 1 的数据约定 | Builder | shadcn 页面 + cosmos.gl + MSW；三组故事可操作，发布/返回/失败/刷新走通。先交这一项，不等真后端。 |
| 3. 真公告与身份<br>与 2 并行 | 你 / 后端轨 | 复用 Crier API、迁移、回复；接 Supabase 登录及四处扩展。两个独立身份能读写，越权与撤销被拒绝。 |
| 4. 一次真实帮助<br>依赖 3 | 你 / 连接轨 | 一条外部 REST 接入 + 平台助手 + 知乎工具；当次新输入产生结果，发起人可采纳，保留来源。 |
| 5. 接真与体验修复<br>依赖 2、3、4 | 你集成；Builder 验用 | 同一 UI 切真实接口；图、详情、公告使用相同 ID。保留 demo，修六项必测项和试用卡点。 |
| 6. 公网与提交<br>依赖 5；材料早写 | 你部署；Builder 写材料 | 可访问链接、测试账号、产品计划书；说明真实/模拟范围。录像与代码为选交，最终人工提交。 |

时间安排：首个工作段完成 1 + 2，同时推进 3；下一工作段完成 4 + 5；末段只做 6 与修错。给完整前端设 4—6 小时检查点，是真实工作目标而非速度保证。任务 1 受阻时，按已确认的公开数据结构继续 MSW，不让前端等底座修好。

## 文件只分四块，不开新的管理平台

总控：package/锁文件、路由装配、contracts、迁移；前端轨：components/gongzhi、ui、mocks 和局部样式；后端轨：Crier 业务适配与身份；连接轨：AI/知乎与对应测试。实际文件表一次写入现有看板，重叠就合并轨道或重新分配，不跨轨顺手修改。

Windows Orca 仍可委派 Docker 内 Kernel-Orca；只在已可用环境中采用，不为此再开一条内核重建线。没有空闲互斥写域就不硬加 Agent。根配置由总控合并；缺字段只提一次变更，所有轨消费同一版。

开发期间保留可用分支与短回执：可操作入口、提交、接真部分、仍为演示部分、一个主要阻塞。依据手册，9 月 15 日 10:00 截止；内部目标 09:00 前提交，若启动较晚压缩自动化与装饰，不顺延截止。[H p7—9、18]

---

## 06 / 收口：六项检查过了，再交作品

| 必测 | 通过标准 |
| --- | --- |
| 完整示例 | 三个主要入口、三组故事能完成；重置只影响 demo。 |
| 模式隔离 | 真实 API 关闭时明确报错；demo 不发真实写请求，不静默用假结果补成功。 |
| 身份与双入口 | 两个账号 / Agent 实际读写；REST、MCP 均不能伪造 owner、绕过撤销或代替人采纳。 |
| 版本与重复 | 需求变更后旧结果不被新版本采纳；重发请求不重复创建有效结果或重复启动模型。 |
| 真实帮助 | 新输入产生新结果；实际知乎资料可追溯，来源缺失不编造；经验引用能打开对应版本。 |
| 公网体验 | 独立浏览器能用、刷新后数据仍在；测试账号可用；平台助手不依赖你的笔记本常开。 |

上游测试能覆盖的直接跑；只补业务扩展、mock/真实接口一致性和上述跨入口负例。沿用项目测试工具，不另建测试平台。不以全是 mock 的测试通过，宣布真实接口已通过。

## 本轮明确不装的东西

ivy-blackboard / Beads / Flock / agtx：不与 Crier 叠加第二个任务或公告系统。SoL-Pi / MetaRSI / RSI-Harness / EvoMap：保留后续实验入口，不为它们改运行环境。Kernel 先是开发工具和可选执行端；协议只保留 metadata.gongzhi 的版本化约定，赛后再做 A2A 互操作，不先造标准。

## 给总控的一段开工指令

```text
按 v3 装配，不重写上游已有能力。先固定 Crier/API 样例和文件所有权，
Builder 用 shadcn + cosmos.gl + MSW 交完整前端；我的轨道接真公告、
身份与一次 AI 帮助。原仓库已有可用模块就继续用，不迁移全仓。
REST/MCP 共用业务校验；Live 失败不切假结果。六项工作写回原看板，
常规开发自主推进，回执只报入口、提交、接真/模拟范围和阻塞。
```

## 核查来源与交付依据

[1] Crier：[仓库与目录](https://github.com/MiniMap-ai/crier.network) · [依赖/脚本](https://github.com/MiniMap-ai/crier.network/blob/main/package.json) · [MIT 许可](https://github.com/MiniMap-ai/crier.network/blob/main/LICENSE)  
[2] Crier 接入：[OpenAPI](https://crier.network/openapi.json) · [接口手册](https://crier.network/llms.txt)  
[3] 图引擎：[cosmosgl/graph（MIT）](https://github.com/cosmosgl/graph)  
[4] 界面：[shadcn/ui（MIT）](https://github.com/shadcn-ui/ui) · [Next.js 接入](https://ui.shadcn.com/docs/installation/next)  
[5] 模拟：[MSW 浏览器接入](https://mswjs.io/docs/integrations/browser) · [start / scope](https://mswjs.io/docs/api/setup-worker/start)  
[6] 账号与数据库：[Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs) · [RLS 边界](https://supabase.com/docs/guides/database/postgres/row-level-security)  
[7] Agent 执行：[Vercel AI SDK](https://github.com/vercel/ai)  
[8] 开发宿主：[stablyai/orca](https://github.com/stablyai/orca)  
[H] 用户上传《知乎黑客松 2026｜校园新锐季 开发者手册》：p2 赛道；p8—9 必交体验链接与计划书；p14—16 接口；p18 原创与截止。上述开源能力来自本轮公开资料；目录新增、对象映射与开发顺序是本方案设计，全部待实际实现验证。
