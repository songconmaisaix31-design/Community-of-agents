# 共治开发状态（唯一看板）

依据：用户提供 v3.0 集成方案与 v2.0 任务表。初始基线 main 5a8c2405f8e5a2b1ccd78aca7406d8fa04f6a866，仅 LICENSE，干净；远端相同。技术栈按 v3.0。总控仅文档与验收。

| 轨 | owner / 分支 | 交付 | 依赖 | 验收 / 状态 |
| --- | --- | --- | --- | --- |
| C | Core / gongzhi-core | Crier 固定 SHA 导入、统一接口、身份/公告/版本/采纳/撤回；唯一根配置与迁移 owner | 初始集成基线 | 004404e 已 push；46 项含真实 PG 测试零跳过、typecheck/build 通过；原 Agent 保留返修 |
| D | Connect / gongzhi-connect | 外部 REST 样例、知乎薄适配、AI SDK 平台助手 | C 契约与服务接口 | 97d9189 已 push；65 项通过、1 项 DB 跳过；原 Agent 保留返修；模拟模型验证，不是 live 调用 |
| B | Frontend / Builder 独立候选 | 三入口、星群、三示例故事、表单/详情、MSW | C HTTP 契约与锁定 UI 依赖 | Orca ctx_7994dd691a89 真实开发中；基线61bd177，消费C d0c8b87 |
| I | Integration / integration/gongzhi-mvp | 小步合并、最少装配、核心端到端验收 | 每批已提交 SHA | 079242d 检查点已 push；14 项模式/HTTP检查通过；最终任务ctx_e2e547b978a0续接原terminal |

精确 write_paths 见 AGENTS.md。全局样式 B；共享类型、依赖、锁文件、迁移 C。I 不改领域代码。各轨从统一集成基线开始，后续按 SHA 同步。

当前限制：已创建本项目专用 localhost PostgreSQL 17，10 个迁移与业务测试真实执行；Supabase 身份校验使用本地 HTTP stub，未验证云登录；模型、知乎和公网部署未执行。Builder 未发现已开工代码，前端在独立候选写域推进。最终整合前不能将分支测试等同产品验收，阶段验收按 v3 第六节，最终分支必须 push。

资产核验：front-asset 当前 36595a1ede56cae84f4cf2c4ccc4abcefa6a9932；owned/hero/README.md 明确银河原图 reference-only，第三方再分发许可未确认。B 应原创简单背景，不复制私有采集原件。


决策：为兑现用户完整前端优先的明确授权，且当前主仓/远端均无前端或 Builder 分支，创建独立 Frontend 候选轨；不将缺少交接路径扩大成停止产品开发的审批条件。若后续提供 Builder 已有成果则调整实际写域。保持最多三名运行 Worker，I 完成基座检查点后保留原 terminal，接前端后再复用集成。

