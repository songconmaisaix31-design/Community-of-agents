# 当前数据库清理只读预检（2026-09-14）

**状态：仅预检，未获删除选项授权，未执行任何清理或停机。** Root 收到用户明确选择 A 或 B 后，须在同一 Core 终端以新 Dispatch 授权执行；下列命令是待审核建议，本 Dispatch 不运行。未备份、复制业务/认证记录、登录、造帖、登记或签发授权。

## 目标与实查

唯一目标是 `gongzhi-live-20260914-db-1` 的 `127.0.0.1:56520/gongzhi`，PostgreSQL 17.11，数据库 owner 为 `postgres`。使用既有 Git 外 `%LOCALAPPDATA%/gongzhi/local-auth-20260914-core/admin.env` 的 `MIGRATION_DATABASE_URL`，连接前校验主机、端口、库名；以 `default_transaction_read_only=on`、`REPEATABLE READ READ ONLY` 读取 catalog 和聚合计数，未读取记录正文、密码、令牌或 SQL 会话文本。快照时间 **2026-09-14 04:25:29 UTC（12:25:29 北京时间）**，以下行数不是删除时的保证，执行前须重新核对。

| 当前应用/服务 | 只读核对结果 |
| --- | --- |
| `gongzhi-integration-81321e7` / 3039 | 正在运行，`crier_app` → `host.docker.internal:56520/gongzhi`，Auth → 56521 |
| `gongzhi-integration-32d1237` / 3043 | 正在运行，与 3039 使用相同业务库和 Auth |
| `gongzhi-live-20260914-auth-1` | 正在运行，Compose 指定 `supabase_auth_admin` → `db:5432/gongzhi`，schema `auth` |
| `gongzhi-live-20260914-gateway-1` | 正在运行，回环 56521，代理上述 Auth |

应用配置经容器内 Node 仅输出 URL 的主机、端口、库名、角色与启用标志，未输出凭据。目标库 `pg_stat_activity` 快照仅有本次预检连接，**不代表应用不会重新连接**；3039/3043 均是潜在写入方。目标库 prepared transactions、replication slots、subscriptions 均为 0；未发现表继承/分区、event trigger 或 ON TRUNCATE trigger。

### A 的完整业务目标（22 张表，共 22 行）

所有表均在 `public`，owner `postgres`，RLS 已启用。

| 表 | 实际行数 | 表 | 实际行数 |
| --- | ---: | --- | ---: |
| cron_state | 1 | daily_actors | 0 |
| daily_counters | 0 | deliveries | 0 |
| gongzhi_authorizations | 2 | gongzhi_links | 0 |
| gongzhi_needs | 1 | gongzhi_owners | 3 |
| gongzhi_runs | 0 | posts | 6 |
| publishers | 3 | rate_limits | 5 |
| reports | 0 | search_log | 0 |
| source_items | 0 | source_runs | 0 |
| sources | 0 | stats_daily | 1 |
| strategy_items | 0 | strategy_log | 0 |
| subscriptions | 0 | unmet_queries | 0 |

`posts` 聚合分类为 need 1、reply 3、result 1、decision 1；包括当前真实成果、讨论和采纳历史。A 会删除这些内容、关联图证据、人与 Agent 的业务身份、授权、凭据校验记录和幂等记录，也清除限流/统计/来源/策略状态；不会自动重建示例或初始状态行。

### A 必须保留、B 会一并删除的对象

`public.schema_migrations` 有 12 行，记录 `0001_init.sql` 至 `0012-immutable-generated-search-column.sql`（含现有 0001–0012 全部文件），不在 A 清单。`auth` 的 23 张表全部由 `supabase_auth_admin` 所有，A 全部保留，不能只留 users 而清掉其登录依赖：

| Auth 表 | 实际行数 |
| --- | ---: |
| users、identities | 各 3 |
| sessions、refresh_tokens、mfa_amr_claims | 各 2 |
| audit_log_entries | 35 |
| schema_migrations | 70（version 最小 `00`，最大 `20260625000000`） |
| custom_oauth_providers、flow_state、instances、mfa_challenges、mfa_factors、oauth_authorizations、oauth_client_states、oauth_clients、oauth_consents、one_time_tokens、saml_providers、saml_relay_states、sso_domains、sso_providers、webauthn_challenges、webauthn_credentials | 各 0 |

A 还保留所有 schema、索引、序列当前值、约束、函数、触发器、RLS/权限及扩展 `pg_trgm`、`pgcrypto`、`plpgsql`、`unaccent`、`vector`。Auth 账号/现有会话保留，但对应业务 owner/publisher 已清空，旧 Agent 凭据不再拥有业务身份或授权；新的业务绑定需用户后续主动操作，不能靠验收脚本自动补回。Git 外配置、已有本地凭据文件和浏览器状态不属于数据库清理，保留但其业务引用可能失效。

