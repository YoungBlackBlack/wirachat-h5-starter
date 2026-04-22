// wirachat-h5-starter 最小 Express 入口。
// 只挂载通用能力:health / auth(sms + webview) / upload(cos-ticket) / im(session + import) / analytics。
// 业务项目应:
//   - 在 server/data-service.js 里定义自己的业务逻辑
//   - 在本文件末尾 `registerAdditionalRoutes(app)` 附近扩展自己的路由
//   - 需要时在 sql/ 下加增量 DDL

import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bootstrapDatabase,
  createMysqlPool,
  getMysqlMissingEnvKeys,
  getSchemaTables,
  isMysqlConfigured,
} from "./db.js";
import { loadAppEnv } from "./env.js";
import {
  createUserSig,
  getImMissingEnvKeys,
  getImRuntimeConfig,
  importImAccount,
  isImConfigured,
} from "./im-service.js";
import {
  buildImUserId,
  resolveAnonymousUserContext,
  resolveRequestUserContext,
  resolveRequestedPeerUserId,
} from "./user-context.js";
import { getVersionInfo } from "./version.js";
import { isAllowedEvent, recordEvent, trackServerEvent } from "./analytics.js";
import {
  buildCorsOptions,
  createSmsCode,
  loginWithWebviewIdentity,
  requireAuth,
  resolveAuthenticatedUser,
  verifySmsCodeAndIssueToken,
} from "./auth.js";
import { createCosUploadTicket, getUploadsRoot } from "./file-storage.js";

const envState = loadAppEnv();
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const webRoot = path.join(projectRoot, "web");
const assetsRoot = path.join(projectRoot, "assets");
const designSystemRoot = path.join(projectRoot, "design-system");
const uploadsRoot = getUploadsRoot();

const app = express();
const port = Number(process.env.PORT || 3000);
const disableHttpCache = process.env.DISABLE_HTTP_CACHE === "1";

// CSP 白名单:默认允许当前源 + COS bucket(若已配置) + data/blob。
const derivedCosOrigin = process.env.COS_BUCKET
  ? `https://${process.env.COS_BUCKET}.${
      process.env.COS_ENDPOINT ||
      (process.env.COS_REGION
        ? `cos.${process.env.COS_REGION}.myqcloud.com`
        : "cos.ap-shanghai.myqcloud.com")
    }`
  : null;
