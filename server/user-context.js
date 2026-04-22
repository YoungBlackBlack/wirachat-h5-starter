// 用户上下文 + IM 身份派发:
// - imEnv:  区分 dev / prod,避免开发数据和生产数据串在同一个 IM 账号体系里。
// - imUserId: 对接腾讯 IM 时用的 userID,格式 `${imEnv}_${userId}`,保证跨环境隔离。
// - 非生产环境允许通过 x-user-id / ?uid= 直接切换身份(配合 requireAuth 的 dev-fallback)。

const SUPPORTED_IM_ENVS = new Set(["dev", "prod"]);

// starter 没有 seed 数据,默认匿名用户 id = 0(业务项目可在 .env 里覆盖)。
const DEFAULT_ANONYMOUS_USER_ID = Number(process.env.ANONYMOUS_USER_ID || 0) || 0;

function normalizePositiveInteger(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
}

export function getDefaultImEnv(appEnv = process.env.APP_ENV) {
  const normalized = String(appEnv || "").trim().toLowerCase();
  if (normalized === "production" || normalized === "prod") {
    return "prod";
  }
  return "dev";
}

export function normalizeImEnv(value, fallback = getDefaultImEnv()) {
  const normalized = String(value || "").trim().toLowerCase();
  if (SUPPORTED_IM_ENVS.has(normalized)) {
    return normalized;
  }
  return fallback;
}

export function buildImUserId(imEnv, userId) {
  return `${normalizeImEnv(imEnv)}_${normalizePositiveInteger(userId)}`;
}

function buildUserContext(userId, imEnv) {
  return {
    userId,
    imEnv,
    imUserId: userId ? buildImUserId(imEnv, userId) : null,
    isAnonymous: userId === DEFAULT_ANONYMOUS_USER_ID || !userId,
  };
}

export function resolveRequestUserContext(req, options = {}) {
  const { allowIdentityOverride = true } = options;
  const defaultImEnv = normalizeImEnv(process.env.IM_ENV, getDefaultImEnv());

  const headerUserId = allowIdentityOverride ? req.get("x-user-id") : null;
  const queryUserId = allowIdentityOverride ? req.query?.uid : null;
  const currentUserId =
    normalizePositiveInteger(headerUserId) ??
    normalizePositiveInteger(queryUserId) ??
    DEFAULT_ANONYMOUS_USER_ID;

  const headerImEnv = req.get("x-im-env");
  const queryImEnv = req.query?.imEnv;
  const imEnv = normalizeImEnv(headerImEnv || queryImEnv, defaultImEnv);

  return buildUserContext(currentUserId, imEnv);
}

export function resolveAnonymousUserContext(req) {
  return resolveRequestUserContext(req, { allowIdentityOverride: false });
}

export function resolveRequestedPeerUserId(value) {
  return normalizePositiveInteger(value);
}
