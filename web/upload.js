// 前端直传 COS 工具。
// 流程:
//   1. 向后端 /api/upload/cos-ticket POST { mimeType, prefix } 拿签名 PUT URL
//   2. fetch(uploadUrl, { method: 'PUT', body: blob }) 直接传到 COS
//   3. 成功后用 ticket.publicUrl 作为落盘地址
//
// 弱网重试:指数退避 + 最多 3 次;超时 30s;支持 onProgress(XHR 路径)。
// 默认走 fetch,传 { useXhr: true } 或 onProgress 时自动切 XHR(fetch 不支持上传进度)。
//
// 用法:
//   import { uploadBlob } from "/web/upload.js";
//   const { publicUrl, objectKey } = await uploadBlob(file, {
//     prefix: "avatar",
//     onProgress: (p) => console.log(p),
//   });

import Api from "./api.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2; // 首次 + 2 次重试 = 3 次尝试
const DEFAULT_RETRY_BASE_MS = 600;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferMimeType(blob, fallback) {
  if (blob && blob.type) return blob.type;
  if (fallback) return fallback;
  return "application/octet-stream";
}

async function requestTicket({ mimeType, prefix = "upload", api = Api } = {}) {
  const ticket = await api.requestCosUploadTicket({ mimeType, prefix });
  if (!ticket || !ticket.uploadUrl || !ticket.publicUrl) {
    const err = new Error("后端未返回可用的上传签名(检查 COS 配置)。");
    err.code = "TICKET_INVALID";
    throw err;
  }
  return ticket;
}

function putWithFetch(url, blob, { timeoutMs = DEFAULT_TIMEOUT_MS, mimeType } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    method: "PUT",
    headers: mimeType ? { "Content-Type": mimeType } : undefined,
    body: blob,
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) {
        const err = new Error(`COS PUT 失败: ${res.status} ${res.statusText}`);
        err.status = res.status;
        throw err;
      }
      return res;
    })
    .finally(() => clearTimeout(timer));
}

function putWithXhr(url, blob, { timeoutMs = DEFAULT_TIMEOUT_MS, mimeType, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.timeout = timeoutMs;
    if (mimeType) xhr.setRequestHeader("Content-Type", mimeType);
    if (typeof onProgress === "function") {
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percent: e.total > 0 ? e.loaded / e.total : 0,
        });
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr);
      } else {
        const err = new Error(`COS PUT 失败: ${xhr.status} ${xhr.statusText}`);
        err.status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error("网络错误(COS PUT)"));
    xhr.ontimeout = () => {
      const err = new Error("COS PUT 超时");
      err.code = "TIMEOUT";
      reject(err);
    };
    xhr.send(blob);
  });
}

function isRetriable(err) {
  if (!err) return false;
  if (err.code === "TIMEOUT") return true;
  if (err.name === "AbortError") return true;
  if (typeof err.status === "number") {
    // 5xx / 408 / 429 视为可重试
    return err.status >= 500 || err.status === 408 || err.status === 429;
  }
  // 典型网络错误
  return /network|failed to fetch/i.test(String(err.message || ""));
}

export async function uploadBlob(blob, options = {}) {
  if (!(blob instanceof Blob)) {
    throw new Error("uploadBlob: 第一个参数必须是 Blob/File。");
  }
  const {
    prefix = "upload",
    mimeType: mimeOverride,
    onProgress,
    useXhr,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    api = Api,
  } = options;

  const mimeType = inferMimeType(blob, mimeOverride);
  const ticket = await requestTicket({ mimeType, prefix, api });

  const putter = useXhr || typeof onProgress === "function" ? putWithXhr : putWithFetch;

  let attempt = 0;
  let lastErr;
  while (attempt <= maxRetries) {
    try {
      await putter(ticket.uploadUrl, blob, { timeoutMs, mimeType, onProgress });
      return {
        objectKey: ticket.objectKey,
        publicUrl: ticket.publicUrl,
        mimeType: ticket.mimeType || mimeType,
        size: blob.size,
        storageProvider: ticket.storageProvider || "cos",
      };
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries || !isRetriable(err)) break;
      const delay = retryBaseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
      await sleep(delay);
      attempt += 1;
    }
  }
  throw lastErr || new Error("上传失败");
}

// 便捷方法:从 <input type="file"> 事件里取文件直接传
export async function uploadFromInputEvent(event, options = {}) {
  const file = event?.target?.files?.[0];
  if (!file) throw new Error("未选择文件");
  return uploadBlob(file, options);
}

export default { uploadBlob, uploadFromInputEvent };

if (typeof window !== "undefined") {
  window.Upload = { uploadBlob, uploadFromInputEvent };
}
