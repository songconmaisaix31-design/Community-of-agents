# 官方知乎 CLI 与 OAuth 接入补充任务

用户要求：将官方 zhihu-cli 能力配入共治，优先拥有 AI 原生的知乎 OAuth 登录能力。沿用已接手韩国迁移的 OpenCode / DeepSeek V4 Pro，由同一个 Agent 操作服务器。

## 已有实现与事实源

- 当前应用事实源：集成工作树的 AGENTS.md、DEVELOPMENT.md、docs/integration/zhihu-web-auth-acceptance.md、docs/connect/zhihu-oauth.md、docs/connect/official-sources.md、docs/connect/agent-skill.md。
- 已部署后端 f9a0b33a0d4325bdf9d9cf1037b731f1c40f14b4 包含 OAuth；复用实现，先核实缺口。
- 2026-09-15 实测 https://zhihu.davidwang.space/api/gongzhi/config 返回 HTTP 200，auth.available=true、provider=zhihu。这只证明配置就绪，不证明真实授权成功。
- 官方资料包在本机 Downloads：zhihu-cli-skill-0.7.2-beta.20260911131715 (3).zip。先读包内 zhihu/SKILL.md、references/hackathon-oauth.md、references/hackathon-user-profile-api.md；安装 CLI 前另读 references/cli.md 和配套 setup/run 脚本。

## 执行范围

1. 完成迁移阶段记录与提交后，继续这一补充任务。保留北京回滚环境，沿用韩国现有部署配置和镜像来源。
2. 配好官方技能及 CLI 使用入口，先通过官方 run 脚本 status 检查已有安装，缺失时按官方 setup 流程安装。记录实际版本和 capabilities；只使用官方发布源并执行其完整性校验。不要提交第三方二进制、凭据或个人数据。
3. OAuth 使用已有 ZHIHU_OAUTH_APP_ID、ZHIHU_OAUTH_APP_KEY、ZHIHU_OAUTH_REDIRECT_URI；只检查存在性和回调匹配，不输出密钥。CLI Access Secret 是另一套凭据，不是 OAuth 前置条件；缺少时单独记录，不阻塞网页登录。
4. 核对网页入口、授权跳转、authorization_code/state 回调、服务端 token 交换、官方 /user 身份读取、站内会话和退出。保留短期随机 state、浏览器绑定、原子一次性消费、HttpOnly/Secure 会话及 uid 无损解析。
5. 用户必须亲自在知乎页面完成登录与最终授权。先把正常浏览器登录入口准备到可用状态，再告知用户操作；不可用终端生成的另一浏览器 state 冒充完整流程。配置就绪、fixture 测试和真实授权分别报告。
6. 仅获取登录所需最小身份信息。不额外查询用户私有内容、上传知识或对公开接口暴露任意 CLI 命令执行能力。

## 文件边界与验收

- 继续遵守迁移工作树 HANDOFF.md 的 write_paths，运行配置及官方工具安装在原授权部署范围内。补充记录写入 docs/migration/zhihu-cli-oauth-report.md；可复用脚本放原有 ops/migration 范围。
- 若发现应用领域代码缺陷，提供准确复现与涉及文件的 Handoff，交原 Core/Connect/Frontend 负责人处理，避免修改其他工作树的在途代码。
- 验证官方脚本 status、CLI 版本及 capabilities；无有效 CLI 凭据时不得宣称内容 API 已验收。
- 验证 HTTPS 登录入口和配置、回调失败路径、适用现有测试；真实验收必须有用户实际完成授权后产生的有效站内会话及退出结果。所有记录脱敏。
- 阶段结束 commit + push，汇报分支、SHA、验证命令与结果、真实剩余限制和需要用户完成的最终授权操作。
