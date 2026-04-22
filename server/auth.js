// 最小闭环鉴权:HS256 JWT(用 Node 内置 crypto 实现,无第三方依赖)。
// - /api/auth/sms/request: 生产上应对接真实短信通道;当前用内存 Map 发放验证码。
// - /api/auth/sms/verify:  手机号+验证码 → 绑定或创建 user,签发 token。
// - /api/auth/webview:     WebView 桥接送来的 uid + 基础 profile → upsert + 签发 token。
// - requireAuth 中间件:   校验 Authorization: Bearer <jwt>,把 req.authUser 挂上。
// - 非生产环境允许 x-user-id / ?uid= 回退(保留本地开发体验)。

import crypto from "node:crypto";
import { resolveRequestUserContext } from "./user-context.js";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 天

function isProduction() {
  const env = String(process.env.APP_ENV || process.env.NODE_ENV || "")
    .trim()
    .toLowerCase();
  return env === "production" || env === "prod";
}

function getJwtSecret() {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    if (isProduction()) {
      throw new Error("AUTH_JWT_SECRET is required in production.");
    }
    // 开发环境给一个明显的假 key,避免启动失败。
    return "dev-secret-do-not-use-in-production";
  }
  return secret;
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  return Buffer.from(pad ? padded + "=".repeat(4 - pad) : padded, "base64");
}

export function signJwt(payload, ttlSeconds = TOKEN_TTL_SECONDS) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + ttlSeconds, ...payload };
  const headerSeg = base64UrlEncode(JSON.stringify(header));
  const bodySeg = base64UrlEncode(JSON.stringify(body));
  const data = `${headerSeg}.${bodySeg}`;
  const signature = base64UrlEncode(
    crypto.createHmac("sha256", getJwtSecret()).update(data).digest()
  );
  return `${data}.${signature}`;
}

export function verifyJwt(token) {
  if (!token || typeof token !== "string") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const [headerSeg, bodySeg, signature] = parts;
  const data = `${headerSeg}.${bodySeg}`;
  const expected = base64UrlEncode(
    crypto.createHmac("sha256", getJwtSecret()).update(data).digest()
  );
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(bodySeg).toString("utf8"));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return null;
  }
  return payload;
}

export function extractBearerToken(req) {
  const header = req.get("authorization") || req.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

// 身份解析:生产环境只信任 JWT;非生产环境向下兼容 x-user-id/?uid=。
// 生产环境额外提供一个"测试身份"通道:请求带 x-user-id + x-test-key(或 ?testKey=)
// 且与 AUTH_TEST_KEY 匹配时,视为该用户(便于多账号回归测试)。
export function resolveAuthenticatedUser(req) {
  const token = extractBearerToken(req);
  if (token) {
    const claims = verifyJwt(token);
    if (claims?.sub) {
      const userId = Number(claims.sub);
      if (Number.isInteger(userId) && userId > 0) {
        return { userId, via: "jwt", claims };
      }
    }
  }
  if (!isProduction()) {
    const fallback = resolveRequestUserContext(req);
    if (fallback?.userId) {
      return { userId: fallback.userId, via: "dev-fallback" };
    }
  } else {
    const testKey = process.env.AUTH_TEST_KEY;
    if (testKey) {
      const presented = req.get("x-test-key") || req.query?.testKey;
      if (presented && String(presented) === testKey) {
        const fallback = resolveRequestUserContext(req);
        if (fallback?.userId) {
          return { userId: fallback.userId, via: "test-key" };
        }
      }
    }
  }
  return null;
}

export function requireAuth(req, res, next) {
  const user = resolveAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({
      ok: false,
      message: "Authentication required.",
    });
    return;
  }
  req.authUser = user;
  next();
}

// ---- SMS 登录(mock 通道)----
// phone -> { code, expiresAt }
const smsCodeStore = new Map();
// phone -> userId
const phoneUserMap = new Map();
let nextDemoUserId = 1_000_000;
const webviewUserMap = new Map();
let nextWebviewDemoUserId = 2_000_000;

