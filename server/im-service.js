import TLSSigAPIv2 from "tls-sig-api-v2";
import { buildImUserId, getDefaultImEnv, normalizeImEnv } from "./user-context.js";

function getRequiredImEnvKeys(env = process.env) {
  return ["IM_SDK_APP_ID", "IM_SECRET_KEY", "IM_ADMIN_USER"].filter((key) => !env[key]);
}

export function getImMissingEnvKeys(env = process.env) {
  return getRequiredImEnvKeys(env);
}

export function isImConfigured(env = process.env) {
  return getRequiredImEnvKeys(env).length === 0;
}

export function getImRuntimeConfig(env = process.env) {
  const imEnv = normalizeImEnv(env.IM_ENV, getDefaultImEnv(env.APP_ENV));

  return {
    sdkAppId: Number(env.IM_SDK_APP_ID || 0),
    secretKey: env.IM_SECRET_KEY || "",
    adminUser: env.IM_ADMIN_USER || "",
    apiBaseUrl: (env.IM_API_BASE_URL || "https://console.tim.qq.com/v4").replace(/\/+$/, ""),
    userSigExpireSeconds: Number(env.IM_USER_SIG_EXPIRE_SECONDS || 86400 * 180),
    imEnv,
  };
}

export function createUserSig(userID, env = process.env) {
  const config = getImRuntimeConfig(env);
  const api = new TLSSigAPIv2.Api(config.sdkAppId, config.secretKey);
  return api.genSig(String(userID), config.userSigExpireSeconds);
}

export async function importImAccount({
  userId,
  imEnv,
  nickname,
  avatar,
  env = process.env,
}) {
  const config = getImRuntimeConfig(env);
  const imUserId = buildImUserId(imEnv || config.imEnv, userId);
  const adminUserSig = createUserSig(config.adminUser, env);

  const url = new URL(`${config.apiBaseUrl}/im_open_login_svc/account_import`);
  url.searchParams.set("sdkappid", String(config.sdkAppId));
  url.searchParams.set("identifier", config.adminUser);
  url.searchParams.set("usersig", adminUserSig);
  url.searchParams.set("random", String(Math.floor(Math.random() * 1000000000)));
  url.searchParams.set("contenttype", "json");

  const payload = {
    UserID: imUserId,
  };

  if (nickname) {
    payload.Nick = String(nickname);
  }
  if (avatar) {
    payload.FaceUrl = String(avatar);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`IM account import failed with HTTP ${response.status}.`);
  }

  if (!data || Number(data.ErrorCode) !== 0) {
    throw new Error(data?.ErrorInfo || "IM account import failed.");
  }

  return {
    imUserId,
    userId: Number(userId),
    imEnv: normalizeImEnv(imEnv || config.imEnv),
    result: data,
  };
}
