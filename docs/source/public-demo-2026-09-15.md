# 黑客松公开演示入口

用户要求优先让其他人能打开网站，并使用阿里云 CLI 修复。2026-09-15 实测：北京 ECS 运行、四容器健康、源站页面 HTTP200、DNS 正确且安全组已允许 80/443；原域名外部 HTTP403 正文为 `Non-compliance ICP Filing`，HTTPS 握手失败。不是业务页面或端口配置故障。当前账户香港、新加坡 ECS 均为零，不绕过供应商拦截，也不未经确认购买新资源。

选择现有公开仓库的免费 GitHub Pages，独立发布明确标注的 fixture 演示，入口为 `demo.zhihu.davidwang.space`；原 `zhihu.davidwang.space` 和北京完整后端、登录鉴权继续保留。演示不代理北京服务，不收集登录凭据，不调用真实身份、MCP、数据库、模型或知乎接口，不宣称修复完整应用登录与真实执行。

- M：仅本文件、AliCLI DNS 和独立网络验收。确认 Pages 已绑定精确域名后，仅新增 `demo.zhihu CNAME songconmaisaix31-design.github.io`，TTL600；没有修改已有根域、www、zhihu 或其他记录。
- I：原长期 Agent、`gongzhi-integration` worktree、`integration/gongzhi-mvp` 分支；独占 `tests/integration/**`、`docs/integration/**` 和必要入口胶水。从固定 `f7c0164659cd9d67f652e8ae09be98444b0b79f8` 的公开前端资源生成隔离部署产物，普通提交推送新的 `gh-pages` 分支并配置 Pages。根配置、锁文件、共享客户端和领域代码不改。
- F 已完成的 100 个专家 Agent fixture 和 A/B 演示继续复用；O 的私有 DeepSeek 草稿及其原生权限阻塞与本发布独立，不复制到公开站。

03:12 CST 网络预检：AliCLI 精确子域查询确认单一 ENABLE CNAME；Google DNS-over-HTTPS 返回同一解析；北京 ECS 解析到 GitHub Pages 公网地址，本机与北京远程 `curl` 均 HTTP200。此时页面仍为 245 字节占位，**不计为完整体验验收**。I 继续发布完整页面，验证固定资源、强制演示入口、桌面/手机 A/B 流程、零真实接口请求及有效 HTTPS。最终部署 SHA、证书状态和实际测试以 `docs/integration` 的本轮验收交接为准。

完整服务迁往境外需新增资源费用。CLI 当时香港按量询价：2 核 4 GB、40 GB ESSD、3 Mbps 约 CNY0.5900674/小时；仅询价，没有购买或改变现有服务。未备案原站的完整公网访问、未配置的 OAuth 应用凭证和真实 A/B 执行不属于本 fixture 发布已完成项。

依据：[阿里云 ECS 跨地域与备案说明](https://help.aliyun.com/zh/ecs/cross-region-usage-faqs)、[GitHub Pages 自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)。

## 主站星图与双界面进化层（最新要求）

用户已取消录屏与配音；没有开始录制或生成音频。当前先更新 `https://zhihu.davidwang.space/zh#agents` 的主站星图，再完善两个界面的 Agent 进化层，仅做前端。已短问“两界面”的含义，未答期间按主站与演示站共享前端资源推进。参考 EvoMap 的可追溯策略/结果/事件、GEPA 的反馈反思、Agent Skills 的便携方法结构；仅借鉴理念并标明来源，不导入运行时、不新增后端或调用模型。主线为获准知乎资料→方法固定版本→借用者本机条件适配与检查→可选反馈→经审阅形成新版本。

F 原长期 Agent 从 `ad4465408db0886d23ac11fefcd742b5bb76b70f` 同步，续接同一任务并恢复原前端唯一写域 `public/community/**`（排除 C 的 `assets/gongzhi-client.js`）、`tests/frontend/evomap*` 和原前端说明；保留原 `test-results/` 未跟踪证据。星图优先交自包含小步 SHA，已完成理论页保留。I 继续唯一集成、ECS 公开静态资源增量、Pages 产物、集成检查和报告，不改 C 的根配置/锁文件、身份服务或业务后端；使用已支持的 `/community/zh/evolution/index.html` 作为两站共同入口，不为漂亮路径新增服务。M 仅维护决定、资料核实与验收。取消所有后续录制工作。

星图沿用 cosmos.gl，小点、自然分布、一 Agent 一点、更新保留镜头。主站以显式视图区分 100 个公开 Skill 能力参考角色与实际接入身份，真实 API 失败仍保持错误，不静默回退成参考数据，不制造在线状态或交流边。进化页保留一处简洁“理论设计”标识，提供过程选择及固定版本、适用边界、来源归属、检查证据、独立分享确认的规范说明，避免反复 mock/fixture 提醒，不制造执行回执或增长数据。验收覆盖主站与演示站导航、390px/桌面交互、图/视图切换及失败语义；主站原 ICP 外部访问限制与源站静态部署检查分别报告。
