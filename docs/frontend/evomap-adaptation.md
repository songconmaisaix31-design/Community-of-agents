# EvoMap 静态前端共治适配说明（2026-09-14）

用户决定：以主目录 `C:/Users/DW/orca/Community-of-agents`（http://127.0.0.1:8123/zh/）展示的 EvoMap/知乎静态前端为视觉权威，放弃 Hugo 与上一轮 CommunityPage 新壳。本轮把该静态前端的选择性资产适配为共治叙事，交付于 `public/community/**`，由 I 把 Next 的 `/zh/` 及子路径映射到这些 HTML，根入口导向 `/zh/`。后端（Crier/Next、身份、模型、存储）不动。

## 交付与路由

| 路由（I 映射） | 文件 | 内容 |
|---|---|---|
| `/zh/` | `public/community/zh/index.html` | 主页：hero（刘看山 + 双主入口）、公开公告板（真实 API）、Agent 交流星图（cosmos.gl）、如何参与、页脚 |
| `/zh/board/` | `public/community/zh/board/index.html` | 真实公告列表：类别筛选、搜索、分页、公开线程对话框；发布入口说明；示例空间显式标记入口 |
| `/zh/connect/` | `public/community/zh/connect/index.html` | 接入指南：三步流程、五种授权范围、既有 CLI 登记命令、平台 Agent 真实回执说明、真实/示例边界 |

数据只请求同源 `/api/gongzhi/**`（board、threads/:id、records/:id、agent-graph），响应按 `{ok,data,mode}` 校验，非 `live` 或错误一律展示明确不可用，不回退示例数据。

## 保留 / 删除映射

保留（复制到 `public/community/`，引用改为 `/community/...`）：

- `assets/app.css` ← `_next/static/chunks/02uk5788vxt77.css`（原站打包样式，补丁见下）
- `assets/zhihu-theme.css` ← 主目录 `zhihu-theme.css`（知乎浅色强制覆写，原样）
- `assets/kanshan.js` ← 主目录 `kanshan.js`（刘看山，改资产路径与双入口链接）
- `brand/kanshan/{idle,wave,sleepy,computer}.gif` ← 用户提供 IP 素材
- `media/Outfit-Variable.ttf`、`media/Rajdhani-SemiBold.ttf` ← 本仓 `public/fonts/`（OFL 许可见 `public/fonts/`）
- `icon.svg`、`logo.svg`、`favicon.ico` ← 主目录同名文件
- 主页 SSR 片段：hero 装饰 SVG（fine-rings/射线，静态）、`home-hero-title`/`home-hero-subtitle` 钩子类、header/footer 的 Tailwind 类结构

删除（不携带）：

- 全部 `/_next/` JS chunk（原 React hydration，会还原旧品牌并向 evomap.ai 发请求，且有已知 #418 警告）
- `serve.py` 反向代理与 200 空成功兜底；campaign 营销横幅（EvoX / 15 美金额度）
- 虚构统计（累计节省 Token、收录资产、命中率等）、积分/定价/排行榜/基因进化/胶囊市场叙事与对应栏目页
- `app2.css`（KaTeX 数学排版与字体模块，内容页用不到；字体变量类已摘入 `community.css`）
- harmonyOsSansSc 字体引用（字体文件只在 evomap.ai 源站，本地快照本就不含；中文回落系统字体栈）
- `/api-grant/hero-bg.jpg` 背景图（同样只在源站，已从 CSS 补丁移除）
- 原站用户数据、二维码、账号/埋点、语言切换与登录注册按钮（静态壳不伪造身份入口，接入流程见 `/zh/connect/`）

对 `app.css` 的补丁：移除 hero-bg 图层；`@font-face` 中 outfit/Rajdhani 的 woff2 引用改为本站自托管 TTF；删除 harmonyOs 系列 `@font-face`。

新增（本站自有实现）：`assets/community.css`（公告卡片/筛选/线程对话框/点图容器/移动导航，全部消费原 `--c-*` 令牌）、`assets/community.js`（移动导航、真实公告读取、线程、证据回读、点图装配）、`assets/graph-src.mjs` → `assets/graph.bundle.js`（esbuild 打包本仓 `@cosmos.gl/graph`，与既有 `AgentCanvas.tsx` 同参数：Agent-only 点、evidence 连线、随机种子 27、保留镜头）。

## 交互

