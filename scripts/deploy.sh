#!/usr/bin/env bash
# 参数化部署脚本:SSH 到目标机器、拉代码、npm ci、初始化 DB、PM2 reload、健康检查。
# 项目不可知 — 所有业务相关参数走 .deploy.env 或命令行 env。
#
# 用法:
#   bash scripts/deploy.sh <test|production>
#
# 必需 env(在 .deploy.env 中,脚本会自动加载):
#   DEPLOY_HOST             目标 SSH host(IP 或域名)
#   DEPLOY_PATH             目标机器上的应用目录,例如 /var/www/myapp
#   PM2_APP_TEST            test 环境的 PM2 应用名
#   PM2_APP_PROD            production 环境的 PM2 应用名
#   LOCAL_HEALTH_PORT_TEST  test 本地健康检查端口(例如 3002)
#   LOCAL_HEALTH_PORT_PROD  production 本地健康检查端口(例如 3001)
#   PUBLIC_HEALTH_URL_TEST  test 域名健康检查 URL
#   PUBLIC_HEALTH_URL_PROD  production 域名健康检查 URL
#
# 可选 env:
#   DEPLOY_USER             SSH user,默认 root
#   DEPLOY_APP_USER         应用所属用户,默认 deploy
#   DEPLOY_BRANCH_TEST      test 分支,默认 test
#   DEPLOY_BRANCH_PROD      production 分支,默认 master
#   DEPLOY_BRANCH           覆盖两个环境的默认分支
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/deploy.sh <test|production>
See header of this file for required environment variables.
EOF
}

if [[ $# -ne 1 ]]; then
  usage
  exit 1
fi

# 加载本地 deploy config(被 .gitignore)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "${SCRIPT_DIR}/../.deploy.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  . "${SCRIPT_DIR}/../.deploy.env"
  set +a
fi

TARGET_ENV="$1"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: $name not set. Put it in .deploy.env or export it." >&2
    exit 1
  fi
}

require_env DEPLOY_HOST
require_env DEPLOY_PATH

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_APP_USER="${DEPLOY_APP_USER:-deploy}"
DEPLOY_BRANCH_OVERRIDE="${DEPLOY_BRANCH:-}"

case "$TARGET_ENV" in
  test)
    require_env PM2_APP_TEST
    require_env LOCAL_HEALTH_PORT_TEST
    require_env PUBLIC_HEALTH_URL_TEST
    DB_INIT_CMD="npm run db:init:test"
    PM2_APP="${PM2_APP_TEST}"
    LOCAL_HEALTH_URL="http://127.0.0.1:${LOCAL_HEALTH_PORT_TEST}/api/health"
    PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL_TEST}"
    DEPLOY_BRANCH="${DEPLOY_BRANCH_OVERRIDE:-${DEPLOY_BRANCH_TEST:-test}}"
    ;;
  production)
    require_env PM2_APP_PROD
    require_env LOCAL_HEALTH_PORT_PROD
    require_env PUBLIC_HEALTH_URL_PROD
    DB_INIT_CMD="npm run db:init:production"
    PM2_APP="${PM2_APP_PROD}"
    LOCAL_HEALTH_URL="http://127.0.0.1:${LOCAL_HEALTH_PORT_PROD}/api/health"
    PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL_PROD}"
    DEPLOY_BRANCH="${DEPLOY_BRANCH_OVERRIDE:-${DEPLOY_BRANCH_PROD:-master}}"
    ;;
  *)
    usage
    exit 1
    ;;
esac

echo "=== Deploy ${TARGET_ENV} ==="
echo "  host    : ${DEPLOY_USER}@${DEPLOY_HOST}"
echo "  path    : ${DEPLOY_PATH}"
echo "  branch  : ${DEPLOY_BRANCH}"
echo "  pm2 app : ${PM2_APP}"
echo

ssh -o ConnectTimeout=10 "${DEPLOY_USER}@${DEPLOY_HOST}" bash <<EOF
set -euo pipefail
sudo -u "${DEPLOY_APP_USER}" -H bash <<'INNER_EOF'
set -euo pipefail
cd "${DEPLOY_PATH}"
git fetch origin "${DEPLOY_BRANCH}"
git checkout "${DEPLOY_BRANCH}"
git reset --hard "origin/${DEPLOY_BRANCH}"
APP_COMMIT_SHA="\$(git rev-parse HEAD)"
export APP_COMMIT_SHA
echo "--- DEPLOYING COMMIT ---"
echo "\${APP_COMMIT_SHA}"
npm ci
${DB_INIT_CMD}
pm2 reload ecosystem.config.cjs --only "${PM2_APP}" --update-env
pm2 save >/dev/null 2>&1 || true
echo "--- PM2 (${DEPLOY_APP_USER}) ---"
pm2 ls
INNER_EOF
echo "--- LOCAL HEALTH ---"
for attempt in 1 2 3 4 5; do
  if curl -fsSL --max-time 5 "${LOCAL_HEALTH_URL}"; then
    echo
    break
  fi
  if [ "\$attempt" = "5" ]; then
    echo "ERROR: local health check failed after 5 attempts: ${LOCAL_HEALTH_URL}" >&2
    exit 1
  fi
  sleep 2
done
EOF

echo "--- PUBLIC HEALTH ---"
for attempt in 1 2 3; do
  if curl -fsSL --max-time 10 "${PUBLIC_HEALTH_URL}"; then
    echo
    break
  fi
  if [ "$attempt" = "3" ]; then
    echo "ERROR: public health check failed: ${PUBLIC_HEALTH_URL}" >&2
    exit 1
  fi
  sleep 2
done
