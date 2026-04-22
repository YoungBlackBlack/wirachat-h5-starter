# IM 使用指南

模板集成腾讯云 IM(即时通信 IM,旧名 TIM),支持 C2C 文本消息开箱即用。

## 关键概念

- **imUserId**: `${imEnv}_${userId}`(例如 `dev_42`)。`imEnv` 来自 `APP_ENV` 或 `IM_ENV`,用于 dev/prod 隔离同一个 SDKAppID 下的数据。
- **UserSig**: 服务端用 `IM_SECRET_KEY` 签发给客户端的临时签名,腾讯 IM SDK 登录要用。180 天默认有效。

## 环境变量

| Key | 说明 |
|---|---|
| `IM_SDK_APP_ID` | 控制台 SDKAppID(数字) |
| `IM_SECRET_KEY` | 控制台密钥 |
| `IM_ADMIN_USER` | 管理员账号(用于 REST API) |
| `IM_ENV` | 可选,不填按 `APP_ENV` 取 `dev`/`prod` |

缺任一,`/api/im/session` 会 503 + `missingEnvKeys`。

## 核心 API

### `GET /api/im/session`

换 UserSig。返回:

```json
{
  "ok": true,
  "data": {
    "sdkAppId": 1400xxxxxx,
    "imEnv": "dev",
    "userId": 42,
    "imUserId": "dev_42",
    "userSig": "eJw...",
    "adminUser": "administrator",
    "peerUserId": null,
    "peerImUserId": null
  }
}
```

### `POST /api/im/users/import`

批量导入 IM 账号(相当于 upsert):

```json
{
  "users": [
    { "userId": 42, "nickname": "小明", "avatar": "https://..." }
  ]
}
```

## 前端用法

```js
import { createImClient } from "/web/im-client.js";

const client = await createImClient();
client.on("ready", () => console.log("已连接"));
client.on("message", (msg) => console.log(msg.payload.text));

await client.login();
await client.sendText({ to: "dev_99", text: "hi" });
```

封装了:
- 从 `Api.getImSession` 拿凭证
- 加载腾讯 IM SDK(默认 unpkg CDN,可替换自托管)
- 事件分发(ready / message / kicked / error / net)
- `sendText` / `getConversationList` / `getMessageList`

复杂场景(群聊、图片消息)直接用 `client.chat` 调原生 SDK。

## SDK 文件的管理

腾讯 IM Web SDK(`@tencentcloud/chat`)的 UMD build vendor 在 `web/vendor/tim-js.js`:

- **为什么自托管**: CSP 默认 `script-src 'self'`,外部 CDN 会被挡;自托管同源不受影响,也规避 unpkg 被墙/限流
- **首次 clone 后**: `npm install` 会自动跑 `scripts/vendor-im-sdk.sh` 把文件拉下来
- **升级 SDK**:
  1. 改 `package.json` 里的 `@tencentcloud/chat` 版本号
  2. `npm run vendor:im:update`(下载新版 + 写入新 sha)
  3. 把 `web/vendor/tim-js.js` 和 `web/vendor/tim-js.js.sha256` 一起提交
- **完整性校验**: `scripts/vendor-im-sdk.sh` 每次跑都会跟 `tim-js.js.sha256` 对照,不匹配直接退出非 0

## 测试页

打开 `/im-playground.html`:

1. 点"解析身份" — 优先走 WebView Bridge,否则读 URL `?testAs=&testKey=`,都没有就提示手动粘 token
2. "登录 IM" — 创建 SDK 实例 + 登录
3. 在另一个浏览器/设备用另一个账号登录,粘对端 `imUserId`,互发消息

## 常见坑

- **imEnv 没对齐**: 两端环境不一致(一边 dev 一边 prod)永远收不到消息,检查 `/api/im/session` 返回的 `imEnv` 是否相同。
- **未 import**: 新用户必须先跑 `/api/im/users/import` 在腾讯侧建档,否则 SDK `login` 会报 `70001`。`/api/auth/webview` 登录流程里业务项目可以自动兜底调一次 import。
- **SDK 体积**: `@tencentcloud/chat` 打包后 ~200KB,建议懒加载(`im-client.js` 已按需 `script`)。
- **UserSig 过期**: 超期会 `kicked`,需重调 `getImSession` 再 `login`。
