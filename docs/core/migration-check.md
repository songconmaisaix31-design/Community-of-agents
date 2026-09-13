# 迁移重入验收

历史迁移 0001–0011 均不修改。Crier 0001–0008 保留原裸 SQL 重入约定；共治增量按现有 `scripts/migrate.mjs` 的 `schema_migrations` 账本执行一次。0011 添加约束、表、触发器，不能将裸 SQL 重复执行与实际 runner 的重复运行混为一谈。0012 修复不可变触发器对生成列 tsv 的误判：正文/标题/标签/来源仍受保护，生成列由 PostgreSQL 重算，计数与回复计数允许更新。

`npm run check:migrations` 需要显式 `SCRATCH_DATABASE_URL`，必须指向本项目专用 PostgreSQL 容器内**新建的唯一命名空测试库**，例如 `gongzhi_migration_<时间和随机后缀>`。不要传正在使用的 app 数据库；脚本发现 posts/publishers/迁移账本即拒绝，且不自动清空任何库。执行者需要创建扩展和表、切换角色的权限；集群须已有 `crier_app`、`anon`、`authenticated` 三个角色，检查器不会创建集群角色。

在独占本项目 DB 测试时段内，I 可使用现有容器管理连接新建空库，保留原 app 库；将新库连接以私有环境文件的 `SCRATCH_DATABASE_URL` 提供。命令：`node --env-file=<私有scratch配置> scripts/check-migrations.mjs`。不在终端/报告打印连接值，不把配置写入仓库。

检查顺序：

1. 在明确给定的新空库启用原四个扩展，保留原上游八份 SQL 连跑两遍的有效检查。
2. 调用实际迁移 runner，使全部迁移进入账本，包括 0011，不跳过任何新增迁移。
3. 验证 0011 scope 列/约束、授权表 RLS、服务角色权限、浏览器角色拒绝；用事务探针验证无效/空 scope、重复授权幂等键被数据库拒绝，以及所有不可变公告类型（reply/supplement/experience/result/help/decision/need_revision）原文和 metadata 不可改、计数和回复计数可增、搜索生成列保留。探针整体回滚。
4. 再次运行同一实际 runner，核对全部迁移账本条目与应用时间不变，再次验证 0011 结构/权限/行为。

实际结果：I 在当前独占测试时段内执行，2026-09-13 15:25 UTC 回执（Orca msg_f0497977d1d7）确认新空库 `gongzhi_migration_1789313063691_44bfc8a7` 配置 `scratch-correction-v2.env` 下检查成功：上游八份 SQL 两遍通过，实际 runner 应用全部 12 份迁移，第二次 no-op 且账本时间不变，两遍结构/权限/七类不可变记录探针通过。原 app 库另显式执行 migrate，只新增应用 0012 成功。C 未越过 I 的数据库时段。

此前首个 scratch 检查在合法计数更新处失败，促成 0012 修复生成列 tsv 误判；失败库保留，历史迁移没有被修改或补写掩盖。构建仍不运行任何迁移。上述为真实本地 PostgreSQL 证据，不是云 Supabase 或模型验收。
