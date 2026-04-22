# COS 使用指南

模板自带一套完整的腾讯云 COS 集成,涵盖**前端直传**这一种主要姿势。

## 环境变量

| Key | 说明 |
|---|---|
| `COS_SECRET_ID` | 腾讯云 SecretId |
| `COS_SECRET_KEY` | 腾讯云 SecretKey |
| `COS_BUCKET` | 桶名(含 AppID 后缀) |
| `COS_REGION` | 区域,例如 `ap-shanghai` |
| `COS_PUBLIC_BASE_URL` | 可选,如走 CDN/自定义域 |

没配全这些变量,`/api/upload/cos-ticket` 会返回 `{ ok: false, missingEnvKeys: [...] }`,便于诊断。

## 前端直传(推荐)

```js
import { uploadBlob } from "/web/upload.js";

const input = document.querySelector("input[type=file]");
input.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  const { publicUrl, objectKey } = await uploadBlob(file, {
    prefix: "avatar",           // 存储 key 前缀
    onProgress: ({ percent }) => console.log(percent),
  });
  // publicUrl 可直接用作 <img src>
});
```

底层两步:

1. `POST /api/upload/cos-ticket { mimeType, prefix }` → 拿 `{ uploadUrl, publicUrl, objectKey, ... }`
2. `fetch(uploadUrl, { method: 'PUT', body: blob })` 直接把文件传到 COS

`upload.js` 自带:
- **弱网重试**(最多 3 次,指数退避 + 抖动)
- **30s 超时**
- **可选 XHR 路径**,支持 `onProgress`(fetch 不支持上传进度)
- **只放行 image/audio/video**(后端白名单)

## 服务端落盘(二选一备选)

`server/file-storage.js` 也暴露了 `persistMediaFromPayload`,处理 `data:` base64 输入直接写入 COS 或本地 `uploads/`。适合从 LLM 生成图片直写落盘的场景。业务项目按需引入,不在本模板路由中暴露。

## 生命周期建议

- **临时内容**: `prefix="tmp"` + 定期清理(COS lifecycle)
- **用户头像 / 内容图**: `prefix="avatar"` / `prefix="post"`,永久保留

## 常见坑

- **CORS**: 桶 CORS 要允许 `PUT` + `GET` + 需要的 `Content-Type` 头。签名 URL 不自动带 CORS。
- **Signature mismatch**: 前端 `fetch` 时传的 `Content-Type` 必须跟请求 ticket 时的 `mimeType` 完全一致,否则签名不通过。
- **大文件**: 超过 500MB 建议改用 COS 分片上传(`postObject`/`multipartUpload`),本模板未封装。
