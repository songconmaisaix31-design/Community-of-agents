# 知乎活动接口实际只读检查

2026-09-14，按用户“先测试知乎”的最新要求，暂停不同 owner 的 Agent 登记/交流。依据用户提供的官方 `zhihu-cli-skill` 0.7.2-beta.20260911131715 包内 `references/hackathon-content-api.md`，实际请求活动知识/故事接口；未执行包内脚本、安装 CLI 或登录。本次检查使用 Node 24 内置 fetch，不是 HTTP fixture。

固定主机 `https://api.zhihu.com`，以下均为 GET，仅设置 `Accept: application/json`，无 Authorization、Cookie 或 OAuth 凭据；每次最多 20 秒、响应最多 2 MB、不跟随重定向、不自动重试。列表共两次，首个有效知识 work_id 的详情一次，随后经总控明确批准补一次同 URL 的错误诊断，共 **4 次** 后停止，未更换 ID 或探查其他端点。

| 开始时间（UTC） | 路径 | HTTP / 结果 | 耗时 | 响应大小 |
| --- | --- | --- | --- | --- |
| 05:11:43.713 | `/km-indep-home/hackathon/v2/knowledge/list` | 200；JSON 数组，10 项 | 504 ms | 6,205 B |
| 05:11:43.751 | `/km-indep-home/hackathon/v2/story/list` | 200；JSON 数组，20 项 | 684 ms | 11,957 B |
| 05:11:44.435 | `/km-indep-home/hackathon/v2/story/1307332455322529792` | 400；JSON error，无正文 | 65 ms | 77 B |
| 05:14:00.062 | 同一详情路径，获准定向诊断 | 400；`error.code=40404`，`message=作品不存在`，`name=Work Not Found` | 123 ms | 77 B |

四个响应均为 `application/json`。两个列表的首项字段为 `work_id,title,artwork,tab_artwork,description,labels`；知识 10/10、故事 20/20 项均有字符串 ID 及非空标题/description。此处“可读”仅指 JSON 可解析且这些文本字段非空，不代表逐项事实验证或全文审读。未复制列表正文、图片或作品内容到仓库。

详情 ID `1307332455322529792` 来自本次知识列表，选择代码要求 `typeof item.work_id === 'string'` 且符合单路径段规则，再直接 `encodeURIComponent(work_id)`；没有 Number/parseInt 或 `String(number)` 转换。虽然超过 JavaScript 安全整数范围，此 ID 在该次运行中是字符串，未被数值舍入。原始完整列表 JSON 未持久化，因此不提供原始字节级 token 存档；运行日志和选择条件保留了类型边界。文档明确知识与故事详情共用 `story/{work_id}`，本次没有猜测或改用 `knowledge/{work_id}`。

首次详情仅记录根 `error` 对象，没有保留具体业务错误；后经总控批准再次读取同 URL，捕获上表安全错误字段。该列表所列知识 ID 的详情在两次请求中均未取得；定向诊断明确返回“作品不存在”。这是实际响应差异，不能改写成成功，也不能据此断言所有作品详情不可用；没有进一步试探其他 ID。

## 与项目接入的区别

- **实际验证：** 以上两个无鉴权活动列表在该时间可访问；所选知识详情未取得。本次请求未入库，不代表本站新增了活动 API 产品入口。
- **未测：** `developer.zhihu.com` 的鉴权 `zhihu_search` 与 `question_answers`。总控本轮核对本项目配置后报告缺少 `ZHIHU_ACCESS_SECRET`；D 未读取该配置文件或其他项目/日常 CLI 密钥，也没有无凭据试探这些接口。活动列表成功不能证明搜索或回答摘要已通。
- **未执行：** 模型调用、不同 owner 的实际 Agent 登记/发帖/互助、采纳和正式部署。未触碰 3039/3043、56520/56521 或新隔离环境，不读取旧 Agent 或管理员凭据。后续真实搜索/回答摘要联调需要本项目 secret、API 权限和明确额度。

## 同轮 CLI 窄修与自动化

实现提交 `3e2890506a2b70c0caa665cf8e12de0de08e14ad` 已推送 `songconmaisaix31-design/gongzhi-connect` 并核对远端。按顺序普通 no-ff 同步了 `7b4a105d67b154b08a1a5a4c9d3647a62d87c838` 与 `4e4c0ce3301b0956919d31c90310957e2ae7ff69`，合并前工作树干净。

现有 CLI 增加可选 `register REQUEST_KEY --profile-stdin`，从标准输入接收 Agent 自己整理的 name/capabilities；不传时仍默认免填写。复用共享 RegisterAgentSchema、64 KB/60 秒输入边界、有限 grant 和独占凭据文件保存，拒绝自报 owner/scopes 或另一幂等键。没有修改共享 DTO、Core 授权、根依赖或页面；本轮尚未用真实 grant 执行此命令。

`node --import tsx --test "tests/connect/*.test.mjs"` **104/104 通过**；`npm run typecheck`、`npm run build:backend`、`git diff --check` 通过。新增测试覆盖 Agent 简介到登记请求的映射、可信 grant 回执、凭据不回显、非法权限/替换请求键/超长输入/取消在请求前拒绝。这些测试使用隔离替身，与上表实际互联网请求分别计数，不能替代真实登记或付费服务验收。
