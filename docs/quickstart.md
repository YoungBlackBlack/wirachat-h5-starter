# Quickstart

从 0 到本地跑通 H5 空壳 + 后端 API。

## 1. 拿到模板

```bash
git clone <this-starter-repo> my-project
cd my-project
bash scripts/rename-project.sh my-project
```

`rename-project.sh` 做了什么:
- 改 `package.json#name`
- 改 `README.md` 首行标题
- 把 `web/*.js` 里的 `"app."` localStorage 前缀改成 `<prefix>.`

## 2. 装依赖

```bash
npm install
```

Node 要求 ≥ 20(用到了原生 `fetch` 和 `node:test`)。

## 3. 填环境变量

```bash
cp .env.example .env.local
```

最少需要填:

- **`PORT`** — 本地监听端口
- **`AUTH_JWT_SECRET`** — 随机 32+ 字符
- **`MYSQL_*`** — 本地 MySQL(可以用 Docker 起一个)
- COS / IM 留空也能启动,只是对应接口会 503

完整清单见 `.env.example`。

## 4. 建库

```bash
npm run db:init
```

骨架只有 `users` + `analytics_events` 两张表。业务项目在 `sql/002_*.sql` 往后加自己的表,或用 `ensureColumn/ensureIndex` 做增量迁移(见 `server/db.js`)。

## 5. 启动

```bash
npm start
```

验收:

| URL | 预期 |
|---|---|
| `http://localhost:<PORT>/api/health` | `{ ok: true, ... }` |
| `http://localhost:<PORT>/` | 黑底空壳 H5,显示"未登录" |
| `http://localhost:<PORT>/im-playground.html` | IM 测试页 |
| `http://localhost:<PORT>/design-system/preview/` | DS 预览索引 |

## 6. 调试

- `?vconsole=1` 挂上 URL 会自动加载 vConsole
- `?testAs=<uid>&testKey=<AUTH_TEST_KEY>` 临时切身份(见 `server/user-context.js`)
- `curl localhost:<PORT>/api/health` 看后端当前配置快照(DB/COS/IM 是否就绪)

## 7. 部署

见 [deployment.md](./deployment.md)。
