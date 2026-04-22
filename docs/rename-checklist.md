# Rename Checklist

`scripts/rename-project.sh <name>` 会自动处理大部分,这里列出**脚本不改**、需要手工跟的地方。

## 脚本自动处理

- ✅ `package.json#name`
- ✅ `README.md` 首行 `# xxx`
- ✅ `web/api.js` / `web/webview-identity.js` / `web/debug.js` 里的 `app.xxx` localStorage/sessionStorage key 前缀

## 手工跟进

### 品牌文案 / UI

- [ ] `web/index.html` — `<title>`、`<h1>`、副文案
- [ ] `web/im-playground.html` — 若保留作为调试页可以不改
- [ ] `design-system/README.md` / `SKILL.md` — 品牌描述 / `name` 字段
- [ ] `design-system/colors_and_type.css` — 把品牌色 token 改成目标色
- [ ] `design-system/assets/logo-rounded.svg` — 替换为项目 logo
- [ ] `design-system/preview/logo.html` / `type-display.html` 里的"品牌名占位"

### 环境配置

- [ ] `.env.local` / `.env.test` / `.env.production` — 新 DB、新 COS 桶、新 IM AppID
- [ ] `.deploy.env`(从 `.deploy.env.example` 拷) — 新域名 + 新 PM2 应用名
- [ ] `ecosystem.config.cjs`(若存在) — PM2 应用名

### 服务端/路由

- [ ] `server/index.js` CSP 白名单 — 加上新域名 CDN / IM 域
- [ ] `server/analytics.js` — 调用 `registerAllowedEvents([...])` 登记业务事件名

### Git / CI

- [ ] 新 remote:`git remote set-url origin <new>`,若需 GitHub + Codeup 双 remote,参考 barter 原版 `scripts/setup-git-remotes.sh`
- [ ] `.github/` 下的 workflow(如复制过来) 按新仓库名调整

### 数据库

- [ ] `sql/002_*.sql` 开始加业务表
- [ ] 生产上第一次部署前,先 `npm run db:init:production` 做一次骨架建表
