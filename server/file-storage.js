import COS from "cos-nodejs-sdk-v5";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const uploadsRoot = path.join(projectRoot, "uploads");
const cosRequiredEnvKeys = [
  "COS_SECRET_ID",
  "COS_SECRET_KEY",
  "COS_BUCKET",
  "COS_REGION",
];
let cachedCosClient = null;
let cachedCosClientKey = "";

const EXTENSION_BY_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/svg+xml", ".svg"],
  ["audio/webm", ".webm"],
  ["audio/mpeg", ".mp3"],
  ["audio/mp3", ".mp3"],
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"],
  ["audio/aac", ".aac"],
  ["audio/mp4", ".m4a"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"],
]);

function hasPlaceholderValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes("replace-me") ||
    normalized.startsWith("your-")
  );
}

function parseDataUrl(value) {
  if (typeof value !== "string" || !value.startsWith("data:")) {
    return null;
  }

  const match =
    /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,([\s\S]+)$/i.exec(value);
  if (!match) {
    return null;
  }

  return {
    mimeType: (match[1] || "application/octet-stream").toLowerCase(),
    isBase64: Boolean(match[2]),
    payload: match[3] || "",
  };
}

function extensionFromMime(mimeType) {
  return EXTENSION_BY_MIME.get(mimeType) || ".bin";
}

function getUrlHostname(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function getCosEndpoint(env = process.env) {
  return env.COS_ENDPOINT || `cos.${env.COS_REGION}.myqcloud.com`;
}

function normalizeObjectKey(value) {
  return String(value || "").replace(/^\/+/, "");
}

function buildObjectKey({ ownerId, prefix, mimeType, now = new Date() }) {
  const datePath = `${now.getUTCFullYear()}/${String(
    now.getUTCMonth() + 1
  ).padStart(2, "0")}`;
  const filename = `${prefix}_${ownerId}_${Date.now()}_${crypto
    .randomBytes(4)
    .toString("hex")}${extensionFromMime(mimeType)}`;

  return `uploads/${datePath}/${filename}`;
}

function normalizeMediaType(mediaType, mimeType) {
  if (["image", "audio", "video"].includes(mediaType)) {
    return mediaType;
  }
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "image";
}

export function getCosMissingEnvKeys(env = process.env) {
  return cosRequiredEnvKeys.filter((key) => hasPlaceholderValue(env[key]));
}

export function isCosConfigured(env = process.env) {
  return getCosMissingEnvKeys(env).length === 0;
}

export function buildCosPublicUrl(objectKey, env = process.env) {
  const uploadBaseUrl = `https://${env.COS_BUCKET}.${getCosEndpoint(env)}`;
  const publicBaseUrl = (env.COS_PUBLIC_BASE_URL || uploadBaseUrl).replace(
    /\/+$/,
    ""
  );

  return `${publicBaseUrl}/${normalizeObjectKey(objectKey)}`;
}

export function isCosBackedPublicUrl(value, env = process.env) {
  const hostname = getUrlHostname(value);
  if (!hostname) {
    return false;
  }

  const knownHostnames = [
    env.COS_PUBLIC_BASE_URL,
    env.COS_BUCKET ? `https://${env.COS_BUCKET}.${getCosEndpoint(env)}` : null,
  ]
    .filter(Boolean)
    .map((item) => getUrlHostname(item))
    .filter(Boolean);

  return knownHostnames.includes(hostname) || hostname.endsWith(".myqcloud.com");
}

export function inferStorageProvider(media, env = process.env) {
  if (media?.storageProvider === "cos" || media?.storageProvider === "external") {
    return media.storageProvider;
  }

  if (isCosBackedPublicUrl(media?.publicUrl, env)) {
    return "cos";
  }

  return "external";
}

function getCosClient(env = process.env) {
  if (!isCosConfigured(env)) {
    return null;
  }

  const clientKey = JSON.stringify({
    secretId: env.COS_SECRET_ID,
    secretKey: env.COS_SECRET_KEY,
  });

  if (!cachedCosClient || cachedCosClientKey !== clientKey) {
    cachedCosClient = new COS({
      SecretId: env.COS_SECRET_ID,
      SecretKey: env.COS_SECRET_KEY,
    });
    cachedCosClientKey = clientKey;
  }

  return cachedCosClient;
}

export async function uploadBufferToCos(
  { buffer, objectKey, mimeType, env = process.env },
  client = getCosClient(env)
) {
  if (!client) {
    throw new Error("COS is not configured.");
  }

  const normalizedObjectKey = normalizeObjectKey(objectKey);

  await new Promise((resolve, reject) => {
    client.putObject(
      {
        Bucket: env.COS_BUCKET,
        Region: env.COS_REGION,
        Key: normalizedObjectKey,
        Body: buffer,
        ContentLength: buffer.length,
        ContentType: mimeType || "application/octet-stream",
      },
      (error, data) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(data);
      }
    );
  });

  return {
    objectKey: normalizedObjectKey,
    publicUrl: buildCosPublicUrl(normalizedObjectKey, env),
    storageProvider: "cos",
  };
}

