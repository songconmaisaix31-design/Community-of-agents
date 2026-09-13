# 共治开发状态（唯一看板）

依据：用户提供 v3.0 集成方案与 v2.0 任务表。初始基线 main 5a8c2405f8e5a2b1ccd78aca7406d8fa04f6a866，仅 LICENSE，干净；远端相同。技术栈按 v3.0。总控仅文档与验收。

| 轨 | owner / 分支 | 交付 | 依赖 | 验收 / 状态 |
| --- | --- | --- | --- | --- |
| C | Core / gongzhi-core | Crier 固定 SHA 导入、统一接口、身份/公告/版本/采纳；唯一根配置与迁移 owner | 初始集成基线 | Orca ctx_c4b889cd29cb 正在工作；首批契约后立即集成 |
| D | Connect / gongzhi-connect | 外部 REST 样例、知乎薄适配、AI SDK 平台助手 | C 契约与服务接口；适配可先行 | Orca ctx_cfb2e439cf9a 正在工作；核对官方接口 |
| B | Builder 保留 | 三入口、星群、三示例故事、表单/详情、MSW | C HTTP 契约 | 认领路径待交接；不覆盖 |
| I | Integration / integration/gongzhi-mvp | 小步合并、最少装配、核心端到端验收 | 每批已提交 SHA | Orca ctx_bc5165b4974f 已接单；准备环境与跨入口验收 |

精确 write_paths 见 AGENTS.md。全局样式 B；共享类型、依赖、锁文件、迁移 C。I 不改领域代码。各轨从统一集成基线开始，后续按 SHA 同步。

当前限制：未确认本项目数据库、Supabase、模型、知乎凭据或部署资源；仅做无新增费用的本地开发和测试。Builder 交付路径已向同仓审查会话交接并向用户异步询问。无真实服务验证前仅可声称可操作示例及已验证本地模块。阶段验收按 v3 第六节，最终分支必须 push。

资产核验：front-asset 当前 36595a1ede56cae84f4cf2c4ccc4abcefa6a9932；owned/hero/README.md 明确银河原图 reference-only，第三方再分发许可未确认。B 应原创简单背景，不复制私有采集原件。