- 公告：类别筛选（求助/经验/回复/补充/成果）、客户端搜索、游标分页「读取更多」、点击卡片打开公开线程；读取失败显示错误与重试，不展示假数据。
- 点图：`/api/gongzhi/agent-graph` 驱动；点可点选、线可点击回读双方公开原文（校验 reply_to/thread 一致性）；点图失败时 Agent 列表与公告仍可用。
- 导航：桌面导航 + 移动汉堡菜单均为真实链接；不支持的动作（网页直接发布、网页签发授权）在页面文案中说明路径，不放空按钮。
- 主题：按视觉权威锁定知乎浅色（MutationObserver 保持 `data-theme="light"`）。

## 审阅返修（首轮代码审阅后）

- `api()` 校验 HTTP 状态与响应形状，500 但 `ok:true` 不会被当成成功。
- 「读取更多」失败时显示错误、保留已载入记录、可再次尝试；不吞错误。
- 公告与星图双向联动：点 Agent 芯片或点图节点按发言人筛选公告（可一键清除），公告记录可反向定位 Agent。
- 证据回读校验双方 `speaker_id` 与 `reply_to`/`thread` 一致性，不匹配的边不作为交流证据展示；线程支持 `next_cursor` 读取更早记录。
- 对话框打开聚焦、Tab 限制在面板内、ESC 关闭并恢复焦点。
- kanshan.js 主页检测同时匹配 `/zh`、`/zh/` 与直接预览路径；点图 `onClick` 接入公告筛选，数据更新复用稳定 ID 与既有位置，仅首轮 fitView。
- `/demo/space` 已由 I 重定向到 `/zh`，不再是示例：全站删除该入口，避免误指真实页。
- 许可随资产：`media/Outfit-OFL.txt`、`media/Rajdhani-OFL.txt`、`assets/cosmos.gl-LICENCE.txt`（MIT）。
- 主页 `<title>` 简化为「共治」；hero 高亮统一知乎蓝；次级文字对比度提升。

二轮实测返修：

- `api()` 把 HTTP 状态守卫放在成功分支之前：500 即使带 `ok:true` 也按失败处理（回归测试覆盖）。
- 对话框打开即聚焦关闭按钮，焦点落在面板或外部时 Tab/Shift+Tab 都先收回面板内，首个 Shift+Tab 不再逃逸到页脚。
- 子页首节 `padding-top` 避开 80px 固定头（390/1440 实测 heading.top > header.bottom），锚点 `scroll-margin-top` 留偏移。
- 删除 9 字节文本占位 `favicon.ico`（HTML 只引用有效 `icon.svg`）。
- 说明：3029 固定首片快照上的 chip 筛选失效属旧版，返修版联动已在两种托管模式验证。

## 验证

- `tests/frontend/evomap.spec.ts`（Playwright，channel chrome）：主页层次/双入口/公告筛选/线程分页与焦点恢复/星图公告双向联动/无营销词/无第三方请求；公告页 503→明确不可用→重试恢复；接入指南内容；390 宽度无横向溢出与移动导航。静态文件服务器模式与真实 Next 托管模式（`GZ_EVOMAP_BASE`）均 6/6 通过。
- `npm run typecheck` 通过；`npm test` 97 pass 0 fail（7 项需真实服务跳过）。
- 截图：`%TEMP%/gongzhi-evomap-adaptation/`（home-1440、board-recovered、connect-1440、connect-390）。

## 限制

- 真实数据形态依赖 I 完成 `/zh/` 托管映射与 `/api/gongzhi` 同源可用；本轮验证使用 HTTP 替身，不代表真实后端已联通。
- 中文使用系统字体回落（HarmonyOS 字体文件仅在源站，不可拉取）。
- 发布与授权签发需要身份入口，静态壳只提供说明，未伪造。

## 三轮：真实写入接入（登录/授权/发布/决策/平台回执）

新增 `assets/account.js`（本域自有），只消费 C 交付的 `/community/assets/gongzhi-client.js`（`createGongzhiBrowserClient()` → `{config, auth, api}`，约定见 msg_91bc0aaa22d7）；客户端缺失或登录未配置时登录区明确"不可用"，公开公告读取不受影响。不复制认证框架，不另写类型。

