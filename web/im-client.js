// 腾讯 IM SDK(@tencentcloud/chat)的轻量封装。
// 只做三件事:login / logout / sendText + 接收事件分发。业务项目按需在上面加群聊、文件消息等。
//
// 用法(浏览器 ESM):
//   import { createImClient } from "/web/im-client.js";
//   const client = await createImClient();
//   await client.login();
//   client.on("message", (msg) => console.log(msg));
//   await client.sendText({ to: "prod_42", text: "hi" });
//   await client.logout();
//
// 依赖:
//   - /web/api.js 的 Api.getImSession 拿 sdkAppId + imUserId + userSig
//   - SDK 默认从 /web/vendor/tim-js.js 加载(同仓库自托管,避免 CSP / CDN 风险)
//   - 如需换源,传 options.cdnUrl 或直接改 TIM_CDN_URL 常量

// 默认走本仓库 vendor 的 UMD 文件(见 scripts/vendor-im-sdk.sh)。
// 业务项目如果把 SDK 放到自家 CDN/COS,改这个常量或调用时传 options.cdnUrl。
const TIM_CDN_URL = "/web/vendor/tim-js.js";

let timSdkPromise = null;

function loadTimSdk(cdnUrl = TIM_CDN_URL) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IM client requires a browser environment."));
  }
  if (window.TencentCloudChat) return Promise.resolve(window.TencentCloudChat);
  if (timSdkPromise) return timSdkPromise;

  timSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = cdnUrl;
    script.async = true;
    script.onload = () => {
      if (window.TencentCloudChat) {
        resolve(window.TencentCloudChat);
      } else {
        reject(new Error("TencentCloudChat SDK 未挂载到 window。"));
      }
    };
    script.onerror = () => reject(new Error(`加载 IM SDK 失败: ${cdnUrl}`));
    document.head.appendChild(script);
  }).catch((err) => {
    timSdkPromise = null;
    throw err;
  });
  return timSdkPromise;
}

function pickApi(apiOverride) {
  if (apiOverride) return apiOverride;
  if (typeof window !== "undefined" && window.Api) return window.Api;
  throw new Error("找不到 Api,请先加载 /web/api.js 或通过 options.api 注入。");
}

export async function createImClient(options = {}) {
  const api = pickApi(options.api);
  const TencentCloudChat = await loadTimSdk(options.cdnUrl);

  // 1) 拿会话凭证
  const session = await api.getImSession(options.peerUid);
  if (!session || !session.sdkAppId || !session.userSig) {
    throw new Error("后端未返回 IM 会话凭证(检查 IM_SDK_APP_ID / IM_SECRET_KEY)。");
  }

  // 2) 创建 SDK 实例
  const chat = TencentCloudChat.create({ SDKAppID: Number(session.sdkAppId) });
  chat.setLogLevel(options.logLevel ?? 1); // 0=全量 1=release 2=warn 4=error

  // 3) 事件分发
  const listeners = new Map(); // name -> Set<fn>
  const emit = (name, payload) => {
    const set = listeners.get(name);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.warn(`[IM] listener(${name}) threw:`, err);
      }
    });
  };
  const on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => off(name, fn);
  };
  const off = (name, fn) => {
    const set = listeners.get(name);
    if (set) set.delete(fn);
  };

  chat.on(TencentCloudChat.EVENT.SDK_READY, () => emit("ready"));
  chat.on(TencentCloudChat.EVENT.SDK_NOT_READY, () => emit("not_ready"));
  chat.on(TencentCloudChat.EVENT.MESSAGE_RECEIVED, (event) => {
    const list = Array.isArray(event?.data) ? event.data : [];
    list.forEach((msg) => emit("message", msg));
  });
  chat.on(TencentCloudChat.EVENT.KICKED_OUT, (event) => emit("kicked", event));
  chat.on(TencentCloudChat.EVENT.ERROR, (event) => emit("error", event));
  chat.on(TencentCloudChat.EVENT.NET_STATE_CHANGE, (event) => emit("net", event));

  let loggedIn = false;

  async function login() {
    if (loggedIn) return session;
    await chat.login({
      userID: String(session.imUserId),
      userSig: String(session.userSig),
    });
    loggedIn = true;
    return session;
  }

  async function logout() {
    if (!loggedIn) return;
    try {
      await chat.logout();
    } finally {
      loggedIn = false;
    }
  }

  async function sendText({ to, text, priority }) {
    if (!to) throw new Error("sendText 需要 to(对端 imUserId)。");
    if (!text) throw new Error("sendText 需要 text。");
    const message = chat.createTextMessage({
      to: String(to),
      conversationType: TencentCloudChat.TYPES.CONV_C2C,
      priority: priority || TencentCloudChat.TYPES.MSG_PRIORITY_NORMAL,
      payload: { text: String(text) },
    });
    return chat.sendMessage(message);
  }

  async function getConversationList() {
    const res = await chat.getConversationList();
    return res?.data?.conversationList || [];
  }

  async function getMessageList(conversationID, count = 20) {
    const res = await chat.getMessageList({ conversationID, count });
    return res?.data?.messageList || [];
  }

  return {
    TencentCloudChat,
    chat,
    session,
    login,
    logout,
    sendText,
    getConversationList,
    getMessageList,
    on,
    off,
    get loggedIn() {
      return loggedIn;
    },
  };
}

if (typeof window !== "undefined") {
  window.createImClient = createImClient;
}

export default { createImClient };
