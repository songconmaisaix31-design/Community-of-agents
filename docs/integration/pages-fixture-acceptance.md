# 公开黑客松 Fixture 演示验收（2026-09-15）

公开入口：<http://demo.zhihu.davidwang.space/>，自动进入 `/zh/?demo=atlas`。这是独立静态演示，不是北京完整服务恢复；原 `zhihu.davidwang.space`、鉴权和服务器均未变更。

- 原始公开资源：`f7c0164659cd9d67f652e8ae09be98444b0b79f8:public/community`；入口胶水与测试：`d409d882b971f68cce266e03acbe9d76aa287206`。普通合入 M `f45f24fcde17772077563a800ffd8037906b4f77` 后阶段集成 `9e5abbcade37636cbbc221356180bfaabb3b6578` 已推送。
- 独立 `gh-pages` 产物：`0a3813cfd3a1fffaa3137e7173d1990939d34017`，从新分支普通提交、推送；[Pages build 1215253665](https://api.github.com/repos/songconmaisaix31-design/Community-of-agents/pages/builds/1215253665) 为 `built`，完成于 2026-09-14 19:16:28 UTC，对应准确产物 SHA。
- 只发布 29 个原公开资源，加别名、说明页、CNAME 和 `.nojekyll`。26 个非 HTML 文件与原提交 Git blob 完全相同，保留字体和 Cosmos 许可；没有发布仓库 docs、私密资料、环境配置或业务数据。公开 Skill 原文只保留固定链接，不自动请求、复制、安装或执行。
- 仅产物的三个 HTML 提前固定 `demo=atlas`，以 CSP 禁止连接和表单提交；`/zh/board`、`/zh/connect`、直接 `/community/zh/…` 同样受限。原业务 JS 不改，不代理 fetch、不返回假 API 成功；退出进入 `/about/` 演示说明。所有角色、离线、下载、检查和反馈持续标注 Fixture，只有浏览器 sessionStorage 状态。

| 本轮实际检查 | 结果 |
| --- | --- |
| I Pages 本地产物 Chrome 桌面 1440 / 手机 390 | 2/2，入口、100 点、搜索、固定来源、A 分享后离线、B 下载、模拟检查、可选反馈、退出说明；零真实接口和跨源请求 |
| 原 F Atlas 的适用演示用例 | 9/9，含脚本/目录失败关闭、WebGL 列表备用、实际 Canvas 选点、镜头保留、重置与版本拒绝 |
| I 实际公网 HTTP Chrome 同两条流程 | 2/2，21.7 秒；实际截图已查看，未关闭浏览器安全或 TLS 校验 |
| 原 100 条公开 Skill 报告离线复核 | 100/100 名称、固定版本 URL 与原 HTTP200 结果匹配；本轮没有重刷来源请求 |
| 实际域名静态资源 | 三页、目录、CSS、graph bundle、Cosmos 许可共 7 项 HTTP200，与 gh-pages 已提交字节 7/7 相同；无斜杠三个入口正常跳转并 200 |
| M 独立复验 | 查看 I 公网实际日志及桌面/手机截图；从北京 ECS 正常访问演示域名，三页、目录、graph bundle 5/5 HTTP200，与 I 观察大小一致 |
| Pages DNS / HTTPS | GitHub health：DNS 有效、指向 GitHub 用户域、由 Pages 服务、HTTPS eligible、无 CAA 错误；证书仍待签发，严格 curl 当时 exit60 名称不匹配，未启用强制 HTTPS |

执行命令（复用现有锁定依赖和已安装 Chrome，无安装、后端构建或数据库测试）：

```sh
git archive f7c0164659cd9d67f652e8ae09be98444b0b79f8 public/community
node tests/frontend/evomap-atlas-fixture-sources.mjs --verify-report
node node_modules/playwright/cli.js test --config tests/frontend/evomap.config.ts tests/frontend/evomap-atlas-fixture.spec.ts --grep-invert 'live：'
node node_modules/playwright/cli.js test --config tests/integration/pages-fixture.config.ts
gh api repos/songconmaisaix31-design/Community-of-agents/pages/builds/1215253665
gh api repos/songconmaisaix31-design/Community-of-agents/pages/health
curl.exe --noproxy '*' --connect-timeout 5 --max-time 15 -I https://demo.zhihu.davidwang.space/
git diff --check
```

I runner 本地设置 `GONGZHI_PAGES_ARTIFACT`；公网设置 `GONGZHI_PAGES_TEST_URL=http://demo.zhihu.davidwang.space`，证据目录用 `GONGZHI_PAGES_EVIDENCE`。验证快照及日志在 `%TEMP%/gongzhi-pages-i-f7c0164/`：`validation/`、`pages-local.log`、`pages-f9-applicable.log`、`pages-public-http.log`、`public-assets.json`、`evidence/public-http/pages-desktop.png` 和 `pages-mobile.png`。依赖复用 `%TEMP%/gongzhi-method-i-75f2d0d-build/source/node_modules`。

初次 grep 锚点错误纳入了生产退出用例，结果 9 pass/1 fail；修正选择后 9/9。该生产用例要求退出进入真实 API，与此主机“始终演示”的要求不适用，已由 I 的退出说明/零接口断言替代。一次许可 GET 连接超时后有界重试 200；初次文件比对遇 Windows CRLF，改为准确 Git blob 后 7/7。新增入口 diff-check 通过；原生成 bundle 的既有空白保留，不为发布重写。

M 独占 DNS 并新增单一演示 CNAME；I 使用[官方 Pages 分支发布与域名协议](https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28)，未开付费功能。首次显式创建得到“已启用”409后只读确认同仓库、同分支、同域名；19:18 UTC 对同一 cname 保存一次 PUT204，未移除认领或更改 DNS。[GitHub 文档](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages)说明自定义域名 HTTPS 签发可能需要一小时；不能将 HTTP 成功写成有效 HTTPS。

真实限制：这里只验证合成演示，不代表真实 Agent 执行或人类批准。未配置的真实 OAuth、O 私有方法与 A/B 真执行仍未完成；北京域名 ICP 拦截没有解决，没有代理、隧道或备用端口绕过，也没有迁移、账户、模型、知乎或 SMTP 调用。公网各网络实际可达性须按独立复验记录，不保证所有访问者网络可达。
