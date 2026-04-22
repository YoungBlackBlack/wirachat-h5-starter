# Changelog

本项目版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/):

- `patch`(0.0.x)— bug 修复、文档、小调整、vendor 升级
- `minor`(0.x.0)— 向后兼容的新功能
- `major`(x.0.0)— 破坏性改动(API 变更、目录结构调整等)

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),每次会话一节,按时间倒序。

---

## [0.1.2] — 2026-04-22

**主题:开启 ADR(架构决策记录)目录**

### Added
- `docs/decisions/` 目录,用于记录需要沉淀的架构/协作决策
- `docs/decisions/0001-repo-hosting-strategy.md` — 代码仓库托管策略(GitHub vs Codeup),当前状态 `open`,含 5 个待回答的关键问题和 4 种候选方案对比

### 为什么
- 多人协作即将开始,仓库托管策略(尤其 GitHub / Codeup 如何取舍)需要团队共同决策,不能口头讨论完就忘
- 这类跨项目、影响长期的决策值得独立沉淀,CHANGELOG 记不下完整上下文

### 风险与回滚
- 纯文档,无代码改动,无回滚必要
- 如果后续决定不走 ADR 模式,直接删目录即可

### 后续动作
- 团队讨论 `0001` 文档里的 5 个关键问题
- 定完方案后把文档 status 从 `open` 改 `accepted`,补充实施步骤

---

## [0.1.1] — 2026-04-22

**主题:vendor 化静态资源,CSP 收口**

### Added
- `scripts/vendor-im-sdk.sh` — 从 unpkg 拉 `@tencentcloud/chat` UMD + SHA256 完整性校验
- `scripts/vendor-vconsole.sh` — 同样模式,vConsole 3.15.1
- `web/vendor/tim-js.js`(725KB) + `.sha256` 落盘
- `assets/vconsole.min.js`(286KB) + `.sha256` 落盘
- `package.json` 加 `postinstall` / `vendor:im` / `vendor:im:update` / `vendor:vconsole` / `vendor:vconsole:update` 五个脚本
- `docs/im-usage.md` 新增 "SDK 文件的管理" 小节,说明升级流程

### Changed
- `web/im-client.js` 的 `TIM_CDN_URL` 从 unpkg 切到 `/web/vendor/tim-js.js`,顺手修了原来 `@latest/dist/umd/` 的错误路径

### Removed
- `TODO-next-session.md`(上轮遗留工作已完成)

### 为什么
- 外部 CDN(unpkg)受 CSP `script-src 'self'` 拦截,同时有被墙/限流风险
- 自托管同源加载,安全边界收紧,线上稳定性可控

### 风险与回滚
- **风险**:git 仓库体积 +1MB 左右(两个 vendor 文件)
- **回滚**:`git revert b203c97` 即可,SDK 会回到外部 CDN 状态(但 CSP 拦截问题会回来)

### 验证
- playground 加载 `/web/vendor/tim-js.js` → `200`,`window.TencentCloudChat.VERSION = 3.6.6` ✅
- playground 加载 `/assets/vconsole.min.js` → `200`,右下角 vConsole 按钮出现 ✅
- 零次外部 CDN 请求 ✅

---

## [0.1.0] — 2026-04-22

**主题:项目初始化**

从 barter 项目抽象出的 H5/WebView 起手模板,包含:
- Express 服务端(auth / COS 直传 / IM 凭证签发)
- 前端模块(api.js / upload.js / webview-identity.js / im-client.js / debug.js)
- Design System(tokens + 字体 + 图标 + 预览卡)
- MySQL 骨架 SQL + 初始化/巡检脚本
- 多环境部署脚本(test / production)

对应 commit:`1fc54c6`
