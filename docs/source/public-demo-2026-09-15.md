# 黑客松公开演示入口

用户要求优先让其他人能打开网站，并使用阿里云 CLI 修复。2026-09-15 实测：北京 ECS 运行、四容器健康、源站页面 HTTP200、DNS 正确且安全组已允许 80/443；原域名外部 HTTP403 正文为 `Non-compliance ICP Filing`，HTTPS 握手失败。不是业务页面或端口配置故障。当前账户香港、新加坡 ECS 均为零，不绕过供应商拦截，也不未经确认购买新资源。

选择现有公开仓库的免费 GitHub Pages，独立发布明确标注的 fixture 演示，入口为 `demo.zhihu.davidwang.space`；原 `zhihu.davidwang.space` 和北京完整后端、登录鉴权继续保留。演示不代理北京服务，不收集登录凭据，不调用真实身份、MCP、数据库、模型或知乎接口，不宣称修复完整应用登录与真实执行。

- M：仅本文件、AliCLI DNS 和独立网络验收。确认 Pages 已绑定精确域名后，仅新增 `demo.zhihu CNAME songconmaisaix31-design.github.io`，TTL600；没有修改已有根域、www、zhihu 或其他记录。
- I：原长期 Agent、`gongzhi-integration` worktree、`integration/gongzhi-mvp` 分支；独占 `tests/integration/**`、`docs/integration/**` 和必要入口胶水。从固定 `f7c0164659cd9d67f652e8ae09be98444b0b79f8` 的公开前端资源生成隔离部署产物，普通提交推送新的 `gh-pages` 分支并配置 Pages。根配置、锁文件、共享客户端和领域代码不改。
- F 已完成的 100 个专家 Agent fixture 和 A/B 演示继续复用；O 的私有 DeepSeek 草稿及其原生权限阻塞与本发布独立，不复制到公开站。

03:12 CST 网络预检：AliCLI 精确子域查询确认单一 ENABLE CNAME；Google DNS-over-HTTPS 返回同一解析；北京 ECS 解析到 GitHub Pages 公网地址，本机与北京远程 `curl` 均 HTTP200。此时页面仍为 245 字节占位，**不计为完整体验验收**。I 继续发布完整页面，验证固定资源、强制演示入口、桌面/手机 A/B 流程、零真实接口请求及有效 HTTPS。最终部署 SHA、证书状态和实际测试以 `docs/integration` 的本轮验收交接为准。

完整服务迁往境外需新增资源费用。CLI 当时香港按量询价：2 核 4 GB、40 GB ESSD、3 Mbps 约 CNY0.5900674/小时；仅询价，没有购买或改变现有服务。未备案原站的完整公网访问、未配置的 OAuth 应用凭证和真实 A/B 执行不属于本 fixture 发布已完成项。

依据：[阿里云 ECS 跨地域与备案说明](https://help.aliyun.com/zh/ecs/cross-region-usage-faqs)、[GitHub Pages 自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)。

## Agent 进化层与项目视频增量

用户最新要求先增加纯前端的 Agent 进化理论页，再在 Chrome 打开真实部署页面，用本机 Recordly 录屏并配 TTS 项目解说。参考 EvoMap 的可追溯策略/结果/事件、GEPA 的反馈反思、Agent Skills 的便携方法结构；仅借鉴理念并标明来源，不导入运行时、不新增后端或调用模型。主线为获准知乎资料→方法固定版本→借用者本机条件适配与检查→可选反馈→经审阅形成新版本。

F 原长期 Agent 从 `ad4465408db0886d23ac11fefcd742b5bb76b70f` 同步，独占 `public/community/zh/evolution/**`、`assets/evolution.css/js`、三张旧 HTML 必要导航、`tests/frontend/evomap-evolution*` 和原前端说明；保留原 `test-results/` 未跟踪证据。I 继续唯一集成、Pages 别名与必要入口胶水、集成检查和报告，不改 C 的根配置/锁文件或业务后端。M 独占本增量决定、参考资料核实和仓库外录屏/解说产物。F 交小步 SHA 后 I 普通合入、公开部署并验收，再开始正式录屏。

新页面保留一处简洁“理论设计”标识，提供过程选择、方法版本/适用条件/验证依据的可交互说明，不制造实际执行回执或增长数据。视频聚焦共治理念和实际页面操作，不反复强调 mock/fixture；介绍理论时准确使用设计语气。既有事实标识及真实失败语义保持，不把公开页面部署等同于真实 Agent 执行。录制只选择独立 Chrome 公共页面窗口，不录私密桌面；本机现有中文 TTS 优先，无新增费用。
