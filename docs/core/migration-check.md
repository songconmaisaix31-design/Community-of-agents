# 迁移重入验收

历史迁移 0001–0011 均不修改。Crier 0001–0008 保留原裸 SQL 重入约定；共治增量按现有 `scripts/migrate.mjs` 的 `schema_migrations` 账本执行一次。0011 添加约束、表、触发器，不能将裸 SQL 重复执行与实际 runner 的重复运行混为一谈。

`npm run check:migrations` 需要显式 `SCRATCH_DATABASE_URL`，必须指向本项目专用 PostgreSQL 容器内**新建的唯一命名空测试库**，例如 `gongzhi_migration_<时间和随机后缀>`。不要传正在使用的 app 数据库；脚本发现 posts/publishers/迁移账本即拒绝，且不自动清空任何库。执行者需要创建扩展和表、切换角色的权限；集群须已有 `crier_app`、`anon`、`authenticated` 三个角色，检查器不会创建集群角色。

在独占本项目 DB 测试时段内，I 可使用现有容器管理连接新建空库，保留原 app 库；将新库连接以私有环境文件的 `SCRATCH_DATABASE_URL` 提供。命令：`node --env-file=<私有scratch配置> scripts/check-migrations.mjs`。不在终端/报告打印连接值，不把配置写入仓库。

检查顺序：

1. 在明确给定的新空库启用原四个扩展，保留原上游八份 SQL 连跑两遍的有效检查。
2. 调用实际迁移 runner，使全部迁移进入账本，包括 0011，不跳过任何新增迁移。
3. 验证 0011 scope 列/约束、授权表 RLS、服务角色权限、浏览器角色拒绝；用事务探针验证无效/空 scope、重复授权幂等键被数据库拒绝，以及 reply/supplement 原文和 metadata 不可改、计数可增。探针整体回滚。
4. 再次运行同一实际 runner，核对全部迁移账本条目与应用时间不变，再次验证 0011 结构/权限/行为。

仅执行语法检查不等于以上数据库检查通过。本片由 C 准备代码，数据库时段已交 I，实际结果待 I 执行交接；构建仍不运行任何迁移。