const secureAssetOrigins = Array.from(
  new Set(
    [process.env.COS_PUBLIC_BASE_URL, derivedCosOrigin]
      .filter(Boolean)
      .map((value) => {
        try {
          return new URL(value).origin;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  )
);
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${secureAssetOrigins.join(" ")}`,
  `media-src 'self' data: blob: ${secureAssetOrigins.join(" ")}`,
  "font-src 'self' data:",
  "connect-src 'self' https: http: wss: ws:",
].join("; ");

app.set("trust proxy", true);
app.use(cors(buildCorsOptions()));
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", contentSecurityPolicy);
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (disableHttpCache) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  if (req.secure) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  next();
});

// 接口请求体允许 10MB:留给 dataURL 上传场景(前端直传 COS 之前的兜底)。
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// 接口耗时采样埋点:默认 10% 采样。
const API_TIMING_SAMPLE_RATE = Number(process.env.API_TIMING_SAMPLE_RATE || 0.1);
const API_TIMING_SKIP_PATHS = new Set(["/api/events/track", "/api/health"]);
app.use("/api", (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (API_TIMING_SKIP_PATHS.has(req.path)) return;
    if (res.statusCode >= 500) return;
    if (Math.random() >= API_TIMING_SAMPLE_RATE) return;
    try {
      trackServerEvent(mysqlPool, "api_request_completed", {
        ...analyticsContextFromRequest(req),
        properties: {
          route: req.route?.path || req.path,
          method: req.method,
          status: res.statusCode,
          durationMs: Date.now() - start,
        },
      });
    } catch {
      /* ignore */
    }
  });
  next();
});

// HTML/JS/CSS 不缓存:WebView 客户端缓存 bug 多,发版必须立刻生效。
app.use((req, res, next) => {
  if (/\.(html?|js|mjs|css|map)$/i.test(req.path) || req.path === "/") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// 静态资源:
// - /uploads   → 本地 dataURL 兜底目录(file-storage 生成的文件)
// - /design-system → 字体/图标/预览页
// - /          → web/ 下的前端
if (existsSync(assetsRoot)) {
  app.use("/assets", express.static(assetsRoot));
}
if (existsSync(designSystemRoot)) {
  app.use("/design-system", express.static(designSystemRoot));
}
app.use("/uploads", express.static(uploadsRoot));
// 既挂 / 也挂 /web,因为 index.html 里 <script src="/web/app.js"> 指向的是 web/ 下同名文件。
app.use("/web", express.static(webRoot));
app.use(express.static(webRoot));

const cosRequiredEnvKeys = [
  "COS_SECRET_ID",
  "COS_SECRET_KEY",
  "COS_BUCKET",
  "COS_REGION",
];

const missingCosEnvKeys = cosRequiredEnvKeys.filter((key) => !process.env[key]);
const missingMysqlEnvKeys = getMysqlMissingEnvKeys(process.env);
const mysqlConfigured = isMysqlConfigured(process.env);
const cosConfigured = missingCosEnvKeys.length === 0;
const missingImEnvKeys = getImMissingEnvKeys(process.env);
const imConfigured = isImConfigured(process.env);

const mysqlPool = mysqlConfigured ? createMysqlPool(process.env) : null;

const schemaBootstrapState = {
  attempted: false,
  initialized: false,
  initializedAt: null,
  error: null,
  tables: [],
};

function requireMysqlConfigured(res) {
  if (!mysqlConfigured) {
    res.status(500).json({
      ok: false,
      message: "MySQL environment variables are incomplete.",
      missingEnvKeys: missingMysqlEnvKeys,
    });
    return false;
  }
  return true;
}

function requireCosConfigured(res) {
  if (!cosConfigured) {
    res.status(500).json({
      ok: false,
      message: "COS environment variables are incomplete.",
      missingEnvKeys: missingCosEnvKeys,
    });
    return false;
  }
  return true;
}

function requireImConfigured(res) {
  if (!imConfigured) {
    res.status(500).json({
      ok: false,
      message: "IM environment variables are incomplete.",
      missingEnvKeys: missingImEnvKeys,
    });
    return false;
  }
  return true;
}

async function initializeDatabaseSchema() {
  if (!mysqlPool) {
    return;
  }
  schemaBootstrapState.attempted = true;
  try {
    await bootstrapDatabase(mysqlPool);
    const tables = await getSchemaTables(mysqlPool, process.env.MYSQL_DATABASE);
    schemaBootstrapState.initialized = true;
    schemaBootstrapState.initializedAt = new Date().toISOString();
    schemaBootstrapState.error = null;
    schemaBootstrapState.tables = tables.map((table) => table.tableName);
  } catch (error) {
    schemaBootstrapState.initialized = false;
    schemaBootstrapState.error = error.message;
    schemaBootstrapState.tables = [];
    console.error("Failed to bootstrap database schema:", error);
  }
}

function isProductionRuntime() {
  const normalized = String(process.env.APP_ENV || process.env.NODE_ENV || "")
    .trim()
    .toLowerCase();
  return normalized === "production" || normalized === "prod";
}

// 统一身份解析:优先 JWT,其次开发 fallback。
export function resolveEffectiveUser(req) {
  const auth = resolveAuthenticatedUser(req);
  const base = isProductionRuntime()
    ? resolveAnonymousUserContext(req)
    : resolveRequestUserContext(req);
  if (auth) {
    return {
      userId: auth.userId,
      imEnv: base.imEnv,
      imUserId: buildImUserId(base.imEnv, auth.userId),
      isAnonymous: false,
    };
  }
  return base;
}

function analyticsContextFromRequest(req) {
  const user = resolveEffectiveUser(req);
  return {
    userId: user?.userId || null,
    ip: (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() || req.ip || null,
    userAgent: req.headers["user-agent"] || null,
    appEnv: process.env.APP_ENV || null,
  };
}

// ---------- Health ----------

app.get("/api/health", async (_req, res) => {
  const response = {
    ok: true,
    version: getVersionInfo(),
    cos: {
      configured: cosConfigured,
      missingEnvKeys: missingCosEnvKeys,
      bucket: process.env.COS_BUCKET || null,
      region: process.env.COS_REGION || null,
      publicBaseUrl: process.env.COS_PUBLIC_BASE_URL || null,
    },
    mysql: {
      environment: process.env.APP_ENV,
      loadedEnvFiles: envState.loadedFiles,
      configured: mysqlConfigured,
      missingEnvKeys: missingMysqlEnvKeys,
      host: process.env.MYSQL_HOST || null,
      port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : null,
      database: process.env.MYSQL_DATABASE || null,
      schemaBootstrap: schemaBootstrapState,
    },
    im: {
      configured: imConfigured,
      missingEnvKeys: missingImEnvKeys,
      sdkAppId: process.env.IM_SDK_APP_ID ? Number(process.env.IM_SDK_APP_ID) : null,
      adminUser: process.env.IM_ADMIN_USER || null,
      apiBaseUrl: process.env.IM_API_BASE_URL || null,
      imEnv: process.env.IM_ENV || null,
    },
  };

  if (mysqlConfigured) {
    try {
      const connection = await mysqlPool.getConnection();
      await connection.ping();
      connection.release();
      response.mysql.connected = true;
    } catch (error) {
      response.ok = false;
      response.mysql.connected = false;
      response.mysql.error = error.message;
    }
  } else {
    response.mysql.connected = false;
  }

  res.status(response.ok ? 200 : 500).json(response);
});

// ---------- Auth ----------

app.post("/api/auth/sms/request", (req, res) => {
  try {
    const data = createSmsCode(req.body?.phone);
    trackServerEvent(mysqlPool, "auth_sms_requested", {
      ...analyticsContextFromRequest(req),
      properties: { phoneTail: String(req.body?.phone || "").slice(-4) },
    });
    res.json({ ok: true, data });
  } catch (error) {
    trackServerEvent(mysqlPool, "auth_sms_failed", {
      ...analyticsContextFromRequest(req),
      properties: { stage: "request", reason: error.message || "unknown" },
    });
    res.status(error.status || 500).json({
      ok: false,
      message: error.message || "Failed to issue SMS code.",
    });
  }
});

app.post("/api/auth/sms/verify", async (req, res) => {
  try {
    const data = await verifySmsCodeAndIssueToken(
      mysqlConfigured ? mysqlPool : null,
      req.body?.phone,
      req.body?.code
    );
    trackServerEvent(mysqlPool, "auth_sms_verified", {
      ...analyticsContextFromRequest(req),
      userId: data?.userId || null,
      properties: { phoneTail: String(req.body?.phone || "").slice(-4) },
    });
    if (data?.isNew) {
      trackServerEvent(mysqlPool, "signup_completed", {
        ...analyticsContextFromRequest(req),
        userId: data?.userId || null,
        properties: {
          channel: "sms",
          phoneTail: String(req.body?.phone || "").slice(-4),
        },
      });
    }
    res.json({ ok: true, data });
  } catch (error) {
    trackServerEvent(mysqlPool, "auth_sms_failed", {
      ...analyticsContextFromRequest(req),
      properties: {
        stage: "verify",
        reason: error.message || "unknown",
        phoneTail: String(req.body?.phone || "").slice(-4),
      },
    });
    res.status(error.status || 500).json({
      ok: false,
      message: error.message || "Failed to verify SMS code.",
    });
  }
});

app.post("/api/auth/webview", async (req, res) => {
  try {
    const data = await loginWithWebviewIdentity(
      mysqlConfigured ? mysqlPool : null,
      req.body || {}
    );
    res.json({ ok: true, data });
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      message: error.message || "Failed to login with webview identity.",
    });
  }
});

app.get("/api/auth/me", (req, res) => {
  const user = resolveAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ ok: false, message: "Not authenticated." });
    return;
  }
  res.json({
    ok: true,
    data: { userId: String(user.userId), via: user.via },
  });
});

// ---------- IM ----------

app.get("/api/im/session", requireAuth, async (req, res) => {
  if (!requireImConfigured(res)) return;
  const user = resolveEffectiveUser(req);
  const peerUserId = resolveRequestedPeerUserId(req.query?.peerUid);
  const peerImUserId = peerUserId ? buildImUserId(user.imEnv, peerUserId) : null;
  const runtime = getImRuntimeConfig(process.env);

  try {
    res.json({
      ok: true,
      data: {
        sdkAppId: runtime.sdkAppId,
        imEnv: user.imEnv,
        userId: user.userId,
        imUserId: user.imUserId,
        userSig: createUserSig(user.imUserId, process.env),
        adminUser: runtime.adminUser,
        peerUserId,
        peerImUserId,
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Failed to create IM session.",
      error: error.message,
    });
  }
});

app.post("/api/im/users/import", requireAuth, async (req, res) => {
  if (!requireImConfigured(res)) return;
  const body = req.body || {};
  const users = Array.isArray(body.users) ? body.users : [];
  const fallbackContext = resolveEffectiveUser(req);
  if (!users.length) {
    res.status(400).json({ ok: false, message: "users is required." });
    return;
  }
  try {
    const results = [];
    for (const item of users) {
      const userId = resolveRequestedPeerUserId(item?.userId);
      if (!userId) {
        throw new Error("Each import user must include a valid userId.");
      }
      const imported = await importImAccount({
        userId,
        imEnv: item?.imEnv || fallbackContext.imEnv,
        nickname: item?.nickname,
        avatar: item?.avatar,
        env: process.env,
      });
      results.push(imported);
    }
    res.status(201).json({ ok: true, data: { imported: results } });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Failed to import IM users.",
      error: error.message,
    });
  }
});

// ---------- Upload ----------

// 前端直传 COS:拿签名 URL 后 PUT 过去,避免 base64 走业务接口。
// 默认 15 分钟有效,mimeType 仅放行 image/audio/video。
app.post("/api/upload/cos-ticket", requireAuth, async (req, res) => {
  if (!requireCosConfigured(res)) return;
  const body = req.body || {};
  const mimeType = String(body.mimeType || "").trim();
  const prefix = String(body.prefix || "upload").trim() || "upload";
  const user = resolveEffectiveUser(req);
  try {
    const ticket = await createCosUploadTicket({
      ownerId: user.userId || "anonymous",
      mimeType,
      prefix,
      env: process.env,
    });
    res.json({ ok: true, data: ticket });
  } catch (error) {
    if (error.code === "MIME_NOT_ALLOWED") {
      res.status(400).json({ ok: false, message: error.message });
      return;
    }
    if (error.code === "COS_NOT_CONFIGURED") {
      res.status(500).json({
        ok: false,
        message: error.message,
        missingEnvKeys: missingCosEnvKeys,
      });
      return;
    }
    res.status(500).json({
      ok: false,
      message: "Failed to create COS upload ticket.",
      error: error.message,
    });
  }
});

// ---------- Analytics ----------

app.post("/api/events/track", async (req, res) => {
  if (!requireMysqlConfigured(res)) return;
  const body = req.body || {};
  if (!isAllowedEvent(body.eventName)) {
    res.status(400).json({ ok: false, message: "eventName not allowed." });
    return;
  }
  const ctx = analyticsContextFromRequest(req);
  const ok = await recordEvent(mysqlPool, {
    eventName: body.eventName,
    userId: body.userId || ctx.userId,
    sessionId: body.sessionId || null,
    source: "client",
    appEnv: ctx.appEnv,
    clientPlatform: body.clientPlatform || null,
    clientVersion: body.clientVersion || null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    properties: body.properties,
    occurredAt: body.occurredAt,
  });
  res.json({ ok });
});

// ---------- Debug dump(方案 B)----------
// 不写 DB,只打 stderr,便于线上 tail pm2 log 排错。
app.post("/api/debug/dump", (req, res) => {
  const raw = req.body || {};
  const serialized = JSON.stringify(raw);
  if (serialized.length > 10 * 1024) {
    res.status(413).json({ ok: false, message: "payload too large" });
    return;
  }
  const auth = resolveAuthenticatedUser(req);
  const effective = resolveEffectiveUser(req);
  const record = {
    ts: new Date().toISOString(),
    via: auth?.via || (effective?.isAnonymous ? "anonymous" : "unknown"),
    userId: effective?.userId || null,
    ip: req.ip || req.socket?.remoteAddress || null,
    ua: req.get("user-agent") || null,
    payload: raw,
  };
  console.error("[CLIENT_DEBUG_DUMP]", JSON.stringify(record));
  res.json({ ok: true });
});

// ---------- DB 辅助 ----------

app.get("/api/db/ping", async (_req, res) => {
  if (!requireMysqlConfigured(res)) return;
  try {
    const [rows] = await mysqlPool.query(
      "SELECT DATABASE() AS databaseName, NOW() AS serverTime"
    );
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "MySQL connection failed.",
      error: error.message,
    });
  }
});

app.get("/api/db/schema", async (_req, res) => {
  if (!requireMysqlConfigured(res)) return;
  try {
    const tables = await getSchemaTables(mysqlPool, process.env.MYSQL_DATABASE);
    res.json({
      ok: true,
      data: {
        initialized: schemaBootstrapState.initialized,
        initializedAt: schemaBootstrapState.initializedAt,
        tableCount: tables.length,
        tables: tables.map((table) => table.tableName),
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Failed to inspect database schema.",
      error: error.message,
    });
  }
});

// ---------- Fallback: 根目录 / 输出 web/index.html(若存在)----------
app.get("/", (_req, res, next) => {
  const indexPath = path.join(webRoot, "index.html");
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
    return;
  }
  next();
});

// ---------- 启动 ----------

app.listen(port, async () => {
  console.log(
    `[wirachat-h5-starter] listening on :${port} (APP_ENV=${
      process.env.APP_ENV || "development"
    })`
  );
  if (mysqlPool) {
    await initializeDatabaseSchema();
    if (schemaBootstrapState.initialized) {
      console.log(
        `  mysql ok, tables=${schemaBootstrapState.tables.length}`
      );
    } else if (schemaBootstrapState.error) {
      console.warn("  mysql bootstrap failed:", schemaBootstrapState.error);
    }
  } else {
    console.log("  mysql: not configured, running without DB.");
  }
  console.log(`  cos: configured=${cosConfigured}`);
  console.log(`  im:  configured=${imConfigured}`);
});