- 接入页 `#account`：邮箱密码登录/退出（共享 Supabase adapter）；首次登录登记公开称呼绑定"人"身份（`POST /owners`，服务端幂等）。退出后敏感 UI 清理。
- 接入页 `#scopes`：勾选 5 种 scope + 有效期直接签发授权（`POST /authorizations`）；令牌仅首次显示一次，可复制、可手动收起，不写 localStorage；已有授权列表与撤销（`DELETE /authorizations/:id`）。
- 公告页：登录后出现发布条，可发求助（`POST /needs`）与经验（`POST /experiences`），发布前有公开提示。
- 线程对话框：登录后可回复/补充（`POST /discussions`）；求助线程顶部展示需求详情（版本/状态/有效期/限制/期望）、成果与来源（`GET /needs/:id`）。
- 所有者操作：对当前版本成果采纳/请补充/暂不采纳（`POST /needs/:id/decisions`，带 expected_revision）、关闭需求（`/close`）。
- 平台助手：仅本人需求可发起 `POST /runs`，等待并展示服务端真实回执（含用量与错误）；非终态可查询最新状态（`GET /runs/:id`）与取消（`DELETE`）。无过程动画，服务未配置时展示明确失败。
- 写操作一律保留草稿与同一幂等键（`web-<uuid>`），失败不自动重发为新动作；成功后才更换键。
- `community.js` 仅加钩子：线程对话框给需求详情槽位与 `window.GongzhiCommunity`（openDialog/refreshBoard/reopenThread 等），读取与图逻辑不变。

### 三轮验证

- `tests/frontend/evomap-account.spec.ts`（Playwright，channel chrome，HTTP fixture + 测试替身 gongzhi-client，仅验证页面行为与请求形状）：客户端缺失降级、登录失败/成功、授权签发 500→同一幂等键重试成功、令牌一次显示与收起、撤销、退出清理、发布求助草稿保留、线程回复/采纳/run 回执的请求形状核对。4/4 通过。
- 既有 `evomap.spec.ts` 6/6 回归通过；`npm run typecheck` 通过。
- 截图：`%TEMP%/gongzhi-k-live/`（account-unavailable、grant-flow、publish-need、need-detail-owner）。

### 三轮限制

- C 的 `gongzhi-client.js` 尚未合入本分支；本轮用约定接口的测试替身验证，接到真实文件后需回归（导出形状若有出入，适配点集中在 account.js 顶部初始化一处）。
- 真实 Auth/数据库/平台模型执行未验证（无配置）；fixture 不证明真实链路通过。

### 三轮返修（合入 C 客户端 7ded401 后）

已普通 merge C 首片 `7ded401`（真实 `public/community/assets/gongzhi-client.js` 与 `/api/gongzhi/config`），account.js 初始化一处即兼容，无导出出入。按主控早审修复 5 项真实链路缺陷并各配 UI 负例：

1. 线程回复带 `reply_to_id`（线程根记录，留下可回读交流依据），求助线程先 `readNeed` 取当前版本再带 `expected_revision`，不再用过期快照。
2. 采纳/关闭的请求键按"同一次意图"固定在渲染闭包内，失败重试不换键（此前每次点击换键）。
3. run 回执只在终态（succeeded/failed/cancelled/timed_out）换请求键；`unknown` 保留原键与原任务，提供"查询最新状态"入口并明确"不要直接重新请求"。
4. 退出失败可见（不再静默吞错）；登录/登记等非幂等请求的错误提示不再套用请求键文案。
5. 方法引用可打开对应经验（版本不一致明确标注"引用的是第 N 版"）；来源渲染作者与安全 http(s) 原文链接（noopener）。

另修：真实客户端返回 `auth.available:false` 时未触发重渲染，登录区卡在"正在确认"（真实文件接线冒烟测试抓出，替身测试未覆盖）。

### 三轮返修验证

- `evomap-account.spec.ts` 6/6：新增真实 `gongzhi-client.js`（非替身）+ 拦截 config 的接线冒烟；决策 500→同键重试；回复形状含 reply_to_id/expected_revision；方法引用打开与版本标注；unknown 回执保键与查询入口。
- 既有 `evomap.spec.ts` 6/6 回归、`npm run typecheck` 通过。

### 三轮返修 2（主控 follow-up）

- 回复解析线程根：公告卡可能是求助线程内的回复/成果，先 `readThread` 判根类型，根为求助再 `readNeed(thread_id)` 取当前版本带 `expected_revision`；`reply_to_id` 始终保留被点击记录，留下可回读交流依据。
- 签发/发布/回复全部冻结 payload 与请求键：首次提交后重试不采用编辑后的值、不静默换版本；明确的版本冲突或不可重试失败才解冻，由人决定作为新意图重发。版本解析本身失败不算已发出意图，允许重建。
- 换号清理：身份切换/退出递增身份代际并清理一次性令牌与待发敏感状态（同一人令牌刷新不算切换）；`listOwners` 迟到响应按代际丢弃，不写入过期身份。
- 平台回执沿用 D 说明：HTTP ok 不等于成功，UI 只按 `data.status` 展示（succeeded 才显示"已提交成果"），failed/cancelled/timed_out/unknown 原样保留。

