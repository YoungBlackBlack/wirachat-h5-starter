// 前端与后端的唯一出口。
// 仅做 HTTP 封装 + token 管理 + 通用 api(auth/im/upload/analytics);
// 业务项目在自己的模块里调用 Api.request 发自己的 /api/xxx,不要把业务方法塞到这里。

const TOKEN_STORAGE_KEY = "app.authToken";
const DEMO_USER_STORAGE_KEY = "app.demoUserId"; // 仅本地开发用
const TEST_KEY_STORAGE_KEY = "app.testKey";     // 受控测试身份,配合后端 AUTH_TEST_KEY

let authToken =
  typeof localStorage !== "undefined"
    ? localStorage.getItem(TOKEN_STORAGE_KEY) || ""
    : "";

// 支持 URL 带 ?testAs={uid}&testKey={key} 切换身份:写入 localStorage 后清理 URL。
(function consumeTestIdentityFromUrl() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const testAs = url.searchParams.get("testAs");
    const testKey = url.searchParams.get("testKey");
    let dirty = false;
    if (testAs) {
      localStorage.setItem(DEMO_USER_STORAGE_KEY, String(testAs));
      url.searchParams.delete("testAs");
      dirty = true;
    }
    if (testKey) {
      localStorage.setItem(TEST_KEY_STORAGE_KEY, String(testKey));
      url.searchParams.delete("testKey");
      dirty = true;
    }
    if (dirty) {
      window.history.replaceState({}, "", url.toString());
    }
  } catch {
    /* ignore */
  }
})();

function getTestKey() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(TEST_KEY_STORAGE_KEY) || "";
}

function setAuthToken(token) {
  authToken = token || "";
  if (typeof localStorage === "undefined") return;
  if (authToken) {
    localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function getAuthToken() {
  return authToken;
}

function getDemoUserId() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(DEMO_USER_STORAGE_KEY) || "";
}

function setDemoUserId(uid) {
  if (typeof localStorage === "undefined") return;
  if (uid) {
    localStorage.setItem(DEMO_USER_STORAGE_KEY, String(uid));
  } else {
    localStorage.removeItem(DEMO_USER_STORAGE_KEY);
  }
}

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}

async function request(path, { method = "GET", body, query, headers: extraHeaders } = {}) {
  const url = new URL(path, window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }

  const headers = { Accept: "application/json", ...(extraHeaders || {}) };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  } else {
    const demoUid = getDemoUserId();
    const testKey = getTestKey();
    if (demoUid && (isLocalDevHost() || testKey)) {
      headers["x-user-id"] = demoUid;
    }
    if (testKey) {
      headers["x-test-key"] = testKey;
    }
  }
  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  // vConsole 开启时打点:便于用 [API] 关键字过滤。
  const debugOn = typeof window !== "undefined" && window.__vc;
  const startedAt = debugOn ? Date.now() : 0;
  if (debugOn) {
    console.log("[API]", method, url.pathname + url.search, body ?? "");
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (netErr) {
    if (debugOn) {
      console.warn("[API]", method, url.pathname, "NETWORK_FAIL", netErr?.message || netErr);
    }
    throw netErr;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* 非 JSON 响应忽略 */
  }

  if (debugOn) {
    const ms = Date.now() - startedAt;
    console.log("[API]", method, url.pathname, response.status, ms + "ms");
  }

  if (!response.ok) {
    const err = new Error(
      payload?.message || `请求失败: ${response.status} ${response.statusText}`
    );
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

// ---- Auth ----
async function requestSmsCode(phone) {
  return request("/api/auth/sms/request", {
    method: "POST",
    body: { phone },
  });
}

async function verifySmsCode(phone, code) {
  const data = await request("/api/auth/sms/verify", {
    method: "POST",
    body: { phone, code },
  });
  if (data?.data?.token) {
    setAuthToken(data.data.token);
  }
  return data?.data || null;
}

async function loginWithWebview(payload) {
  const data = await request("/api/auth/webview", {
    method: "POST",
    body: payload,
  });
  if (data?.data?.token) {
    setAuthToken(data.data.token);
  }
  return data?.data || null;
}

async function getMe() {
  try {
    const res = await request("/api/auth/me");
    return res?.data || null;
  } catch {
    return null;
  }
}

function logout() {
  setAuthToken("");
}

// ---- IM ----
async function getImSession(peerUid) {
  const res = await request("/api/im/session", {
    query: peerUid ? { peerUid } : undefined,
  });
  return res?.data || null;
}

async function importImUsers(users) {
  const res = await request("/api/im/users/import", {
    method: "POST",
    body: { users },
  });
  return res?.data || null;
}

// ---- Upload(前端直传 COS)----
async function requestCosUploadTicket({ mimeType, prefix = "upload" } = {}) {
  const res = await request("/api/upload/cos-ticket", {
    method: "POST",
    body: { mimeType, prefix },
  });
  return res?.data || null;
}

// ---- Analytics ----
const ANALYTICS_SESSION_KEY = "app.analyticsSession";
function getAnalyticsSessionId() {
  if (typeof sessionStorage === "undefined") return null;
  let sid = sessionStorage.getItem(ANALYTICS_SESSION_KEY);
  if (!sid) {
    sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      sessionStorage.setItem(ANALYTICS_SESSION_KEY, sid);
    } catch {
      /* ignore */
    }
  }
  return sid;
}

async function track(eventName, payload = {}) {
  try {
    const body = {
      eventName,
      sessionId: getAnalyticsSessionId(),
      clientPlatform:
        typeof navigator !== "undefined" && /Mobi|Android|iPhone/i.test(navigator.userAgent || "")
          ? "mobile-web"
          : "web",
      clientVersion: "1.0.0",
      properties: payload.properties || null,
      occurredAt: new Date().toISOString(),
    };
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      navigator.sendBeacon("/api/events/track", blob);
      return;
    }
    await request("/api/events/track", { method: "POST", body });
  } catch {
    /* ignore */
  }
}

function trackPageView(path, prevPath, durationMs) {
  return track("page_viewed", {
    properties: { path, prevPath: prevPath || null, durationMs: durationMs || null },
  });
}

function trackError(scope, info = {}) {
  return track("error_occurred", {
    properties: {
      scope,
      message: String(info.message || "").slice(0, 500),
      source: info.source || null,
      line: info.line || null,
      col: info.col || null,
      stack: info.stack ? String(info.stack).slice(0, 1000) : null,
      path: typeof location !== "undefined" ? location.pathname : null,
    },
  });
}

export const Api = {
  // low-level
  request,
  // auth
  getAuthToken,
  setAuthToken,
  getDemoUserId,
  setDemoUserId,
  getTestKey,
  requestSmsCode,
  verifySmsCode,
  loginWithWebview,
  getMe,
  logout,
  // im
  getImSession,
  importImUsers,
  // upload
  requestCosUploadTicket,
  // analytics
  track,
  trackPageView,
  trackError,
};

if (typeof window !== "undefined") {
  window.Api = Api;
}

export default Api;
