# wirachat-h5-starter

WebView / H5 app 的起手模板,提取自 [barter](https://barter.wirachat.com) 项目的通用能力:

- 📱 **WebView 身份登录**(JS Bridge / 手机号短信 / JWT)
- ☁️ **腾讯云 COS 上传**(服务端中转 + 前端直传)
- 💬 **腾讯云 IM 接入**(后端 UserSig + 前端 SDK 封装 + 测试页)
- 🎨 **Design System**(纯黑 + 胶囊色 + Alimama ShuHeiTi,29 个中文 SVG 图标)
- 📊 **基础埋点**(10% 抽样 API 耗时 + 业务事件)
- 🚀 **一键部署**(PM2 + Nginx + 健康检查)

## 3 分钟 Quickstart

```bash
# 1. 克隆 & 改名
git clone <this-starter> your-project-name
cd your-project-name
bash scripts/rename-project.sh your-project-name

# 2. 装依赖
npm install

# 3. 填 .env(至少填 MYSQL + COS + IM)
cp .env.example .env
vim .env

# 4. 初始化数据库(只有 users + analytics_events 两张骨架表)
npm run db:init

# 5. 本地跑
npm start
# → http://localhost:3000/api/health
# → http://localhost:3000/               (空壳 H5)
# → http://localhost:3000/im-playground  (IM 登录 + 发消息测试)
```

## 目录结构

```
├── server/                   # Node/Express 后端
│   ├── index.js              # 路由入口(健康检查 + auth + upload + im + analytics)
│   ├── env.js                # .env 多环境加载
│   ├── db.js                 # MySQL 连接池 + 增量建表骨架
│   ├── auth.js               # JWT + SMS + WebView 身份登录
│   ├── user-context.js       # 用户上下文 + imEnv/imUserId
│   ├── file-storage.js       # COS 上传 + dataURL 持久化 + 临时凭证
│   ├── im-service.js         # 腾讯 IM UserSig + 账号导入
│   ├── analytics.js          # 埋点
│   └── *.test.js
├── web/                      # 前端静态资源
│   ├── index.html            # 空壳入口
│   ├── app.js                # 身份解析 → 换 token
│   ├── api.js                # HTTP 封装 + token 管理
│   ├── im-client.js          # 腾讯 IM SDK 封装
│   ├── im-playground.html    # IM 登录 + 发消息测试页
│   ├── upload.js             # COS 直传工具(含弱网重试)
│   ├── webview-identity.js   # 桥接解析 uid
│   └── debug.js              # vConsole 开关
├── assets/                   # 图标 + vConsole
├── design-system/            # DS:tokens + 字体 + 图标 + 预览卡
├── sql/                      # 骨架 SQL
├── scripts/                  # 部署脚本(参数化)
└── docs/                     # 使用文档
```

## 文档索引

- [quickstart.md](docs/quickstart.md) — 从 0 到部署的完整流程
- [rename-checklist.md](docs/rename-checklist.md) — 改名时要替换的所有位置
- [cos-usage.md](docs/cos-usage.md) — COS 三种上传姿势
- [im-usage.md](docs/im-usage.md) — IM 接入原理 + 常见坑
- [webview-identity.md](docs/webview-identity.md) — WebView 身份登录约定
- [deployment.md](docs/deployment.md) — 部署 & 运维
- [backend-api-baseline.md](docs/backend-api-baseline.md) — 模板自带的 /api/* 清单

## License

MIT
