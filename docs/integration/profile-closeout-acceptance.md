# CLI 档案与隔离配置准备收尾（2026-09-14）

分支 `integration/gongzhi-mvp`，干净基线 `7b4a105d67b154b08a1a5a4c9d3647a62d87c838`；按序 `git merge --no-ff` 合入 M `e3bd8ac9d6892e97908093484f0b82040513da19`、C `bbe010075c44955a95f7a7cdbc9979a2ae5a9018`、D `513db37095207e864b3a37b5cf6a0f5ba180ef46`，无冲突。对应合并提交为 `9569b8d9878970bd8733e0e88e4eb59171d2fb0d`、`a2dd976d6ca2d98c3403d54e816ce066d6eabaaf`、`a24e04f39065c87bc5d71badf2db7656304e7d81`；均已阶段 push，后继仅本报告。

验收取自 `git archive a24e04f39065c87bc5d71badf2db7656304e7d81` 的 Git 外快照；依赖复用相同锁文件的独立安装，未修改旧预览共享依赖。根依赖/锁、业务 API/授权、页面、原 nginx.conf/init-db.sh 均无差异；I 未改领域代码或新增测试。

| 实际命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过，Windows Node 24.16.0 / npm 11.13.0 |
| `npm test` | 164 项：155 pass、0 fail、9 skip；含新增 C 配置默认值/严格目标/CORS/拒绝覆写 3 项与 D profile-stdin 2 项 |
| `docker compose -f infra/local-auth/compose.yaml config --format json` | 仅合成值内存渲染通过：默认项目 gongzhi-live-20260914、卷 gongzhi-live-20260914_pg-data、回环 PG56520/Auth56521、site3039、原 nginx 只读挂载均不变；未创建资源 |
| `npm run build`（Windows 快照） | 退出 0，但 standalone 复制依赖 junction 出现 EPERM，不能视作完整部署包 |
| `docker build --tag gongzhi-integration:closeout-a24e04f .`（同 SHA 原始快照） | 通过：Node24 基础镜像内实际 `npm run build`、standalone 复制及非 root 最终镜像导出成功，无迁移；只构建，不启动服务 |

本轮构建镜像为 `sha256:1aadcf197ed01b296e4bc4b47c87d56d3861493f2eee71a6226944e40911b2fa`，源码 `a24e04f39065c87bc5d71badf2db7656304e7d81`，尚未部署或做该镜像运行验收；Windows 的 EPERM 日志保留，未通过改配置隐藏警告。

测试进程清除继承的 GONGZHI/数据库/Supabase/模型/知乎环境，不加载私有配置。9 项 skip 为 5 项真实 Auth/PG 写测和 4 项原在线 HTTP 入口；本轮未重放浏览器登录/发布/采纳或旧数据库验收。新增 CLI 测试使用合成 grant/HTTP/临时凭据，验证 owner/scopes/替换幂等键、超长或取消输入均在请求前拒绝，成功简介只映射 name/capabilities，权限仍来自服务端回执；不代表真实登记。配置测试只创建临时哨兵文件验证拒绝写入，没有生成新配置。

**运行版本保持上轮**：只读核对 http://127.0.0.1:3039/zh/ 对应容器 `gongzhi-integration-ec12c9e`（CID `86f1f8b8bba87133805236a826bbe77814f08045bf04075d057f36c2140e892a`、镜像 `sha256:b933ecf7737c3fae1485a2719ca4666d83a7a3e1caae4ef74ceba4fc5bf249ef`）仍 healthy，仅绑定回环。GET `/agent-skill.md` 与 ec12c9e 源文一致，不含本轮 `--profile-stdin` 说明；新指南已集成源码，**尚未部署到 3039**。未修改或重启任何现有容器/数据库，未创建账号、grant、Agent、业务数据或新隔离环境。

**知乎证据由 D 交付，I 未重复外调**：[实际只读报告](../connect/zhihu-live-readonly-2026-09-14.md)记录共 4 次官方活动 GET，两列表 HTTP 200（知识 10 / 故事 20 项）；所选字符串 ID 的详情及获准复查均 HTTP 400，复查业务码 40404「作品不存在」，详情未取得。受保护的搜索/回答摘要因缺本项目 Access Secret 尚未实测；活动列表成功不替代这些能力。用户本人网页登录由 Root 处理，本轮不介入；模型调用、不同 owner 的实际协作、数据库清理和公网部署均未执行。

原始日志在 Git 外 `%TEMP%/gongzhi-closeout-I-a24e04f.{typecheck.log,test.log,build.log,docker-build.log,compose-check.json}`；没有新增截图或复制知乎正文。

## 后续鉴权实测（2026-09-14 05:32–05:33 UTC）

Root 在源码 `5538efc90bbf60c691f7d467912a919318969316` 复用既有 `createZhihuSearch` 完成以下真实调用；I 仅审阅 Git 外聚合日志 `gongzhi-zhihu-authenticated-20260914.json`、`gongzhi-zhihu-answers-live-20260914.json`，未读取私有配置或重复请求。

| 能力与参数 | 实际结果 |
| --- | --- |
| 搜索一次，Count=3 | HTTP 200、Code=0，3 条非空文章摘要，cached=false |
| 回答摘要一次，offset=0、limit=3 | HTTP 200、Code=0，3 条非空回答摘要，cached=false；IsEnd=false、NextOffset 为字符串 `"3"` |

首次搜索没有问题链接，Root 随后从公开 web 索引取得问题 URL 再读取回答；没有重试或自动翻页。搜索返回的跟踪链接、账户标识和正文未复制到本文。Root 另交接初始额度查询：两能力各 total=10、used=0、remaining=10；两份日志记录业务调用后的两次额度查询，最终两能力各 used=1、remaining=9，连同初始查询共 3 次 quota GET。

这更新了上文“当时缺少凭据、尚未实测”的状态，不改变先前活动详情 HTTP 400 / 40404 的历史结果。Root 报告仅将本轮指定凭据保存至既有 Git 外项目配置，保持当前用户独占 ACL 和其他键不变；服务未重启，3039 仍运行 ec12c9e 镜像，模型 key/id 缺失且助手禁用。本次未运行模型、助手 run、业务写入、数据库操作或 Agent 交流；接口鉴权成功不等于平台端到端或上线成功。本次 I 仅追加文档并审阅 diff/敏感信息，未重复测试或构建。