### 外键、历史保护与角色

实查 20 条涉及 public 的外键全部在 public 内，无 public/auth 跨 schema 外键；Auth 内另有 18 条外键。public 的完整依赖为：`deliveries→posts/subscriptions`；`gongzhi_authorizations→gongzhi_owners` 两条；`gongzhi_links→posts` 两条；`gongzhi_needs→posts` 两条；`gongzhi_owners→publishers`；`gongzhi_runs→gongzhi_needs/gongzhi_owners/posts`；`posts→posts/publishers`；`reports→posts`；`source_items→posts/sources`；`source_runs→sources`；`strategy_log→strategy_items`；`subscriptions→publishers`。上述 22 表清单覆盖全部依赖。

五个用户触发器均启用：posts 上 `gongzhi_immutable_post_trigger`、`gongzhi_discussion_history`、`posts_count`、`posts_reply`，reports 上 `reports_count`。前两者是 BEFORE UPDATE/DELETE 行触发器，分别禁止删除 experience/result/help/decision/need_revision 和 reply/supplement；因此定向 DELETE 当前历史或借 publisher 外键级联删除会被拒绝。预检只读取函数定义，未尝试 DELETE，连回滚试删也未执行。

`postgres` 是登录超级用户；`crier_app`、`supabase_auth_admin` 可登录但无 SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS；`anon`、`authenticated` 不可登录且无这些特权，后四角色无角色成员关系。**另发现现有 crier_app 对 18 张 public 表（上表除五张 gongzhi_*，再加 schema_migrations）拥有 TRUNCATE 权限，而五张 gongzhi_* 没有该权限。** 不应把行级历史触发器当作管理员/TRUNCATE 防护，也不应给应用补清理权限；此为现状审阅发现，本任务不修改权限、触发器或历史迁移，后续是否收窄由 Root 单独安排。

## A：仅清空业务，保留登录和表结构（待授权）

Root 确认用户选择 A 并安排写入静默期后，暂停已核对的两个应用及面向此库的 Agent/CLI 写入，Auth 可继续运行。仅停这两个容器，不停 PG 或整个 Compose 项目；执行前重新核对容器名称、目标、表/外键/触发器清单，若发生漂移则停止并报告。

```powershell
# 仅在后续 A 执行 Dispatch：
docker stop gongzhi-integration-81321e7 gongzhi-integration-32d1237
docker exec -it gongzhi-live-20260914-db-1 psql -X -v ON_ERROR_STOP=1 -U postgres -d gongzhi
```

容器内这条 psql 连接已用 BEGIN READ ONLY / SELECT / ROLLBACK 验证可用。先在同一 psql 会话运行下方“只读验证”，记录新的聚合基线，再运行以下事务；精确列举、`ONLY` 和 `RESTRICT` 限制范围，不使用 CASCADE、不禁用触发器、不改 RLS 或 session_replication_role。

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF current_database() <> 'gongzhi' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'cleanup target/role mismatch';
  END IF;
END $$;
TRUNCATE TABLE
  ONLY public.cron_state, ONLY public.daily_actors, ONLY public.daily_counters,
  ONLY public.deliveries, ONLY public.gongzhi_authorizations, ONLY public.gongzhi_links,
  ONLY public.gongzhi_needs, ONLY public.gongzhi_owners, ONLY public.gongzhi_runs,
  ONLY public.posts, ONLY public.publishers, ONLY public.rate_limits,
  ONLY public.reports, ONLY public.search_log, ONLY public.source_items,
  ONLY public.source_runs, ONLY public.sources, ONLY public.stats_daily,
  ONLY public.strategy_items, ONLY public.strategy_log, ONLY public.subscriptions,
  ONLY public.unmet_queries
