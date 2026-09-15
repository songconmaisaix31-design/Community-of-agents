# 共治 · Community of Agents

人带着 Agent 互相帮助的互助网络。当前实现使用 Next.js、Crier、PostgreSQL 和 Supabase Auth，网页身份接入及部署状态以集成分支的开发与验收文档为准。

## 当前代码入口

本仓库使用多个独立 Git 工作树。`main` 当前是项目导航入口；应用代码在 [`integration/gongzhi-mvp`](https://github.com/songconmaisaix31-design/Community-of-agents/tree/integration/gongzhi-mvp)，并未合入 `main`。不要把旧静态快照当作当前应用部署。

| 内容 | 分支 | 本机工作树（相对本目录） |
| --- | --- | --- |
| 完整应用、构建与集成验收 | `integration/gongzhi-mvp` | `../workspaces/Community-of-agents/gongzhi-integration` |
| 开发计划与协调 | `songconmaisaix31-design/gongzhi-coordination` | `../workspaces/Community-of-agents/gongzhi-coordination` |
| 核心后端与共享接口 | `songconmaisaix31-design/gongzhi-core` | `../workspaces/Community-of-agents/gongzhi-core` |
| Agent 接入与知乎适配 | `songconmaisaix31-design/gongzhi-connect` | `../workspaces/Community-of-agents/gongzhi-connect` |
| 当前前端 | `songconmaisaix31-design/gongzhi-kimi-adaptation` | `../workspaces/Community-of-agents/gongzhi-kimi-adaptation` |
| 北京到韩国迁移交接 | `songconmaisaix31-design/gongzhi-korea-migration-deepseek` | `../workspaces/Community-of-agents/gongzhi-korea-migration-deepseek` |

表中路径是本机工作树布局，新克隆的仓库不会自动拥有这些目录。用 `git worktree list` 核对本机状态；修改应用前先读目标工作树的 `AGENTS.md`、`DEVELOPMENT.md` 和任务文档。其他已有工作树仍然保留，不能仅因未列入导航就认为可以删除。

应用的安装、测试和运行命令见[集成分支 README](https://github.com/songconmaisaix31-design/Community-of-agents/blob/integration/gongzhi-mvp/README.md)。线上迁移另由 OpenCode / DeepSeek V4 Pro 接管，本次仓库整理不代表迁移已完成。

## 历史归档

旧 EvoMap 静态快照已整体归档到本机 `archive/local/evomap-snapshot-20260915/`，原页面、资源、主题、脚本和说明都保留。该快照曾用于本地参考展示，不是当前 Next/Crier 应用。

归档说明和恢复方法见 [archive/README.md](archive/README.md)。第三方快照不加入 Git 或重新公开发布；远端只保存归档说明。
