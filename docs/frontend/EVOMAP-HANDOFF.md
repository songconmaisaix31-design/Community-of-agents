# EvoMap 风格交付 · 2026-09-14

- 基线：21f710703f131d96f36b601f7b11dcd962e03581。Hugo 静态壳、共享 React 组件、客户端与后端保持原技术栈。
- 按用户 evomap-frontend.md 重构顶栏、双入口 Hero、接入说明终端面板、左右并列 Agent 图/公告、紧凑线程与页脚。旧暖色 vendor 样式保留来源记录，本轮不再加载；不是在其上叠加主题覆盖。
- data-theme 默认为 dark；CSS 前同步初始化，偏好键 gongzhi.preference.theme。切换按钮 [data-theme-toggle]，标签为“切换到浅色主题”/“切换到深色主题”。存储异常不阻止切换，示例重置不清此键。
- 六图色见 app.css：dark #080b0e / #36d9ff / #00e580 / #ffd32f / #466575 / #93e8fc；light #f5f8fa / #007e9b / #087d52 / #a05700 / #879ca9 / #00627c。AgentCanvas 与专项测试本轮由 D 独占，第一片尚未合入 D，所以首片截图 Canvas 仍旧配色。
- 浅色文字/链接使用深青 #00748c，亮青仅主按钮底等合适用途。中文没有捆绑 HarmonyOS，诚实回退 PingFang SC/Microsoft YaHei/Noto Sans CJK SC/系统字体。

## 字体来源

从 google/fonts 的固定提交 809e4d8b8d7e9364a914909bb777679606c178b8 取得原始未修改字体，均已读 SIL OFL 1.1 并随资源保留完整版权与许可，自托管、无运行时字体外链：
- ofl/outfit/Outfit[wght].ttf → static/fonts/Outfit-Variable.ttf，UI/导航拉丁字形。
- ofl/rajdhani/Rajdhani-SemiBold.ttf → static/fonts/Rajdhani-SemiBold.ttf，展示字形。
- 对应 OFL.txt → static/licenses/Outfit-OFL.txt、Rajdhani-OFL.txt。
- https://github.com/google/fonts/tree/809e4d8b8d7e9364a914909bb777679606c178b8/ofl/outfit
- https://github.com/google/fonts/tree/809e4d8b8d7e9364a914909bb777679606c178b8/ofl/rajdhani

保留 my_blog 与 We Remember 历史许可，新增可访问 /hugo/licenses/ 索引；没有导入参考品牌、营销、统计、账号、文章或跟踪脚本。

## 第一片检查

- npm run build:hugo：通过（Hugo Extended 0.164.0）。
- npm run typecheck：通过。
- npm run build:backend：通过。
- 本机 Chrome 1440/390：深浅主题切换、两宽度示例授权→登记、无横向溢出通过；不是任何真实 Agent 回执。
- 首片截图：C:/Users/DW/AppData/Local/Temp/gongzhi-evomap-evidence/first-{1440|390}-{dark|light}.png。
- 原15项与新主题测试待第二片整体验收，需先合入 D 的图色改动。
- 预览仅 B 的 http://127.0.0.1:3221/demo/space ，测试仍用3219；未操作 I 的3019与DB。

## 选择器交接

保留 h1“把你的 Agent 带来。”、.entry-actions、[data-open-panel]、.mode-switch、公告/线程/data-record-id及Agent选择器。旧 .identity-rail 移为 .site-header 与 nav[aria-label=主导航]；窄屏模式入口统一为 .mode-switch，不再另设 .mobile-mode-switch。旧React footer移到Hugo静态壳；不再渲染重复footer。
## 第二片交给图谱联验

- 手机顶栏保留三条紧凑锚点导航；120px scroll-padding 避开吸顶顶栏，触控和键盘均可到达正文。
- --graph-link 调整为 dark #92aebc / light #29485c；在既有0.7 opacity下与对应背景合成，理论对比分别4.59:1、4.05:1。实际Canvas颜色与可点击连线另由D专项和原浏览器测试验证。
- 5项新增主题浏览器测试通过（含两宽度、草稿、线程提交、对比度、主题重置保留、模式导航、存储不可用、无JS、减弱动态、手机锚点）；8项MSW HTTP行为通过。
- 原生像素测试现在读取当前CSS颜色，检查截图中颜色向量与点的连通区域；保留88%独立可见点及实际鼠标命中断言，不以DOM断言替代Canvas。
- 此片全Canvas回归仍等待合入已获总控批准的D 1aca7ca。
