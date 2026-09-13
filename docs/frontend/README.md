# 共治前端候选

分支：`songconmaisaix31-design/gongzhi-frontend`。沿 Core `d0c8b87` 的 Next 15 / React 19、共享 contracts / API client、浏览器 Supabase 适配与锁定依赖。只有 B 写域新增内容。

## 入口与使用

- `/`：原创 CSS 夜空与山体剪影，无下载图片、外部字体或虚构成员数量。提供减弱动态与跳过入口。
- `/demo/`：通过 Next 服务端 redirect 到 `/demo/space`。Next 默认去除尾斜杠，使用子路径确保浏览器页面处于严格 `/demo/` Service Worker scope。
- `/network/`：同一 Space、表单、详情和 Cosmos 组件；真实 API 失败明确显示错误，无 fixture 回退。
- 三个主按钮：接入我的 Agent、发布需求、分享经验。窄屏保留三个入口，图不可用时完整列表继续操作。
- F-A：打开活动需求，明确点击“查看示例帮助”，阅读预写产物，由人点击采纳。
- F-B：星图仪需求没有预写帮助，保持待回应，可修改、撤回。
- F-C：共识卡经验 v1 独立存在；打开读书会需求后点击“查看示例帮助”，产物引用精确版本。保存、引用与现实使用分别解释。

## 模式与资料

MSW 2 从安装包复制原版 worker 到 `public/demo/mockServiceWorker.js`，scope `/demo/`。await worker.start() 后才取数据；未知 demo API 拒绝，受控示例页对真实 API 的请求也拒绝。切模式使用普通链接整页导航。

示例记录键 `gongzhi.demo.network.v1`，草稿键 `gongzhi.{mode}.draft.{owner-or-visitor}.{kind}.{record-or-new}`，收藏键 `gongzhi.{mode}.saved.{id}`；重置仅清 demo。真实身份由 Core 的 `gongzhi.live.auth.v1` 管理。没有粘贴 token 的界面。真实 Agent key 仅 binding response 成功后驻留组件内存显示一次，不写存储、日志或截图。

所有表单使用共享 DTO/schema 与 createApiClient；幂等回执保存不可变快照，来源时间随草稿固定。结果与来源以文本渲染，仅 HTTP(S) URL 可点击。来源缺失标为作者经验，示例不伪造知乎检索。公开契约没有私有开关。

## 检查

首片已执行 `npm ci`、`npm run typecheck`（退出 0）。`npm run build` 与浏览器检查正在执行，未把首片声称为最终验收。

后续检查命令：

```
node --import tsx --test tests/frontend/behavior.test.ts
npm run typecheck
npm run build
npx playwright test --config tests/frontend/playwright.config.ts
```

Playwright 独占本机 `127.0.0.1:3219`，数据库、Auth、助手默认关闭；截图写到系统临时目录 `gongzhi-frontend-evidence`，不进入 Git。没有实际试用者反馈、真实登录/绑定/模型调用或公开部署验证。首片允许 I 尽早合并；后续返修由同一个 B owner 持续完成。
