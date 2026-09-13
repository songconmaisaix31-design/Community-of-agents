# 集成验收

更新：2026-09-13。分支：`integration/gongzhi-mvp`。初始业务基线：`2e842b23cac1dc3c9e892e3152759a0e8cad9fcd`；已合入总控管理提交 `c8a679636f68c7568db2fba4fae8326673c7e7ce`。

当前只有源文档，尚无应用代码、锁文件或可体验入口。以下为运行条件实测和待验收切片，**不代表功能完成**。唯一进度看板仍为 `DEVELOPMENT.md`。

## 本机运行条件

| 实际检查 | 结果 |
| --- | --- |
| `node --version` | `v24.16.0` |
| `npm --version` | `11.13.0` |
| `pnpm --version` | `11.2.2`；采用哪个包管理器等待 Core 锁文件 |
| `git --version` | `2.47.0.windows.1` |
| `docker version --format '{{.Server.Version}}'` | 服务端 `29.5.3` 可达；没有启动容器或改动数据库 |
| Chrome / Edge 文件版本 | `152.0.7977.83` / `153.0.4234.32` |
| 已缓存 Chromium headless shell 1234 | 使用独立临时 profile、`--disable-background-networking --dump-dom about:blank` 启动成功，退出码 0，返回空白 HTML |
| `Get-Command psql,pg_isready,supabase,playwright` | 均未在 PATH；不能据此认定机器没有数据库 |

浏览器缓存只是可执行条件，尚无项目内 Playwright 测试依赖。未读取其他项目配置、日常 CLI 认证或密钥；未连接任何业务数据库、Supabase、模型或知乎服务。

## 最少验收切片

| 切片 | 接收代码后执行的行为检查 | 当前状态 / 依赖 |
| --- | --- | --- |
| 可构建基座 | 阅读 package 生命周期脚本，排除 build 隐含迁移；锁定安装后执行 Core 发布的 typecheck/test/build | 未执行；等待 Core SHA、锁和命令 |
| 完整示例与模式隔离 | 三入口、三故事、刷新与重置；只请求 `/demo/api/*`，未知示例 API 失败；整页切到真实空间后不受 demo SW 控制、不带身份与草稿；真实失败不回退 fixture | 未执行；等待 Builder SHA 与正式契约 |
| REST/MCP 与授权 | 两身份发布、读取、回复、采纳；伪造 owner、越权、撤销及未绑定原生写入均拒绝；REST/MCP 使用同一业务规则 | 未执行；等待 Core 实现及本项目获准隔离数据库 / 身份 |
| 版本与重复 | 修改需求后旧结果不能被当前版本采纳；重复提交不产生重复有效结果；Agent 无采纳权 | 未执行；等待 Core / Connect 实现 |
| 受限助手与来源 | 去重、预算、超时/取消状态；当前输入产生新结果，来源可追溯，未取到的来源不编造 | 本地负例等待 Connect；真实模型 / 知乎未提供 |

复用 Core 确认的现有测试工具，只在 `tests/integration/**` 增补跨模块断言，不预写未发布的 URL 细节或对象字段。每次业务增量合并后重新执行锁定安装、typecheck/test/build 及该增量适用的最小用户流程；失败交回原 owner。

## 当前限制

- 尚未取得 Core / Connect / Builder 业务提交，因此没有功能、API 或浏览器流程通过记录。
- 未提供本项目数据库、Supabase 测试身份、模型和知乎授权；内存替身或模拟传输通过只能算对应本地模块检查。
- 后续可运行版本仅监听 localhost；没有公开部署、正式赛事提交或生产迁移。
