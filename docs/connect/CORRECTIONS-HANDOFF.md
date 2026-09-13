# Connect D 纠偏轮交付（2026-09-13）

分支：`songconmaisaix31-design/gongzhi-connect`。已合入指定统一基线 `2a0b5617b5dc5030894bde6541ddcb6bc469c24a`、管理提交 `15d92c5d502fefc26e03101d7f6f6e5296d2f6bf`、C 契约 `c5d3e83` 与服务 `6a886b7`。首片源码 `77b5eb9294285825bb7ed20604fad62d97c00d48` 已 push，最终 SHA 由本 Dispatch 的 worker_done 给出。

## 完成

- 扩展既有 client / cli，有限 grant 登记默认 Agent 元数据；人不必填写档案。正文使用 C 唯一严格 schema，不接受自报 owner / speaker / scopes。无授权管理或采纳入口。
- 首次独立密钥只写显式配置、仓库外且绑定自部署 origin 的专用凭据文件，排他创建，不覆盖、不回显、不读取其他 CLI 的认证文件。缺配置/凭据明确 unavailable。
- 公告、历史翻页、线程、记录证据、Agent 图、按获准 scope 发需求/经验、回复/补充及成果回传均有命令。可信 speaker/owner 原样交付，既有 inbox 成功后逐项存 cursor、空页保留逻辑继续有效。
- 外部 AI SDK 工具为同一客户端的薄适配，不创建模型或调度器。每任务一笔写入，稳定请求键由宿主给出；未读线程目标/版本、并行执行、未知写入及后续写入被阻止；来源元数据不交给模型捏造。
- 旧平台助手/知乎代码未改动，原四工具、4 步/2 搜索/60 秒、取消、去重与真实来源检查仍通过回归。

## 验证

- `npm run typecheck`：通过。
- `node --import tsx --test tests/connect/*.test.mjs`：53 项通过，0 失败/跳过；包括实际 AI SDK + MockLanguageModelV4 + 临时 localhost HTTP 模拟服务的三步公告/线程/回复往返。
- `node --import tsx examples/agent/cli.ts help`：通过，可运行命令入口。
- `git diff --check`：通过；只存在仓库既有 Windows LF/CRLF 转换提示。

新增测试均为普通自动化单元或接口模拟，没有真实模型费用、知乎查询、Supabase 云身份或云端登记。C 独占数据库测试时段，D 未运行数据库测试、全库 npm test 或额外构建；C 自己的数据库/构建证据参见其服务交接，不能当成 D 独立验证。

## B / I 消费及真实剩余限制

精确环境变量、可复制 CLI 命令、失败状态、私有凭据路径约束与 SDK 接法在 `docs/connect/AGENT-CONNECT.md`。B 已收到首片 SHA 与说明，可在“接入我的 Agent”展示由授权 ID 派生的稳定请求键；不要把授权令牌写进命令行或回执，不把默认名称变为手填档案主入口。

I 合入后仍需统一 Hugo/Crier 装配和实际部署配置/迁移验收。Windows 私有目录 ACL 由部署操作者维护，Node `0600` 不代替 ACL。外部模型宿主需沿说明保留 SDK 4 步、取消与失败检查，不能只凭模型文本确认成功；本轮没有新增外部模型运行服务。

两名真实 LLM Agent 的免手填接入与交流、真实模型/知乎/云身份尚未执行，也未申请付费调用。登记响应丢失/凭据保存失败保持 unknown，核对原记录后由授权人处理原身份密钥，客户端不会自动重新发钥。此轮完成后由原 D 承担返修，不扩展下一轮范围。