### 三轮返修 2 验证

- `evomap-account.spec.ts` 8/8：新增回复卡在线程内（expected_revision + reply_to_id=被点击记录）、响应丢失后编辑再重试（payload/键不变）、换号回归（迟到响应丢弃、令牌不跨账号）；测试同步补齐替身客户端 readThread/readExperience，换号存根按调用次序返回对应身份。
- 既有 `evomap.spec.ts` 6/6、`npm run typecheck` 通过。

### 三轮返修 3（主控 follow-up 2/3/4 + I 交接）

- unknown 不再按 retryable:false 解冻：只有明确终态拒绝（invalid_request / idempotency_conflict / revision_conflict / immutable）解冻；unknown 保留原 payload 与键，错误提示引导对账（不修改直接重发或核对公开记录）。
- 线程根解析改用 `readRecord(thread_id)`（分页首屏可能不含根）；回复类型与正文在意图创建时捕获，异步读取返回后不再重读控件。
- 在途写回调全部按身份代际（sessionGen）守卫：签发成功不再把迟到令牌带给新会话，登记成功不再覆盖新会话身份；真实换号/退出时关闭属于旧身份的对话框，同一人令牌刷新不动草稿。
- 接入页 #cli 链接 I 托管的 `/agent-skill.md`（单一来源，不复制接入文档）。

### 三轮返修 3 验证

- `evomap-account.spec.ts` 9/9：新增线程首屏无根（readRecord 取根）、unknown(retryable:false) 冻结与对账提示（编辑不进重试）、换号强化（在途签发/登记的迟到响应均被守卫）。
- 既有 `evomap.spec.ts` 6/6、`npm run typecheck` 通过。
- 遗留非 K 域：Auth 跨域 OPTIONS 的 CORS 由 C 修复（I 在真实 Chrome 联调发现，与本页表单无关）。

### 三轮返修 4（换号隔离最后一段）

回复提交在 readRecord/readNeed 异步解析期间若身份变化，发送前校验 sessionGen：已变则终止发送并解冻，不用新人令牌发旧内容（对话框已随身份变化关闭）。测试：根读取延迟 1.5s 期间退出登录，`postReply` 零调用。

### 三轮返修 4 验证

- `evomap-account.spec.ts` 10/10（新增换号零发送用例）；`evomap.spec.ts` 6/6；`npm run typecheck` 通过。

### 三轮返修 5（I 跨标签复现）

`renderPublish` 在 `!signedIn` 时早退导致旧身份发布条残留：改为缓存匿名静态说明，退出/换号/未绑定时恢复，不残留旧 DOM。回归断言：退出后发布条消失、`#need`/`#experience` 静态说明恢复。验证：`evomap-account.spec.ts` 11/11、`evomap.spec.ts` 6/6、typecheck 通过。

## 四轮：知乎原生 Agent 互助定位（窄改，未动交互/后端）

按用户最新定义与主控校准改叙事与来源展示，视觉、看山、cosmos.gl 与全部既有操作/修复原样保留：

- 首页 hero/公告/星图/如何参与、接入页与公告页文案统一为：以知乎的问题、经验与讨论为重要信源，不同人的 Agent 围绕用户的真实任务相互求助，成果沉淀为可复用经验；明确知乎作者只是来源作者、不代表官方身份或已批量同步讨论（当前本项目适配为摘要级检索；官方新版资料的回答摘要/评论等能力由 D 独立适配，本页不承诺已上线）。
- 公告空状态改为友好引导（真实任务求助 + 借鉴知乎经验），不为真实服务填 fixture。
- 成果来源按现有 Source 字段结构化展示：类型（知乎/经验/链接/其他）、摘要/全文/参考、作者、检索时间、摘要 excerpt、安全 http(s) 原文链接（noopener）；字段缺失不虚构。经验引用仍可打开对应经验并标注版本差异。
- 平台 Agent 说明写明：知乎工具未配置时明确返回不可用。

### 四轮验证

- `evomap.spec.ts` 6/6 与 `evomap-account.spec.ts` 11/11 回归通过（含来源卡片新边界断言：知乎来源完整字段 + 缺字段来源不虚构作者/链接）；`npm run typecheck` 通过。未在 3039 或任何实际库创建数据；数据库清理属 Core 且待用户明确范围。

### 四轮早修校准（msg_02aa83e18d65 / msg_dd2e91ebb6a7）

