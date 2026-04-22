# Project Instructions

这是 `wirachat-h5-starter` 的 AI 协作默认约定。新项目基于这个模板时,保留/修改本文件让 AI 自动跟随你的偏好。

## Default Design System

任何要求创建、重设计、扩展或重新样式化前端页面的请求,都默认使用本仓库 `design-system/` 目录下的视觉语言,不需要用户重述偏好。

视觉真源文件:

- `design-system/README.md`
- `design-system/colors_and_type.css`
- `design-system/preview/`
- `design-system/ui_kits/mobile/`

## Frontend Workflow

构建新页面或演进现有页面时:

1. 从现有产品结构开始:
   - `web/index.html`
   - `web/app.js`
   - `web/im-client.js` / `web/upload.js` 等通用模块
2. 复用现有架构和交互模式,不要随便引入其他前端栈,除非用户明确要求。
3. 默认应用 `design-system/` 的视觉语言:
   - 纯黑底
   - 白色透明层叠
   - 黄色/青色胶囊动作对
   - 简体中文文案
   - Alimama ShuHeiTi / PingFang SC / Montserrat 字体栈
4. 优先使用 DS 里已有的组件、间距、圆角、tokens,再创新。

## Icons And Assets

- 优先使用 `design-system/assets/icons/` 里的图标。
- 除非现有图标无法胜任,否则不要引入 Lucide/Heroicons 等线框图标库。
- 保留黑底 + 黄青胶囊的整体质感。

## Backend & Data

- 新接口:放到 `server/index.js` 或在 `server/routes/` 下拆成独立 router。
- 复用现有能力:`auth.js`(登录)、`file-storage.js`(上传)、`im-service.js`(IM)、`analytics.js`(埋点)、`db.js`(数据库)。
- 业务数据层由 AI 协助时,默认写在 `server/data-service.js`(本模板没有,业务项目自建)。
- 所有新接口都应遵循 `{ ok: true, data: {} }` / `{ ok: false, error: {} }` 返回约定。

## Deployment

- 部署靠 `scripts/deploy.sh <test|production>`,从 `.deploy.env` 读目标主机、PM2 名、健康检查 URL 等。
- 新增路由后记得同步更新 `docs/backend-api-baseline.md`。

## Output Expectation

除非用户另外说明,本仓库生成的前端代码应自然沿用现有产品感觉并默认符合本地 Design System。
