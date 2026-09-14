# 按次平台助手的服务端限额

共享接口：`getRunPolicy()`（`lib/gongzhi/run-policy.ts`）仅解析配置、不调用模型；`Run.budget` 可选以兼容旧记录。新运行冻结 `RunExecutionLimits`，包括模型 ID、上下文上限、输出上限、步数、检索次数、期限和每百万 token 的输入/输出单价（整数微美元）。旧记录没有预算快照，不能补造历史费用。

配置缺失或不合法返回 `unavailable`。需要 `.env.example` 中显式的模型密钥、模型 ID、相同的 `GONGZHI_MODEL_PRICING_MODEL_ID`、该模型真实上下文上限、输入/输出 USD 单价、每次及每日 USD 预算。美元最多六位小数，不能使用科学计数法；模型/价格变化必须一起审阅。当前项目没有该模型配置与调用额度，助手保持关闭。

默认上限仍为 60 秒、4 步、每步输出 2000 token、总计 2 次知乎检索、每天 20 次运行；只能通过配置调低步数/输出。全局同时运行默认 2、每位人类用户 1；配置上限为 16/4。共享 Core 事务负责准入，D 执行器消费服务端快照，不接受客户端自报预算。D 执行器与端到端测试由原 D/I 另行交付；本片只声明 Core 检查结果。

预留费用 = 每步（模型整个上下文输入 + 最大输出）的向上取整费用 × 最大步数，必须同时适配每次与全站滚动 24 小时额度；这是一种有意保守的上界，不是字符数估算。需要运营方核实所选模型的上下文、计费口径、币种和单价，包括可能另计的推理/缓存/工具费用；当前只支持该配置能覆盖的 USD token 计费模型，不能把未覆盖的额外服务费用视为零。

结束输入 `FinishRunInput.usage_complete` 默认未知，仅当 D 已取得所有实际调用的完整 token 用量时可传 true。未知、中断或超出已预留范围时保留完整预留，不通过取消释放费用；完整用量以冻结价格结算，并为逐次计费取整保留上界。这里的整数微美元是内部额度核算，不是供应商账单。摘要、经验上传与调用者本机执行不会自动调用本平台收费模型。

第14迁移只增加既有 `gongzhi_runs.budget` 和索引/快照保护，保留原表、旧数据和迁移；旧 budget=null 不补造费用，当前准入额度从有预算快照的记录核算，不能宣称已核对旧供应商账单。`claimRun` 事务在当前身份/需求/版本校验之后，用全库共享 advisory lock 原子检查全局、当前人类用户同时运行数和全站滚动24小时预留/结算额，然后记录新运行。取消可释放执行槽，费用必须按实际完整用量另结算；终态和原结果不能由迟到结算改写。没有队列、轮询模型或新增调度器。

`getRun(actor,id,{signal,timeout_ms:1000})` 给 D 执行期 monitor 使用，专用只读连接默认1000ms、最多2000ms，取消/超时关闭本次连接并等待清理，不能结束共享连接池；正常无options的GET沿原事务更新过期。专用查询只消费标量/JSON，关闭 Postgres.js 3.4.9 的自动数组类型探测，避免取消该隐藏查询时产生未处理拒绝，保留 TLS 与数据库只读约束。活动SQL的服务器 statement_timeout 同样受限。

首次同步 POST 尚未返回运行ID时，`RunLookupSchema/RunLookupInput={need_id,idempotency_key}` 对应共享 `api-client.lookupRun` 与 Core `lookupRun(actor,input)`。D 唯一拥有 GET `/api/gongzhi/runs?need_id=...&idempotency_key=...` 路由，200 data 为本人 `Run|null`；无需模型配置、不会启动执行。null 仅表示此刻没有可见回执，不能据此换键重发模型。F 在当前请求期间有界查询得到真实ID后才调用原取消；响应丢失保留原键并回读。D/F 路由和界面验收仍须合入后执行。

验证：`tests/core/run-budget-live.test.ts` 显式 `GONGZHI_RUN_BUDGET_TEST=true`、完整 isolated profile、仅 `56640/gongzhi_core_test`，官方 GoTrue 两个不同验收账号，真实 PG；6/6通过配置缺失无写入、跨用户并发竞态、每用户上限、原键回读隔离、幂等冲突、不可改写预留、unknown费用保留/完整用量释放及活动SQL取消。首次跑4子项通过、活动SQL取消失败（父项亦失败），定位到驱动隐藏数组探测后窄修，再跑6/6；不抹去首轮失败。合成价格/用量由测试显式设置，未实例化/调用模型。另本机静默TCP测试覆盖连接等待期中断，实际PG取消后共享池仍能查询。

第14迁移目前仅显式用于专用 Core 测试库，3079主库只有13迁移、运行502d466经验镜像；I更新助手镜像时须手动迁移14，不得由build/start隐式执行。公网、模型费用、知乎/SMTP外部调用以及跨轨UI/实际Agent本机执行验收不在以上通过记录内。

本片收口命令：`GONGZHI_COMPOSE_TEST=true npm test` 实际236 tests / 218 pass / 0 fail / 18 skip；新增 Run 真环境父项默认跳过，已显式6/6，其他门控沿 `full-regression-2026-09-14.md` 的适用性说明，不沿用旧组件结果冒称新端到端通过。`GONGZHI_TEST_DATABASE_ENV=<本轮core-test.env> node --import tsx --test tests/core/database.test.ts tests/core/corrections-database.test.ts` 实际26/26（真PG、Auth HTTP stub），`npm run build:client` 与最终 `npm run typecheck` 均exit0。首次新增只读连接配置用字符串on导致TS类型错误，已按驱动声明改为boolean true，真PG6/6复验通过；费用函数异常值测试与lookup编码测试均包含于全套Node。
