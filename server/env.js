import dotenv from "dotenv";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveEnvMode(rawMode) {
  const mode = String(rawMode || "").trim().toLowerCase();

  if (!mode) {
    return "development";
  }

  if (mode === "prod") {
    return "production";
  }

  return mode;
}

export function getAppEnv(env = process.env) {
  return resolveEnvMode(env.APP_ENV || env.NODE_ENV);
}

export function getEnvFileCandidates(env = process.env) {
  const appEnv = getAppEnv(env);
  return getEnvFileCandidatesForMode(appEnv, env.ENV_FILE);
}

export function getEnvFileCandidatesForMode(appEnv, explicitEnvFile) {
  const resolvedExplicitEnvFile =
    explicitEnvFile ? path.resolve(ROOT_DIR, explicitEnvFile) : null;

  const candidates = [
    resolvedExplicitEnvFile,
    path.join(ROOT_DIR, `.env.${appEnv}.local`),
    path.join(ROOT_DIR, `.env.${appEnv}`),
    path.join(ROOT_DIR, ".env.local"),
    path.join(ROOT_DIR, ".env"),
  ].filter(Boolean);

  return [...new Set(candidates)];
}

export function loadAppEnv(env = process.env) {
  const loadedFiles = [];

  for (const envFile of getEnvFileCandidates(env).reverse()) {
    if (!fs.existsSync(envFile)) {
      continue;
    }

    dotenv.config({
      path: envFile,
      override: true,
    });
    loadedFiles.push(path.basename(envFile));
  }

  process.env.APP_ENV = getAppEnv(process.env);

  return {
    appEnv: process.env.APP_ENV,
    loadedFiles,
  };
}

export function loadEnvObjectForMode(appEnv, baseEnv = process.env) {
  const envObject = { ...baseEnv };
  const loadedFiles = [];

  for (const envFile of getEnvFileCandidatesForMode(appEnv, baseEnv.ENV_FILE).reverse()) {
    if (!fs.existsSync(envFile)) {
      continue;
    }

    Object.assign(envObject, dotenv.parse(fs.readFileSync(envFile)));
    loadedFiles.push(path.basename(envFile));
  }

  envObject.APP_ENV = resolveEnvMode(appEnv);

  return {
    env: envObject,
    loadedFiles,
    appEnv: envObject.APP_ENV,
  };
}