function normalizePhone(value) {
  const trimmed = String(value || "").trim();
  if (!/^\+?\d{6,20}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeCode(value) {
  const trimmed = String(value || "").trim();
  return /^\d{4,8}$/.test(trimmed) ? trimmed : null;
}

function generateCode() {
  // 开发模式固定 123456 便于调试;生产走随机。
  if (!isProduction()) {
    return "123456";
  }
  return String(crypto.randomInt(100000, 1000000));
}

export function createSmsCode(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    const err = new Error("Invalid phone number.");
    err.status = 400;
    throw err;
  }
  const code = generateCode();
  smsCodeStore.set(normalized, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  // 生产接通真实短信通道时,应在此处发送。当前仅返回掩码提示。
  return {
    phone: normalized,
    // 仅非生产环境回显验证码,便于联调。
    code: isProduction() ? undefined : code,
    expiresInSeconds: 300,
  };
}

async function resolveUserIdForPhone(pool, phone) {
  const cached = phoneUserMap.get(phone);
  if (cached) return { userId: cached, isNew: false };

  // 复用 users.user_code 存手机号,避免本轮改 schema。
  if (pool) {
    const [rows] = await pool.query(
      "SELECT id FROM users WHERE user_code = ? LIMIT 1",
      [`phone:${phone}`]
    );
    if (rows[0]?.id) {
      phoneUserMap.set(phone, rows[0].id);
      return { userId: rows[0].id, isNew: false };
    }
    const [result] = await pool.query(
      `INSERT INTO users (user_code, nickname, gender, status)
       VALUES (?, ?, 'unknown', 'active')`,
      [`phone:${phone}`, `用户${phone.slice(-4)}`]
    );
    phoneUserMap.set(phone, result.insertId);
    return { userId: result.insertId, isNew: true };
  }

  // 无 pool(比如只做健康检查的本地 dev):分配一个内存 id。
  nextDemoUserId += 1;
  phoneUserMap.set(phone, nextDemoUserId);
  return { userId: nextDemoUserId, isNew: true };
}

export async function verifySmsCodeAndIssueToken(pool, phone, code) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedCode = normalizeCode(code);
  if (!normalizedPhone || !normalizedCode) {
    const err = new Error("Invalid phone or code.");
    err.status = 400;
    throw err;
  }
  const record = smsCodeStore.get(normalizedPhone);
  if (!record || record.expiresAt < Date.now() || record.code !== normalizedCode) {
    const err = new Error("Verification code invalid or expired.");
    err.status = 401;
    throw err;
  }
  smsCodeStore.delete(normalizedPhone);

  const { userId, isNew } = await resolveUserIdForPhone(pool, normalizedPhone);
  const token = signJwt({ sub: String(userId), phone: normalizedPhone });
  return {
    token,
    userId: String(userId),
    isNew,
    expiresInSeconds: TOKEN_TTL_SECONDS,
  };
}

// ---- WebView 身份登录 ----
// 桥接协议:前端通过 webview-identity.js 拿到宿主传来的 uid/nickname/avatar/gender,
// POST 到 /api/auth/webview;后端用 `webview:${externalUserId}` 作为 user_code,
// upsert 到 users 表,再签发 JWT。
function normalizeWebviewGender(value) {
  const raw = String(value == null ? "" : value).trim().toLowerCase();
  if (["1", "m", "male", "man", "boy", "男", "男性"].includes(raw)) {
    return "male";
  }
  if (["2", "f", "female", "woman", "girl", "女", "女性"].includes(raw)) {
    return "female";
  }
  return "unknown";
}

function pickWebviewValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value == null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return null;
}

function normalizeWebviewIdentity(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const userInfo =
    typeof source.userInfo === "string"
      ? (() => {
          try {
            return JSON.parse(source.userInfo);
          } catch {
            return null;
          }
        })()
      : source.userInfo;
  const nestedUser =
    source.user && typeof source.user === "object"
      ? source.user
      : source.profile && typeof source.profile === "object"
        ? source.profile
        : userInfo && typeof userInfo === "object"
          ? userInfo
          : {};
  const merged = { ...source, ...nestedUser };
  const externalUserId = pickWebviewValue(merged, [
    "externalUserId",
    "userId",
    "uid",
    "openid",
    "openId",
    "unionid",
    "unionId",
  ]);

  if (!externalUserId) {
    const err = new Error("externalUserId/userId/uid is required.");
    err.status = 400;
    throw err;
  }

  return {
    externalUserId,
    nickname:
      pickWebviewValue(merged, ["nickname", "nickName", "name"]) ||
      `用户${externalUserId.slice(-6)}`,
    avatar:
      pickWebviewValue(merged, [
        "avatar",
        "avatarUrl",
        "avatarURL",
        "headimgurl",
      ]) || null,
    gender: normalizeWebviewGender(
      merged.gender != null ? merged.gender : merged.sex
    ),
    raw: source,
  };
}

async function upsertWebviewUser(pool, identity) {
  const userCode = `webview:${identity.externalUserId}`;
  if (!pool) {
    if (!webviewUserMap.has(userCode)) {
      nextWebviewDemoUserId += 1;
      webviewUserMap.set(userCode, nextWebviewDemoUserId);
    }
    return webviewUserMap.get(userCode);
  }

  const [rows] = await pool.query(
    "SELECT id FROM users WHERE user_code = ? LIMIT 1",
    [userCode]
  );
  let userId = rows[0]?.id || null;

  if (!userId) {
    const [result] = await pool.query(
      `INSERT INTO users (user_code, nickname, avatar_url, gender, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [userCode, identity.nickname, identity.avatar, identity.gender]
    );
    userId = result.insertId;
  } else {
    await pool.query(
      `UPDATE users
         SET nickname = ?,
             avatar_url = COALESCE(?, avatar_url),
             gender = CASE WHEN ? IN ('male', 'female', 'unknown') THEN ? ELSE gender END
       WHERE id = ?`,
      [
        identity.nickname,
        identity.avatar,
        identity.gender,
        identity.gender,
        userId,
      ]
    );
  }

  return userId;
}

export async function loginWithWebviewIdentity(pool, payload) {
  const identity = normalizeWebviewIdentity(payload);
  const userId = await upsertWebviewUser(pool, identity);
  const token = signJwt({
    sub: String(userId),
    webview: identity.externalUserId,
  });

  return {
    token,
    userId: String(userId),
    externalUserId: identity.externalUserId,
    expiresInSeconds: TOKEN_TTL_SECONDS,
    user: {
      id: String(userId),
      externalUserId: identity.externalUserId,
      nickname: identity.nickname,
      avatar: identity.avatar,
      gender: identity.gender,
    },
  };
}

// ---- CORS 白名单 ----
function parseCorsOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (raw) {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (isProduction()) {
    return [];
  }
  // 开发默认白名单:本地常见端口。
  return [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:5173",
  ];
}

function isLocalDevOrigin(origin) {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "127.0.0.1" ||
        url.hostname.endsWith(".local"))
    );
  } catch {
    return false;
  }
}

export function buildCorsOptions() {
  const allowed = parseCorsOrigins();
  return {
    origin(origin, callback) {
      // 同源或没有 Origin(curl/服务端到服务端)放行。
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      if (!isProduction() && isLocalDevOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed.`));
    },
    credentials: true,
  };
}
