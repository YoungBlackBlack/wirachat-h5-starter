# Backend API Baseline

模板自带的 `/api/*` 清单。业务项目在此基础上加自己的路由,不要改模板接口的响应约定。

## 响应约定

**所有接口**统一:

```json
// 成功
{ "ok": true, "data": {...} }

// 失败
{ "ok": false, "message": "human readable", "error": "optional" }
```

HTTP status 语义正常(400/401/403/404/500),body 里 `ok` 冗余标识,方便前端统一处理。

## 健康 / 诊断

### `GET /api/health`
无需鉴权。返回服务版本 + DB/COS/IM 配置是否完备。

### `POST /api/debug/dump`
无需鉴权。前端上报任意 JSON 到服务端 stderr(便于 `pm2 logs` 里 tail)。payload ≤ 10KB。

### `GET /api/db/ping` / `GET /api/db/schema`
无需鉴权(生产建议加 `AUTH_TEST_KEY` 限制)。DB 连通性 + 当前表结构快照。

## Auth

### `POST /api/auth/sms/request`
Body: `{ phone }`。生成一次性验证码。开发环境可在响应或日志里拿到 code,生产需接 SMS 网关(模板未内置)。

### `POST /api/auth/sms/verify`
Body: `{ phone, code }` → `{ token, userId }`。

### `POST /api/auth/webview`
Body: `{ user: { externalUserId, nickname?, avatar?, gender? } }` → `{ token, userId }`。见 [webview-identity.md](./webview-identity.md)。

### `GET /api/auth/me`
需 `Authorization: Bearer <token>`。→ `{ userId, via }`。

## IM

### `GET /api/im/session?peerUid=<uid>`
需鉴权。→ `{ sdkAppId, imEnv, userId, imUserId, userSig, adminUser, peerUserId?, peerImUserId? }`。见 [im-usage.md](./im-usage.md)。

### `POST /api/im/users/import`
需鉴权。批量 upsert 腾讯 IM 账号。Body: `{ users: [{ userId, nickname?, avatar?, imEnv? }] }`。

## Upload

### `POST /api/upload/cos-ticket`
需鉴权。Body: `{ mimeType, prefix? }` → `{ uploadUrl, publicUrl, objectKey, mimeType, expiresIn, storageProvider }`。见 [cos-usage.md](./cos-usage.md)。

## Analytics

### `POST /api/events/track`
无需鉴权(但会记录当前认证上下文)。Body:

```json
{
  "eventName": "page_viewed",
  "sessionId": "s_xxx",
  "clientPlatform": "mobile-web",
  "clientVersion": "1.0.0",
  "properties": { "path": "/", "...": "..." }
}
```

事件名走白名单,扩展用 `registerAllowedEvents([...])`(见 `server/analytics.js`)。

## 业务项目在哪加接口

直接在 `server/index.js` 里加路由,或者新建 `server/routes/<biz>.js` 并在 `index.js` 里 `app.use('/api/<biz>', router)`。保持以下约定即可:

1. 使用 `requireAuth` 中间件做鉴权
2. 用 `resolveEffectiveUser(req)` 拿当前用户(已内置 demo/test key 兜底)
3. 响应遵守 `{ ok, data, ... }` 约定
4. 需记录埋点的业务事件,先调 `registerAllowedEvents(["your_event"])` 在启动时登记
