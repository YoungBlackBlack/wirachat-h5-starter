# WebView 身份登录

核心诉求:H5 嵌在原生 App 的 WebView 里,原生要把已登录用户的 uid/昵称/头像透传给 H5,H5 用这份身份换一张 JWT,后续 API 用 JWT 走标准鉴权。

## 总流程

```
native app ──(bridge/url/storage)──> H5 (web/webview-identity.js)
                                       │
                                       │ POST /api/auth/webview
                                       ▼
                                   server/auth.js
                                       │
                                       │ upsert users + 签 JWT
                                       ▼
                               { token, userId }
```

## 宿主注入身份的 4 条通道

`web/webview-identity.js` 按顺序尝试:

### 1. JS Bridge(首选)

```js
// iOS WKWebView
window.webkit.messageHandlers.getUserInfo.postMessage({ type: "APP_GET_USER_INFO" });
// 原生通过 evaluateJavaScript 回注:
window.dispatchEvent(new CustomEvent("APP_USER_INFO", {
  detail: { userId: "42", nickname: "小明", avatar: "https://...", gender: "male" }
}));
```

```js
// Android WebView / React Native
window.ReactNativeWebView.postMessage(JSON.stringify({ type: "APP_GET_USER_INFO" }));
// RN/Android 通过 window.postMessage 回注:
window.postMessage(JSON.stringify({ type: "APP_USER_INFO", data: {...} }), "*");
```

```js
// 直接注入的同步 API
window.AppBridge = {
  getUserInfo() { return { userId: "42", nickname: "...", avatar: "...", gender: "male" }; }
};
```

### 2. URL query

```
https://your.app/?uid=42&nickname=%E5%B0%8F%E6%98%8E&avatar=https%3A%2F%2F...&gender=male
```

或:

```
?userInfo=<URL-encoded JSON>
```

字段名兼容:`userId` / `uid` / `openid` / `openId` / `unionid`。

### 3. localStorage 缓存

前一次成功拿到的身份会被 `webview-identity.js` 自动缓存到 `app.webview.identity.v1`。纯离线重开时可用。

### 4. 都拿不到 → 抛 `无法从 WebView 解析用户身份`

H5 需要引导用户走手机号登录(`/api/auth/sms/*`)或其他 fallback。

## 字段规范化

`web/webview-identity.js#normalizeIdentity` 把任意来源的 raw 对象规范成:

```ts
{
  externalUserId: string;   // 必须,空则返回 null
  nickname: string;         // 为空 → "未命名用户"
  avatar: string;
  gender: "male" | "female" | "unknown";
  raw: object;              // 原始数据,透传给后端
}
```

## 服务端

`POST /api/auth/webview` body:

```json
{
  "user": { "externalUserId": "42", "nickname": "...", "avatar": "...", "gender": "male" }
}
```

后端 `server/auth.js#upsertWebviewUser` 会 upsert 到 `users`(`user_code = webview:<externalUserId>`)然后 `signJwt` 返回:

```json
{ "ok": true, "data": { "token": "eyJ...", "userId": 42 } }
```

## 本地调试没 Bridge 怎么办

两条路:

- **URL 注入**: 手动拼 `?uid=42&nickname=test&gender=male` 打开
- **手工注入 AppBridge**: 浏览器 Console 里跑 `window.AppBridge = { getUserInfo: () => ({ userId: 42, nickname: "test", gender: "male" }) }` 再刷新

两者都能让 `bootIdentity()` 拿到身份 → 换 token。

## 测试身份切换(生产回归)

`?testAs=<uid>&testKey=<AUTH_TEST_KEY>` 会把这两个值写入 localStorage 后清理 URL。配合后端 `AUTH_TEST_KEY`,接口会把 `x-user-id` 认当前用户。仅用于**受控测试**,不要下发给真用户。