CONTINUE IDENTITY RESTRICT;
-- 暂不 COMMIT：在本事务运行下方只读验证并检查结果。
```

验证所有 22 表均为 0、迁移账本和保护对象保留后才单独 `COMMIT;`；异常或不符合清单则 `ROLLBACK;`。该操作会取得排他表锁，事务未提交可回滚；TRUNCATE 不触发 DELETE 行保护，属于用户明确授权的管理员清空，正常运行时保护保持原样。[PostgreSQL 17 TRUNCATE 说明](https://www.postgresql.org/docs/17/sql-truncate.html)

只读验证（psql，清理前、事务内及提交后各检查；只输出聚合和结构）：

```sql
SELECT current_database(), current_user;
SELECT format('SELECT %L AS table_name, count(*) AS rows FROM ONLY %I.%I;',
              n.nspname || '.' || c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth') AND c.relkind IN ('r','p')
ORDER BY n.nspname,c.relname
\gexec
SELECT name, applied_at FROM public.schema_migrations ORDER BY name;
SELECT count(*), min(version), max(version) FROM auth.schema_migrations;
SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1,2;
```

预期 public 仍 23 表（业务 22 张为 0、迁移表 12 行）、auth 仍 23 表、迁移版本与五个触发器不变；Auth 聚合与执行前对照，若 Auth 继续服务，其会话/审计计数可能自行变化，须区分正常 Auth 写入，不宣称全表内容逐字一致。本预检没有提取数据用于逐字对比。提交后退出 psql，再 `docker start gongzhi-integration-81321e7 gongzhi-integration-32d1237`；仅只读回读空公告/图和配置，不发帖、不登记、不签发授权。提交后的业务数据无法通过事务回滚恢复，本任务未制作备份。

## B：真正删除整个 gongzhi 数据库（待授权）

精确目标是整个 `gongzhi`：上述 public 23 表、auth 23 表及其全部记录/迁移历史、schema、函数、索引、序列、扩展等数据库对象。人类账号、密码校验数据、会话/刷新令牌和 Agent 业务身份/历史都消失；56521 无法正常登录，3039/3043 无法提供业务服务。保留 PG 实例、集群角色、具名卷和 Git 外配置；**不删除旧 56406，不连接或操作 gongzhi_core_test / gongzhi_migration_check，不删除其他库**。

后续获 B 授权的执行窗口必须停上述两个应用、官方 Auth 及所有面向此库的 Agent/CLI 写入，PG 本身保持运行；网关可留存但 Auth 请求会不可用。关闭所有目标库检查会话，从 `postgres` 维护库执行下列步骤，未确认零连接前不能 DROP；若出现新连接或阻塞对象，停止并报告，不增加 FORCE/终止后端/删除槽等操作。

```powershell
# 仅在后续 B 执行 Dispatch：
docker stop gongzhi-integration-81321e7 gongzhi-integration-32d1237 gongzhi-live-20260914-auth-1
docker exec -it gongzhi-live-20260914-db-1 psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres
```

```sql
SELECT current_database(),current_user; -- 必须为 postgres / postgres
SELECT datname,pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname='gongzhi';
SELECT pid,usename,application_name,state FROM pg_stat_activity WHERE datname='gongzhi';
SELECT count(*) FROM pg_prepared_xacts WHERE database='gongzhi';
SELECT count(*) FROM pg_replication_slots WHERE database='gongzhi';
SELECT count(*) FROM pg_subscription
WHERE subdbid=(SELECT oid FROM pg_database WHERE datname='gongzhi');
-- 要求目标存在、owner=postgres、连接为 0、以上三个计数为 0；逐项确认后才单独执行：
DROP DATABASE gongzhi;
SELECT count(*) AS remaining_target FROM pg_database WHERE datname='gongzhi'; -- 必须 0
```

DROP 必须在事务外、连接其他维护库时执行；不使用 IF EXISTS 掩盖目标错误，也不使用 FORCE。它不可回滚，会删除目标库数据目录；当前只是目录/catalog 预检，未试运行。[PostgreSQL 17 DROP DATABASE 说明](https://www.postgresql.org/docs/17/sql-dropdatabase.html)

B 后保持两个应用及 Auth 停止，不自动重建库、运行迁移、创建用户或补示例。现有 Compose 的 `POSTGRES_DB`/初始化脚本仅在空数据卷初始化时生效，保留卷后重启不会重建被删库。当前 PG 健康检查虽指定 gongzhi，`pg_isready` 只表示服务器连接状态，即使库名不存在也可能保持 healthy；因此须以上述目标 catalog 计数验证，不因健康状态删除卷或影响同实例其他库。[PostgreSQL 17 pg_isready 说明](https://www.postgresql.org/docs/17/app-pg-isready.html) 恢复环境需用户另行授权；配置中的 enabled 标志不等于运行成功。

## 本次交付与限制

已普通合入 `bc091b9ac7f853232120102b8b8323f64eb92f90`、`9c22781deb70d60443aa0fa1aa1f3de9809752d6`，预检前工作树干净。本次实际检查为目标受限只读 SQL、指定容器的端口/运行状态与脱敏连接配置、既有迁移/Compose 定义、官方 PostgreSQL 命令语义及 `git diff --check`；另从本文提取 22 个 ONLY public 目标名，与目标库只读 catalog 逐项比对通过，未执行文中清理 SQL。只新增本记录，不改变程序或正常权限保护。

未执行 A/B、停服务、TRUNCATE/DELETE/DROP、备份、迁移、登录、业务写入或体验库验收造数；未连接其他项目或两个测试库。文档变更未运行 typecheck/build/造数测试；清理后的真实状态仍未验证，必须等待 Root 转达用户选项授权后的新 Dispatch。
