# 正式界面同步与知乎 OAuth 配置

用户提供新的官方 Skill 包与应用 771，要求把演示界面同步正式版并加入展示数据，页面不写 fixture。沿用现有 Crier/Next 后端、静态前端、服务器和既有授权，从集成 `876bd2d100395031b8fff75bbde48fd7a01acc99` 开始，不另建项目。

- F：原长期 `gongzhi-kimi-adaptation` Agent/worktree/branch；独占 `public/community/**`（排除 `assets/gongzhi-client.js`）、`tests/frontend/evomap*`、原前端说明。正式首页默认提供完整演示体验，复用100个专业角色与A/B链；统一一处简洁“演示模式”，界面不重复 fixture/mock 字样，模拟操作不称真实执行。提供清楚的真实登录/真实空间入口；`auth` 回调和明确真实视图不被演示入口覆盖。真实服务失败保持错误；展示数据不写正式库。
- I：原长期 `gongzhi-integration` Agent/worktree/branch；独占现有 ECS 私有 OAuth 配置、`tests/integration/**`、`docs/integration/**`、Pages入口胶水及最终部署；先并行做配置核对，F提交后统一集成、公开资源增量与必要app重启。默认回调沿既有 `https://zhihu.davidwang.space/auth/zhihu/callback`，是否已登记已向用户短问。密钥只从Git外受保护交接进入服务器私有app环境，不输出到源码、消息、日志、浏览器或Pages。
- M：本文件、官方包只读核对、密钥受保护交接及独立验收。C共享类型、客户端、根配置、锁、会话/CSRF守卫不变；官方包中的新项目初始化脚本不适用现有项目，不另生成Hello World。若协议差异确需领域修改，退原C/D。

验收：正式默认展示、明确真实切换、OAuth回调不被覆盖、演示零真实写入、无可见fixture/mock反复文案、手机桌面及已有星图/进化页；服务端仅验证配置投影/授权启动/失败边界，用户亲自授权和公开可达回调才算真实OAuth成功。原主域ICP备案拦截不靠代理/端口绕过，若仍存在则如实保留限制。只普通commit/push；不覆盖F未跟踪证据，不触碰私有草稿或现有业务记录。
