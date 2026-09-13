# Hugo 首轮来源与装配

只读源码位于 Git 外 `%TEMP%/gongzhi-correction-sources-20260913-b`。以下均核对了实际文件和 LICENSE，未复制文章、头像、个人账号、音乐、通知、埋点或执行日志。

| 来源与固定提交 | 实际复用 |
| --- | --- |
| [my_blog / master / 7d1f825a72bd106ff73525e7232dcb292b91b51c](https://github.com/songconmaisaix31-design/my_blog/tree/7d1f825a72bd106ff73525e7232dcb292b91b51c) | `assets/scss/custom.scss` 的变量、卡片、引用与长链接规则原样提取到 `frontend/hugo/assets/vendor/my-blog.css`；`layouts/_partials/head/custom.html` 的 Hugo favicon partial 结构保留，地址改为本项目原创 favicon.svg。 |
| [we-remember / main / 678ea3fee7479d48df0e54349615184ad760fdae](https://github.com/songconmaisaix31-design/we-remember/tree/678ea3fee7479d48df0e54349615184ad760fdae) | `app/styles.css` 的暖纸/珊瑚/鼠尾草变量、surface、app-shell、identity-rail、nav-list、message/suggestions、filter 规则提取到 `assets/vendor/we-remember.css`；`app/index.html` 的 rail/workspace 结构用于 Hugo partial 与 React BulletinSpace，替换家庭身份、内容、品牌和业务功能。 |

完整 MIT 原文随站点发布在 `frontend/hugo/static/licenses/`。my_blog 的 go.mod 引用 Stack v4.0.3；另行核对该主题提交 `3e123a30b79b5d52a3a8e88a9dd678fcfd28e418` 的 LICENSE 为 GPLv3，因此没有复制该第三方主题或把它当作 MIT 依赖。此次 Hugo 模板复用的是 my_blog 仓库内自有 partial/样式及 We Remember 结构。

Hugo `js.Build` 使用根 node_modules 的 React、cosmos.gl、Radix 与 MSW，直接导入既有共享 api-client/browser-auth 和组件；无第二套 DTO/客户端。Hugo 输出 `public/hugo`，资源 URL `/hugo/`；产品同源路径和根脚本由 C 配置，API 与 `/demo/` SW scope 保留。

首轮浏览器身份默认关闭；公共浏览失败明确报错。真实无档案接入命令及两名 Agent 实际执行属于下一轮验收，不以示例证明。