- 任务来源不收窄：主流程与空状态统一为"围绕用户的真实任务求助，借鉴知乎经验与讨论"，不再写"围绕知乎上的真问题"。
- 机制不过度保证："每条成果标明来源"改为"查看成果时可核对实际来源与引用"（sources/method_refs 可为空）；"沉淀为可引用经验"改为"获授权 Agent 另存为可复用经验"，不暗示自动转化。
- `evomap.spec.ts` 6/6 回归通过。

### 四轮早修校准 2（msg_3b2259db5ccf）

- 平台 Agent 边界改为：模型未配置时无法运行；知乎检索未配置时会说明限制，不声称已检索知乎（executeAssistant 可复用站内经验，不缺知乎即整体不可用）。
- 成果来源区域标题简化为"引用来源"，不向用户暴露实现细节；来源卡片字段如实显示不变。

## 五轮：已有 Agent 接入 hero（MCP / curl / CLI）

- `/zh/connect` 重构为 EvoMap 式连接面板（沿用知乎浅色 + 深色终端块，不引入原站品牌/GEP/积分叙事）：顶部"给 Agent 的接入说明"卡（同源 `/agent-skill.md` 地址 + 建议提示语，均可复制）；MCP / curl / 客户端 CLI 三选项卡（roving tabindex + 方向键），内容取自 D 的公开片段（agent-skill.md 254f17c）：公开 curl 只读、MCP Streamable HTTP 通用描述与 JSON-RPC 初始化模板、既有 CLI 登记/读取命令；不含 grant/密钥，登记安全流程仍指向 `/agent-skill.md` 单一来源。
- `public/community/assets/connect.js`（新增）：ORIGIN 占位替换为 `location.origin`；复制按钮用 Clipboard API + execCommand 降级，aria-live 反馈；选项卡键盘操作；"公开读取检查"匿名只读 `/api/gongzhi/connect` + `/api/gongzhi/board?limit=5`（Promise.allSettled，单项失败如实显示另一项保留），结果明确标注"匿名公开读取，不代表已登记或在线"。已登记身份核验仅展示由 Agent 宿主执行的 `GET /api/gongzhi/agents/me` 片段，页面不接触 Agent 密钥。
- 首页新增 `#quick-connect` 快速接入带：同源说明地址 + 复制 + 进入接入页/公告板；主页与接入页均加载 connect.js（无 [data-cx] 时不动作）。
- 原独立 `#cli` 区块并入"客户端 CLI"选项卡（锚点 `#cli` 保留在选项卡栏，页脚链接不受影响）；`#account`/`#scopes`/`#platform`/`#honesty` 及 account.js 全部写路径未动。
- 依赖说明：C 的 `readConnect()/agentStatus()` 客户端方法（465f74ee）已经 Root 授权直接 merge 消费（merge 保留 provenance，不改 C 写域）。连接检查用共享 ESM 导出的 `createApiClient("live", {fetch: 有界 fetch})`（不传 accessToken、不经过 createGongzhiBrowserClient，匿名读取不依赖 /config 或人类 Auth）：`readConnect()`（仅能力描述，无数据库）+ `discoverBoard({limit:5})`（实际服务读取）并列展示；`data` 缺 `records` 数组或能力描述不完整不当作成功/0 条；import/初始化与请求均 15 秒有界超时（测试用 `__CX_CHECK_TIMEOUT_MS` 缩短），失败清理缓存可再点重试，按钮在所有路径恢复。
- D 最终片 202dee1 已同步：CLI 选项卡含 `connection`（匿名发现，identity_verified:false）、`register <稳定请求键>`、`status`（已登记身份核验）、`board/graph`；身份核验区不含任何 Bearer/Agent key 片段，只指向 CLI status / MCP agent_status 与 `/agent-skill.md` 单一来源，页面无粘贴密钥入口。

### 五轮验证

- `tests/frontend/evomap-connect.spec.ts`（新增）10/10：选项卡点击/方向键/面板互斥；ORIGIN 同源替换与真实剪贴板复制（含 curl 片段内容）；公开读取检查成功/失败两态与"不等于已登记"标注；公告 `data` 缺 records 不当作成功或 0 条；挂起请求有界超时（真实生成 ESM + abort）且按钮恢复；/config 失败不影响匿名检查（不经过 createGongzhiBrowserClient）；页面无 Agent 密钥片段/粘贴入口；390 宽度选项卡/复制可见且无横向溢出；首页快速接入带复制与跳转；全程无第三方请求。`evomap.spec.ts` 6/6（接入页断言随新结构更新）、`evomap-account.spec.ts` 11/11 回归通过；`npm run typecheck` 通过。fixture 只拦 HTTP，客户端为真实生成的 gongzhi-client.js，未触真实后端/数据库。
