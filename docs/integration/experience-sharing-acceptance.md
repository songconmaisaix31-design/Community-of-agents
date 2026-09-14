# 经验离线借用集成验收（2026-09-14）

本轮沿 Next/Crier、官方 GoTrue/PG、静态页面与 Agent-only 图继续集成；不替代上一轮未完成的全量回归结论。

- 普通 no-ff 合入 Core `09fd1faf42a26082cb036bcff542ab85b43c2759`、Connect `a833303e229131b970e4a75d50a25cc980408705`、Frontend `b7978d9c10ffb7843ffbadb96749e0bc8d07c76e` → `345f909a2d060b57ceff5c43b89681a17fa2d677` → `ed23295517683b54930bb8ae1f8df82a938df174` → `c9b95de268fc5d62ea041a57fad5a4b4f2d2d6b6` → `6a138f64bce6471de094222ff02eb924d688aab8`。
- I 在 `bc8ed1071ae162ca3305c08102952219523b5842` 为旧 HTTP 经验发布测试补准确内容批准，并保留未批准拒绝断言。
- 完整构建源 `88e7e6a1d4fe98bea47ff764e98263cf8be2206d`：Git archive 独立快照，`npm ci --no-audit --no-fund`、`npm run typecheck`、`npm test` 成功（243 pass / 0 fail / 19 skip）；显式 `GONGZHI_COMPOSE_TEST=true node --import tsx --test tests/core/production-package.test.ts` 2/2。默认跳过的真实数据库、登录、浏览器及生产空库门控不算通过。
- `docker build --pull=false --target runtime --label org.opencontainers.image.revision=88e7e6a1d4fe98bea47ff764e98263cf8be2206d -t gongzhi:integration-experience-88e7e6a .` 成功，实际执行 `npm run build`；manifest `sha256:4e570ecfba530a72b073ee0abb6cd7a7a7fd88bf44bf9a6b8af31c6396d11516`。构建不执行迁移。
- 后继源码 `43af491af6b13b7da2d481045334dd7579f83e3d` 仅增加 F 的 `experience.js` 五行退出清稿修复及测试/文档；Git 外 Dockerfile 在上述已编译镜像上 COPY 此精确静态文件，保留非 root 用户并标明两层源码，manifest `sha256:361ba99b3d72ffb37bb3c159b950e87af65885ba6482ab4d1a034e4e91819f75`。没有将静态替换称为再次完整 Next 编译。

## 真实环境与当前边界

经 F 确认无在途写请求后，严格核对 `127.0.0.1:56640/gongzhi` 与 `gongzhi-fulltest-c-20260914`，使用现有管理员配置显式 `node scripts/migrate.mjs`：仅应用 `0014-run-budget.sql`，再次执行 all 14 recorded / no-op。旧记录和全部 PG/Auth 卷保留；只替换本轮 3079 app，旧 app 容器保留供回滚。

88e7 实际 HTTP：health/config/经验摘要搜索 200，匿名 agents/me 401；app healthy、用户 gongzhi。A/B 使用两个不同隔离 Auth 用户及 human owner，独立有限 grant；测试审核不等于公众自然人本人确认。Agent 本机执行、准确批准/回执、最终页面与作者离线后借用仍逐项验收，未完成项不计通过。

ECS 仍是历史 `06e6c081` 运行版本，本轮尚未云更新；正式入口为 `zhihu.davidwang.space`，已知普通 HTTP 403 ICP 拦截和 HTTPS 握手失败，不能称公网成功。未调用模型、知乎或 SMTP，未配置项目模型价格和预算，不将 fixture 用量、合成模型回复或上传回执称真实推理/业务执行。旧预览、旧 3069 对话与生产记录未改。
