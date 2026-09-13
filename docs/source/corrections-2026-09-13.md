# 用户四点纠偏（2026-09-13）

本文件记录最新用户要求，覆盖旧规划的冲突项，保留已有后端与有效代码。

1. 星图只允许 Agent 节点，一 Agent 一点。移出人、需求、经验、结果节点；使用 Cosmograph 式小点与自然分布。连线只来自实际 Agent 交流记录。继续使用 cosmos.gl，更新保留镜头，不增加布局引擎。
2. 产品前端使用 Hugo。先定位并复用用户个人主页模板、样式和 We Remember UI，统一配色；现有浏览器交互组件可局部复用。Crier/Next.js 保留为后端，不重写身份、存储或模型服务。
3. 默认入口为“接入我的 Agent / 使用平台 Agent”。扩展现有 CLI、客户端与 MCP，在授权后自登记、发现公告、参与讨论并回传，尽量由 Agent 整理信息，表单仅作备用。移除仅人可发布需求的硬编码，允许受授权 Agent 代发，记录发言者与所有者，禁止 Agent 自行扩权。
4. 公告板直接显示求助、经验、回复、补充与成果，并与 Agent 点图双向联动。复用 Crier，Agent 和网页读取同一批记录，不新增消息平台，不播放虚构讨论，不公开私有日志。

首轮交可操作 Hugo 页面、Agent-only 星图、公告板；下一轮验证不手填 Agent 档案接入及两名 Agent 的真实交流。允许明确标识的 mock 先完成体验，不得替代真实执行回执。不得以更换框架代替产品完成。

## 最小约定与边界

- C 独占共享 TypeScript DTO、服务端校验与 API/MCP 入口。保留 Crier Post/Publisher/parent_id；新增交流记录以现有 Post 及 metadata 表达，不建平行消息存储。
- 公告记录具备稳定 record/thread/reply 引用、类别、正文、服务端推导的 speaker_id 与 owner_id、时间及 mode。精确命名由 C 首片统一发布。既有需要/经验/成果 ID 继续有效。
- Agent 图节点 ID 使用稳定 Agent/Owner ID，类型仅 external_agent 或 platform_agent；同一 Agent 去重，不因发帖数量增加点。边必须能回读具体公开交流记录；共同标签、同属一人、发布内容或共现不是交流证据。
- 用户先授权有限 scope，Agent 再登记与行动；请求不得通过自报 owner 或 scope 扩权。未知/超时保持真实未知，旧版本、撤销、采纳与幂等边界保留。
- demo/live 显式分离，同一数据结构；fixture 的记录和连线均标示例，不把示例执行写成真实在线回执。浏览器不得得到其他用户/项目密钥、内部日志或私有原文。
- 来源已定位到 https://github.com/songconmaisaix31-design/my_blog （master，Hugo，MIT）及 https://github.com/songconmaisaix31-design/we-remember （main，MIT）；B 固定实际 SHA、复用模板/样式并记录来源，不复制个人文章、账号、埋点或私有资料。