async function persistBufferLocally(buffer, objectKey) {
  const normalizedObjectKey = normalizeObjectKey(objectKey);
  const absolutePath = path.join(projectRoot, normalizedObjectKey);
  const directory = path.dirname(absolutePath);

  await mkdir(directory, { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    objectKey: normalizedObjectKey,
    publicUrl: `/${normalizedObjectKey}`,
    storageProvider: "external",
  };
}

export async function persistInlineMediaIfNeeded(
  media,
  {
    ownerId = "anonymous",
    prefix = "media",
    env = process.env,
    uploadBuffer = uploadBufferToCos,
  } = {}
) {
  if (!media || typeof media !== "object") {
    return media;
  }

  const candidate =
    media.dataUrl ||
    media.inlineDataUrl ||
    (typeof media.publicUrl === "string" && media.publicUrl.startsWith("data:")
      ? media.publicUrl
      : null);
  const parsed = parseDataUrl(candidate);
  if (!parsed) {
    return media;
  }

  const buffer = parsed.isBase64
    ? Buffer.from(parsed.payload, "base64")
    : Buffer.from(decodeURIComponent(parsed.payload), "utf8");
  const objectKey = buildObjectKey({
    ownerId,
    prefix,
    mimeType: parsed.mimeType,
  });
  const persisted = isCosConfigured(env)
    ? await uploadBuffer(
        {
          buffer,
          objectKey,
          mimeType: parsed.mimeType,
          env,
        },
        getCosClient(env)
      )
    : await persistBufferLocally(buffer, objectKey);

  return {
    ...media,
    type: normalizeMediaType(media.type, parsed.mimeType),
    mimeType: parsed.mimeType,
    fileSizeBytes: buffer.length,
    publicUrl: persisted.publicUrl,
    objectKey: persisted.objectKey,
    storageProvider: persisted.storageProvider,
  };
}

// 前端直传凭证:让浏览器直接 PUT 到 COS,避免大文件走后端中转。
// 用 COS SDK 的 getObjectUrl({Sign:true, Method:'PUT'}) 出带签名的 query,
// 不引入新依赖;前端只需 fetch(signedUrl, { method: 'PUT', body: file })。
// 白名单 mimeType 防止任意文件上传。
const ALLOWED_UPLOAD_MIME_PREFIXES = ["image/", "audio/", "video/"];

function isAllowedUploadMime(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  return ALLOWED_UPLOAD_MIME_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix)
  );
}

export async function createCosUploadTicket(
  { ownerId, mimeType, prefix = "upload", expiresSeconds = 900, env = process.env },
  client = getCosClient(env)
) {
  if (!isCosConfigured(env)) {
    const err = new Error("COS is not configured.");
    err.code = "COS_NOT_CONFIGURED";
    throw err;
  }

  if (!isAllowedUploadMime(mimeType)) {
    const err = new Error(`mimeType not allowed: ${mimeType}`);
    err.code = "MIME_NOT_ALLOWED";
    throw err;
  }

  if (!client) {
    throw new Error("COS client unavailable.");
  }

  const normalizedOwnerId = String(ownerId || "anonymous");
  const objectKey = buildObjectKey({
    ownerId: normalizedOwnerId,
    prefix,
    mimeType,
  });

  const signedUrl = await new Promise((resolve, reject) => {
    client.getObjectUrl(
      {
        Bucket: env.COS_BUCKET,
        Region: env.COS_REGION,
        Key: objectKey,
        Method: "PUT",
        Sign: true,
        Expires: Math.max(60, Number(expiresSeconds) || 900),
      },
      (error, data) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(data?.Url || "");
      }
    );
  });

  return {
    objectKey,
    uploadUrl: signedUrl,
    publicUrl: buildCosPublicUrl(objectKey, env),
    mimeType,
    expiresIn: Math.max(60, Number(expiresSeconds) || 900),
    storageProvider: "cos",
  };
}

export function isAllowedUploadMimeType(mimeType) {
  return isAllowedUploadMime(mimeType);
}

export function getUploadsRoot() {
  return uploadsRoot;
}

export function getProjectRoot() {
  return projectRoot;
}
