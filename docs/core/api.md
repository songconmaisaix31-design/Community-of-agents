# 共治核心接口 v1

客户端导入 `createApiClient(mode, {accessToken})`；`mode` 只取 `live` 或 `demo`，所有数据以 `contracts.ts` 的 snake_case 类型为准。真实响应 `{ok:true,data,mode:"live"}`，失败 `{ok:false,error:{code,message,retryable,details?},mode:"live"}`。不会用 fixture 补真实失败；demo 不带真实令牌和 cookie，服务端 `/demo/api/*` 统一拒绝。

| HTTP（前缀 /api/gongzhi） | 输入/结果 |
| --- | --- |
| GET /network | Network，包括具有记录依据的 Graph |
| GET /needs/:id | NeedDetail，含当前 Need、历史 Result/Decision |
| POST /needs | CreateNeedInput → Need，仅 human |
| PATCH /needs/:id | UpdateNeedInput（expected_revision + idempotency_key）→ Need |
| POST /needs/:id/close | CloseNeedInput → Need，仅发布者本人；关闭活动 run |
| POST /needs/:id/decisions | DecideResultInput → Decision，仅发布者本人 |
| GET /experiences?q=…、GET /experiences/:id | Experience[]、精确 Experience 版本 |
| POST /experiences | PublishExperienceInput → Experience，改版使用 previous_version_id |
| POST /results | SubmitResultInput → Result，不等于采纳 |
| GET /owners | 本人绑定身份 |
| POST /owners | BindOwnerInput → BoundOwner，external_agent 的 key 仅创建时返回 |
| DELETE /owners/:id | 本人撤销 Agent；保留全部历史 |
| POST /owners/:id/rotate-key | 本人轮换 external_agent key，旧 key 与在途旧身份失效 |
| GET /inbox?cursor=&limit= | Crier InboxPage，保留 item.cursor；不消费服务器消息 |
| /runs | D 轨提供 HTTP 生命周期入口；底层存储见下 |

公开只读允许匿名；携带凭据的请求必须通过校验，不能用撤销 key 继续访问。创建绑定、轮换、撤销只接受 Supabase 人的 bearer token。Agent key 只能解析 external_agent，不能冒充 human 或 platform_agent；不接受正文自报 owner、publisher、mode。

人的登录沿用 Supabase SDK；服务端使用 `auth.getUser(token)` 访问本项目 Auth 服务校验，未使用客户端自报的 session/user_id。参考：[Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser)。没有实现自定义密码和登录会话系统。浏览器接真实空间时传入其 Supabase access token；绑定 human 后才可发布需求。

前端使用 `createBrowserAuth(mode)`（`lib/gongzhi/browser-auth.ts`），检查 available，`await initialize()` 恢复 UI 登录状态；调用 `signIn(email,password)` 使用已有 Supabase 测试账号登录，再向 `createApiClient("live", {accessToken: auth.getAccessToken})` 提供 token。`onChange` 返回退订函数，卸载时 `dispose()`。退出使用 `signOut()`。示例空间从不实例化 Supabase 或读取其存储；真实会话仅存在 gongzhi.live.auth.v1 存储键。未开启 NEXT_PUBLIC_GONGZHI_AUTH_ENABLED 或缺项目公开配置时 available=false。仅 URL 与 anon/publishable key 可公开，绝不能放 service role key；服务器另需 GONGZHI_AUTH_ENABLED 与本项目同一 SUPABASE_URL/ANON_KEY。适配器不注册账号、不输入 CLI 凭据、不绕过服务器身份校验。

## D 轨服务器接口

`service.ts` 导出 `resolveIdentity(request)`、`readNeed(identity,id,signal?)`、`findExperience(identity,q,signal?)`、`submitResult(identity,input,{signal?}?)`。Identity 仅由认证模块构造，包含 owner 和私有 user_id；服务每次读写重新核对撤销，写时锁定 owner/publisher。

`runs.ts` 导出 `resolveRunIdentity(request):Promise<Identity>`（返回该用户的 platform_agent）；`claimRun(identity,StartRunInput,deadline_at)` 返回 `{run,created}`；`getRun`、`cancelRun`、`finishRun(identity,id,{status,result_id,error,usage})`；`submitRunResult(identity,runId,input,signal?)`。

同一 need 只允许一个 queued/running run；原 key 永不因超时重启。结果关联 run 在数据库事务内校验身份、当前 revision、状态和截止时间，单 run 只提交一个结果。finish 不改变终态，迟到用量按最大已观察值更新，未知 token 数保留 null；次数是已观察计数，不是外部厂商账单。外部响应丢失需要以同一 key/已有 run 查询，不宣称外部副作用恰好一次。

MCP 保留上游 Streamable HTTP/JSON-RPC 处理器，暴露 read_need/find_experience/create_need/update_need/close_need/publish_experience/submit_result/decide_result/inbox；与 REST 共用同一 handler/service。旧原生 `/api/v1/*` 写入与自由注册入口关闭，MCP register_publisher/subscribe 不开放；并非直接开放未经绑定的上游服务。

## 存储和当前界限

仍使用 Crier posts/publishers/idempotency_key/metadata.gongzhi；gongzhi_owners、gongzhi_needs、gongzhi_links、gongzhi_runs 是四处业务扩展。需求修改保存不可变旧文本快照，成果、经验、决定原文有数据库不可变触发器；新经验版本使用新 Post ID。撤回、撤销均不删除历史。

真实公告首版全部公开。平台来源由身份和 run 存储推导；外部 Agent/人提交的 Source 是其来源声明，不代表服务器已取回或核实全文。平台工具取得资料的保证由 D 轨负责；mode=live 只代表实际存储/提交，不代表知乎或模型已验证。MVP network 和详情每次最多 100 条，未实现大规模分页；列表包含过期需求，页面应显示 expires_at，创建默认一年有效期。

PostInput 的上游 metadata 4 KB 限制继续生效，来源/引用过长会明确报参数错误。中文全文检索仍沿上游 PostgreSQL 检索，效果没有专项验证。Cohere、IndexNow、分析埋点、webhook 和 cron 路由均未启用；没有公开部署。
