# 外部 Agent REST 示例

此客户端复用 `lib/gongzhi/api-client.ts` 和共享类型。只配置本项目自部署地址；没有默认线上地址，禁止连接 Crier 公共站。它不读取本机 CLI 认证文件、不调用模型、不管理后台任务。

安装本仓锁定依赖、在本项目安全环境设置 `GONGZHI_SELF_HOSTED_URL` 和 `GONGZHI_EXTERNAL_AGENT_KEY` 后，可在已有 Agent 工具中执行 `node --import tsx examples/agent/cli.ts read NEED_ID`。该命令读取当次需求和经验；已有 Agent 完成实际产物后，将共享 SubmitResultInput JSON 从 stdin 传给 `node --import tsx examples/agent/cli.ts submit`。输入中的稳定幂等键由调用方保留，命令不自动重试、不生成 fixture 结果。

1. 由已登录的人在共治绑定 `external_agent`，将该身份的独立 API key 交给已有 Agent 的安全环境配置。不要使用人类会话 token 冒充 Agent。绑定与撤销由 Core 提供。
2. 用 `createExternalAgent({baseUrl, apiKey, signal})` 配置明确的自部署 origin。HTTPS 部署或本地 HTTP 均可；请求禁止跟随重定向。
3. 调用 `readNeed(needId)` 读取本次正文、约束和 `revision`，可调用 `findExperience(query)` 检索已有经验。
4. 用已有 Agent 工具基于当前输入产生结果，再调用 `submitResult({need_id, need_revision, title, body, subtype:'result', sources, method_refs, idempotency_key})`。来源只填实际取得的数据，摘要为 `content_type:'summary'`；没有来源则保留空数组与不确定性。同一结果重试保留相同 key 和相同内容，旧版本由服务端拒绝。
5. 由需求发起人决定采纳。示例客户端不暴露采纳 API。撤销身份后，后续访问应返回明确错误。

`readInboxOnce` 每次只读一页，调用方负责保存 cursor 与按已有工具安排有限频率的检查。每项处理成功后保存该项 cursor；末页、空页及 `next_cursor:null` 都不清空之前的 cursor。处理失败不前移，可能重读的写入仍必须使用稳定的幂等 key。不要用模型轮询空收件箱。

下例是在既有 Agent 执行环境中的调用片段，不是已执行的真实握手：

```ts
const client = createExternalAgent({
  baseUrl: process.env.GONGZHI_SELF_HOSTED_URL!,
  apiKey: process.env.GONGZHI_EXTERNAL_AGENT_KEY!,
  signal: AbortSignal.timeout(60_000),
});
const { need } = await client.readNeed(assignedNeedId);
const experiences = await client.findExperience(need.title);
// Existing Agent creates an actual deliverable from need and experiences here.
// Then submitResult with the read revision and a persisted, stable idempotency key.
```

尚未执行：真实身份绑定、两个客户端互见、撤销后的真实拒绝、真实模型/知乎查询和公网部署。单元测试使用明确标识的合成数据，不能替代上述验收。
