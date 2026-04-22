// WebView 身份桥接:
// 从 URL / JS Bridge(iOS webkit / Android BarterApp / React Native) / localStorage 里
// 尽力解析出 uid + profile,然后 POST 到 /api/auth/webview 换 JWT。
// 各桥接通道都是"能拿到就拿、拿不到拉倒",最后 bootIdentity 里只要有一个通道成功就返回。
(function attachWebviewIdentity(global) {
  const DEFAULT_TIMEOUT = 1200;
  const STORAGE_KEY = "app.webview.identity.v1";
  const SESSION_KEY = "app.authToken";

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function normalizeGender(value) {
    const raw = String(value == null ? "" : value).trim().toLowerCase();
    if (["1", "m", "male", "man", "boy", "男", "男性"].includes(raw)) return "male";
    if (["2", "f", "female", "woman", "girl", "女", "女性"].includes(raw)) return "female";
    return "unknown";
  }

  function normalizeIdentity(raw) {
    const source = raw || {};
    const userInfo =
      typeof source.userInfo === "string"
        ? safeJsonParse(source.userInfo, {})
        : source.userInfo || {};
    const user = source.user || source.profile || userInfo || source;
    const externalUserId =
      user.externalUserId ||
      user.userId ||
      user.uid ||
      user.openid ||
      user.openId ||
      user.unionid ||
      user.unionId ||
      source.externalUserId ||
      source.userId ||
      source.uid ||
      source.openid ||
      source.openId ||
      source.unionid ||
      source.unionId;
    const nickname =
      user.nickname ||
      user.nickName ||
      user.name ||
      source.nickname ||
      source.nickName ||
      source.name;
    const avatar =
      user.avatar ||
      user.avatarUrl ||
      user.avatarURL ||
      user.headimgurl ||
      source.avatar ||
      source.avatarUrl ||
      source.avatarURL ||
      source.headimgurl;
    const gender = normalizeGender(
      user.gender != null
        ? user.gender
        : user.sex != null
          ? user.sex
          : source.gender != null
            ? source.gender
            : source.sex
    );

    if (!externalUserId) return null;
    return {
      externalUserId: String(externalUserId).trim(),
      nickname: String(nickname || "").trim() || "未命名用户",
      avatar: String(avatar || "").trim(),
      gender,
      raw: source,
    };
  }

  function readFromUrl(search) {
    const params = new URLSearchParams(search || global.location.search || "");
    const data = {};
    params.forEach((value, key) => {
      data[key] = value;
    });
    if (data.userInfo) {
      const parsed =
        safeJsonParse(decodeURIComponent(data.userInfo), null) ||
        safeJsonParse(data.userInfo, null);
      if (parsed) data.userInfo = parsed;
    }
    return normalizeIdentity(data);
  }

  function getCachedIdentity() {
    try {
      return normalizeIdentity(safeJsonParse(global.localStorage.getItem(STORAGE_KEY), null));
    } catch (_) {
      return null;
    }
  }

  function setCachedIdentity(identity) {
    if (!identity) return;
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    } catch (_) {}
  }

  function dispatchBridgeRequest() {
    const message = JSON.stringify({
      type: "APP_GET_USER_INFO",
      source: "webview-identity",
      at: Date.now(),
    });

    // 业务项目可在宿主侧注入 global.AppBridge.getUserInfo() → identity。
    if (global.AppBridge && typeof global.AppBridge.getUserInfo === "function") {
      try {
        const result = global.AppBridge.getUserInfo();
        if (result) {
          return Promise.resolve(
            typeof result.then === "function" ? result : normalizeIdentity(result)
          );
        }
      } catch (_) {}
    }

    if (
      global.webkit &&
      global.webkit.messageHandlers &&
      global.webkit.messageHandlers.getUserInfo
    ) {
      try {
        global.webkit.messageHandlers.getUserInfo.postMessage({
          type: "APP_GET_USER_INFO",
        });
      } catch (_) {}
    }

    if (
      global.ReactNativeWebView &&
      typeof global.ReactNativeWebView.postMessage === "function"
    ) {
      try {
        global.ReactNativeWebView.postMessage(message);
      } catch (_) {}
    }

    if (global.parent && global.parent !== global) {
      try {
        global.parent.postMessage(message, "*");
      } catch (_) {}
    }

    return null;
  }

  function requestFromBridge(timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (identity) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(identity || null);
      };

      const timer = global.setTimeout(() => finish(null), timeoutMs || DEFAULT_TIMEOUT);
      const cleanup = () => {
        global.clearTimeout(timer);
        global.removeEventListener("message", onMessage);
        global.removeEventListener("APP_USER_INFO", onCustomEvent);
      };

      const onMessage = (event) => {
        const payload =
          typeof event.data === "string" ? safeJsonParse(event.data, event.data) : event.data;
        if (!payload) return;
        const type = payload.type || payload.event;
        const body = payload.user || payload.userInfo || payload.data || payload;
        if (type && !["APP_USER_INFO", "USER_INFO", "WEBVIEW_USER_INFO"].includes(type)) return;
        const identity = normalizeIdentity(body);
        if (identity) finish(identity);
      };

      const onCustomEvent = (event) => {
        const identity = normalizeIdentity(event.detail || event.data);
        if (identity) finish(identity);
      };

      global.addEventListener("message", onMessage);
      global.addEventListener("APP_USER_INFO", onCustomEvent);

      const immediate = dispatchBridgeRequest();
      if (immediate && typeof immediate.then === "function") {
        immediate.then((value) => finish(normalizeIdentity(value) || value)).catch(() => null);
      } else if (immediate) {
        finish(normalizeIdentity(immediate));
      }
    });
  }

  async function resolveIdentity(options) {
    const opts = options || {};
    const urlIdentity = readFromUrl(opts.search);
    const bridgeIdentity = await requestFromBridge(opts.timeoutMs || DEFAULT_TIMEOUT);
    const cachedIdentity = getCachedIdentity();
    const identity = bridgeIdentity || urlIdentity || cachedIdentity;
    if (identity) setCachedIdentity(identity);
    return identity;
  }

  async function bootIdentity(options) {
    const opts = options || {};
    const apiBase = (opts.apiBase || "").replace(/\/$/, "");
    const identity = await resolveIdentity(opts);
    if (!identity && opts.requireIdentity !== false) {
      throw new Error(
        "无法从 WebView 解析用户身份,请确认宿主通过 URL 参数或 JS Bridge 注入 uid/nickname/avatar/gender。"
      );
    }
    if (!identity) return { user: null, token: null, identity: null };

    const response = await fetch(`${apiBase}/api/auth/webview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(
        identity.raw ? { ...identity.raw, user: identity } : { user: identity }
      ),
    });
    const json = await response.json().catch(() => ({}));
    const payload =
      json && typeof json === "object" && json.data && typeof json.data === "object"
        ? json.data
        : json;
    if (!response.ok || !json.ok) {
      throw new Error(
        (json.error && json.error.message) || json.message || "WebView 身份登录失败"
      );
    }
    try {
      if (payload && payload.token) global.localStorage.setItem(SESSION_KEY, payload.token);
    } catch (_) {}
    global.dispatchEvent(new CustomEvent("APP_IDENTITY_READY", { detail: payload }));
    return payload;
  }

  function getSessionToken() {
    try {
      return global.localStorage.getItem(SESSION_KEY);
    } catch (_) {
      return null;
    }
  }

  global.WebviewIdentity = {
    normalizeGender,
    normalizeIdentity,
    readFromUrl,
    getCachedIdentity,
    setCachedIdentity,
    resolveIdentity,
    bootIdentity,
    getSessionToken,
  };
})(window);
