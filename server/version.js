import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function readPackageVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    );
    return pkg.version || null;
  } catch (_error) {
    return null;
  }
}

function readGitCommitFromFs() {
  try {
    const head = readFileSync(path.join(projectRoot, ".git", "HEAD"), "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.slice(4).trim();
      const sha = readFileSync(
        path.join(projectRoot, ".git", ref),
        "utf8",
      ).trim();
      return sha || null;
    }
    return head || null;
  } catch (_error) {
    return null;
  }
}

function readGitCommitFromCli() {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim() || null;
  } catch (_error) {
    return null;
  }
}

function resolveCommitSha() {
  return (
    process.env.APP_COMMIT_SHA ||
    readGitCommitFromFs() ||
    readGitCommitFromCli() ||
    "unknown"
  );
}

const commit = resolveCommitSha();
const version = readPackageVersion();
const startedAt = new Date().toISOString();

export function getVersionInfo() {
  return {
    commit,
    commitShort: commit && commit !== "unknown" ? commit.slice(0, 7) : commit,
    version,
    startedAt,
    env: process.env.APP_ENV || null,
  };
}
