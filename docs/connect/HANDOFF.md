# Connect D 本批交接（2026-09-13）

分支：`songconmaisaix31-design/gongzhi-connect`。本批仅修改 Connect D 写域，Core 文件通过已发布提交同步，未自行修改共享契约、依赖、锁、迁移或业务 SQL。

源码里程碑：

- `911c5a9268f06a002ae052757a4657e8b8bb5f84`：知乎官方 HTTP 薄适配、认证/错误映射、有限缓存与取消、官方阅读记录。
- `7d758ef`：四步模型、两次搜索、60 秒的程序预算与取消范围。
- `eeee39e629697cb83487c4c8a078830cc359968b`：AI SDK 四工具、持久 run 服务装配、运行路由、外部 REST 客户端与可执行示例、SDK/外部失败边界测试；移除重复测试桥接。
- `e48fe7c`：合并 Core `8777510` 的 ESM 测试配置、事务修复与终态用量结算。此前 C `c49bddb`/`f2f061c` 用 cherry-pick 同步；本次 add/add 冲突仅在五个 Core 文件，已确认 D 无本地领域修改后取 C 已提交版本，保留原历史。

I 已有 Core 时，只需按顺序取 D 的 `911c5a9`、`7d758ef`、`eeee39e`；不要重复应用 D 分支中的 Core cherry-pick。D 当前已合并 C `8777510`。最终文档提交由 Orca 完成回报给出完整 SHA。

可用源码入口：

- `POST /api/gongzhi/runs`：服务端解析身份，Core 原子 claim 后等待 SDK 执行及事务提交；缺必要服务配置明确 unavailable。
- `GET /api/gongzhi/runs/:id` / `DELETE /api/gongzhi/runs/:id`：授权读取或持久取消。不会给模型采纳工具。
- `examples/agent/cli.ts read NEED_ID` / `submit`（stdin JSON）：使用明确配置的自部署地址和外部 Agent 独立 key；复用共享 client/schema。`readInboxOnce` 保存每个处理成功项的 cursor，空页不清空。
- 运行配置、来源和预算含义见 `assistant.md`；知乎官方字段阅读依据见 `official-sources.md`；外部命令说明见 `examples/agent/README.md`。

实际验证：

| 命令 / 版本 | 结果 |
| --- | --- |
| `node --test tests/connect/zhihu.test.mjs`，首批 | 13 通过；全部为合成传输响应 |
| `node --import tsx --test tests/connect/*.test.mjs`，`eeee39e` 源码 | 36 通过；包含 AI SDK 官方 MockLanguageModelV4 下的真实 SDK 工具循环 |
| `npm run typecheck`，`e48fe7c` 合并后 | exit 0 |
| `npm test`，`e48fe7c` 合并后 | 65 通过、0 失败、1 跳过；跳过的是需要单独测试数据库配置的 Core 实库测试 |
| `npm run build`，`eeee39e` 源码编译快照 | exit 0；Next 15.5.25 输出包含 runs 与 runs/[id] 动态路由；C 最后合并后的整体 build 未重跑，留 I 最终集成验证 |
| `git diff --check` | 无空白错误 |

测试覆盖：无凭据无外部调用、官方字段与无结果、HTTP/业务鉴权限流、超时与断连、查询缓存/去重、四步/两次限制、同 key 不重启、未取得来源拒绝、空搜索不造来源、仅四工具无采纳、提交响应丢失 unknown、最终确认断连不伪装成功、外部地址/模式隔离、cursor 不回退。

真实限制与未执行操作：

- 本 worker 只核对环境变量是否存在，未读取 CLI 认证文件，未执行任何真实模型/知乎请求；未取得脱敏真实响应样例。SDK mock 测试不是模型授权、知乎额度或内容质量验收。
- 本工作区未运行真实 Postgres 测试，未执行两个真实客户端的身份/读写/撤销链；Core/I 的数据库证据单独验收。
- 未提供或部署前端、公网试用与评委账号。平台默认关闭，启用前由操作方在本项目设置已有授权的服务配置。
- 跨实例取消在下个持久状态检查和写入事务生效，远端正在进行的 provider 请求可能持续到 60 秒截止；未声称能立即撤销站外费用。
- 最终断连可能发生在数据库已记录成功之后：响应明确 unknown 并指向可查询记录，不覆写已提交事实，不自动重跑原 key。
- `zhihu_queries` 是逻辑查询尝试数（含缓存命中），不是精确收费次数；未获得 SDK token 用量时为 null。

本批 Connect 实现可进入集成，长期 Worker 保留原轨返修责任；以上不等同于全产品、真实模型链或公网生产验收完成。
