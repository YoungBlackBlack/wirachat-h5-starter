// 统一埋点落库:失败不阻塞主业务,只打 console.warn。
// starter 只保留通用事件名(auth/app/api 耗时/上传/错误),业务项目按需在 ALLOWED_EVENTS 里增补。

const ALLOWED_EVENTS = new Set([
  // auth
  "auth_sms_requested",
  "auth_sms_verified",
  "auth_sms_failed",
  "auth_logout",
  "signup_completed",
  // app / page
  "app_opened",
  "page_viewed",
  "session_started",
  "session_ended",
  // 通用可观测
  "error_occurred",
  "api_request_completed",
  "feature_flag_exposed",
  // 上传
  "media_upload_started",
  "media_upload_completed",
  "media_upload_failed",
  // 风控占位
  "rate_limit_hit",
  "abuse_reported",
]);

function coerceInt(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function safeTrim(value, maxLen = 255) {
  if (value == null) return null;
  const str = String(value);
  if (!str) return null;
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function toJsonOrNull(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return null;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function isAllowedEvent(name) {
  return typeof name === "string" && ALLOWED_EVENTS.has(name);
}

// 业务项目可扩展 ALLOWED_EVENTS:
//   import { registerAllowedEvents } from "./analytics.js";
//   registerAllowedEvents(["treasure_card_viewed", "exchange_requested", ...]);
export function registerAllowedEvents(names = []) {
  for (const name of names) {
    if (typeof name === "string" && name) {
      ALLOWED_EVENTS.add(name);
    }
  }
}

export async function recordEvent(pool, payload) {
  if (!pool || !payload || !isAllowedEvent(payload.eventName)) {
    return false;
  }
  const row = {
    event_name: payload.eventName,
    user_id: coerceInt(payload.userId),
    session_id: safeTrim(payload.sessionId, 64),
    source: safeTrim(payload.source, 16),
    app_env: safeTrim(payload.appEnv || process.env.APP_ENV, 16),
    client_platform: safeTrim(payload.clientPlatform, 16),
    client_version: safeTrim(payload.clientVersion, 32),
    ip: safeTrim(payload.ip, 64),
    user_agent: safeTrim(payload.userAgent, 255),
    properties: toJsonOrNull(payload.properties),
    occurred_at: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
  };
  try {
    await pool.query(
      `INSERT INTO analytics_events
        (event_name, user_id, session_id, source, app_env,
         client_platform, client_version, ip, user_agent, properties, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.event_name,
        row.user_id,
        row.session_id,
        row.source,
        row.app_env,
        row.client_platform,
        row.client_version,
        row.ip,
        row.user_agent,
        row.properties,
        row.occurred_at,
      ]
    );
    return true;
  } catch (err) {
    console.warn("analytics recordEvent 失败:", err?.message || err);
    return false;
  }
}

// Fire-and-forget wrapper:给业务路由用,完全异步,永不抛。
export function trackServerEvent(pool, eventName, payload = {}) {
  if (!pool) return;
  void recordEvent(pool, { ...payload, eventName, source: "server" });
}
