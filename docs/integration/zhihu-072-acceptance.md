# 知乎回答摘要与前端增量验收（2026-09-14）

分支 `integration/gongzhi-mvp`；从 `bc091b9ac7f853232120102b8b8323f64eb92f90` 按以下完整 SHA 执行 `git merge --no-ff`，均无冲突，已阶段 push：

| 顺序 | 输入 SHA | 合并提交 |
| --- | --- | --- |
| M | `54605332ba7d29d6894502e5bd1fb0c1f316da85` | `eacfee9cb136e333634710b5aecdb56a4e990918` |
| C | `f9247c88321f39761403b82c54230916b872f5cb` | `90982ecd4efd3eda4a39e16ca88486e59e02ef48` |
| D | `e3a724dc9df7ff238e4111c856de762ca8f89eb5`（实现 `5a2fd0e48eeb90343695c906e592ff482bfa4c30`） | `a48b0177d4829b245b2f6acb5b3f4698cbf285c2` |
| K | `660281cca818737e52a866260cb11dfe18294f0c` | `ec12c9eccf2e05f04df50fc28439c056adae21ae` |

**镜像源码**为精确 `git archive ec12c9eccf2e05f04df50fc28439c056adae21ae`；后继 `f242023fdeb5c165b0e37ed0083f70ae174f1548` 仅新增 I 只读验收，随后仅补本报告。Next/Crier、白蓝页面、看山、cosmos.gl 保留；本轮根配置、依赖/锁、迁移、共享 DTO、身份与业务 API 未改，I 未改领域代码。

| 实际命令 / 检查 | 结果与边界 |
| --- | --- |
| `npm run typecheck` | Windows Node 24.16.0 / npm 11.13.0，通过；新增测试后再次通过 |
| `npm test` | 159 项：150 pass、0 fail、9 skip；含 D SDK/provider HTTP fixtures、回答分页/总预算/sticky 失败和模式隔离 |
| `npx --no-install playwright test --config tests/integration/evomap-owner.config.ts` | K 原页面 6/6，通过 |
| `npx --no-install playwright test --config tests/integration/live-account-owner.config.ts` | K 账号/来源 11/11，通过；全部隔离 HTTP/auth fixture，非真实登录或业务写入 |
| `docker build --tag gongzhi-integration:ec12c9e .`（精确快照目录） | 通过，实际执行 `npm run build`，无 Hugo/迁移；匹配锁的 `npm ci` 层命中缓存 |
| `npx --no-install playwright test --config tests/integration/zhihu-readonly.config.ts` | 最终 8/8，通过；Chrome 1440×960、390×844，`GONGZHI_TEST_BASE_URL=http://127.0.0.1:3039` |
| 镜像/运行只读检查 | Node 24.21.0、UID 1001、healthy、遥测关闭；镜像 docs 仅 `connect/agent-skill.md`，HTTP 正文与 D 单一源完全相同 |

Node 测试未加载数据库/Auth 配置，清除 `GONGZHI_TEST_DATABASE_ENV`、`GONGZHI_TEST_HTTP_DATABASE_ENV`、`GONGZHI_REAL_AUTH_TEST`、`GONGZHI_BROWSER_TEST_URL`、`GONGZHI_TEST_BASE_URL`；9 个 skip 为 5 个真实 Auth/PG 写测与 4 个原 HTTP 套件入口。新只读套件另验 `/zh/`、`/zh/board/`、`/zh/connect/`、公开配置白名单、公告/Agent-only 图/具体公开边证据、线程/筛选/移动导航、无 WebGL 降级，以及 GET `/demo/api/*` 拒绝和未知 live API 失败；浏览器阻断非同源或非 GET/HEAD 请求，未发生违规请求。空公告/空图、503 错误与重试为隔离 fixture，不代表当前库为空。

运行入口 **http://127.0.0.1:3039/zh/**。容器 `gongzhi-integration-ec12c9e`，CID `86f1f8b8bba87133805236a826bbe77814f08045bf04075d057f36c2140e892a`，镜像 `sha256:b933ecf7737c3fae1485a2719ca4666d83a7a3e1caae4ef74ceba4fc5bf249ef`，仅 `127.0.0.1:3039→3000`，Linux PID 检查时为 `1013132`。复核原 CID/镜像/用户/端口后仅停原 3039 应用；3043、3041、8123、3019、3029、PG56406、PG56520/Auth56521 保留。沿用 Git 外 `%LOCALAPPDATA%/gongzhi/local-auth-20260914-core/container-integration.env`，未输出秘密。

原始日志和截图均在 Git 外 `%TEMP%`：`gongzhi-zhihu-I-ec12c9e.build.log`、`gongzhi-zhihu-I-ec12c9e.node-test.log`、`gongzhi-I-zhihu-owner-ec12c9e/`（6+11 fixture 报告及来源卡片）、`gongzhi-I-zhihu-readonly-f242023/`（最终 report.json、桌面/窄屏 home/board/connect 和明确标注 fixture 的空/错状态截图）。已人工查看桌面首页、窄屏接入页、fixture 来源卡片和错误截图；依赖使用 Git 外匹配锁的独立安装，未重装旧预览共享依赖。

**未删除数据库**：替换前后只读观测均为 5 条公开公告、2 个 Agent、2 条边，两个 Agent 仅 1 个 owner；不是不同人的 Agent 互助证据。未执行登录、授权、登记、发帖、成果/采纳、TRUNCATE/DROP、迁移、造数或 PG/Auth 重启；历史 Auth/PG 写验收没有在本轮重跑。模型/知乎凭据均未配置、助手关闭；未调用真实知乎/外部模型，未安装官方 ZIP/CLI 或读取日常凭据。不同所有者的真实协作、真实外部服务与正式公网部署均未验证；清理须等待用户明确范围并由 Core 获新授权后执行。
