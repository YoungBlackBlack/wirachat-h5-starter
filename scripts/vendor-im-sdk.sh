#!/usr/bin/env bash
# Fetch @tencentcloud/chat UMD build into web/vendor/tim-js.js.
# 运行时机:
#   - 升级 SDK 版本后(改完 package.json 的 @tencentcloud/chat 版本号,跑这个脚本)
#   - 新 clone 仓库后(如果 web/vendor/tim-js.js 没提交)
# 校验:
#   - 如果同目录有 tim-js.js.sha256,下载后会校验 sha;不一致直接退出非 0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/web/vendor"
TARGET="$VENDOR_DIR/tim-js.js"
SHA_FILE="$VENDOR_DIR/tim-js.js.sha256"

# 从 package.json 里读 @tencentcloud/chat 的版本(去掉 ^ ~ 前缀)
VERSION=$(node -e "const p=require('$ROOT_DIR/package.json');const v=p.dependencies['@tencentcloud/chat']||p.devDependencies?.['@tencentcloud/chat']||'';process.stdout.write(v.replace(/^[^0-9]*/,''))")

if [ -z "$VERSION" ]; then
  echo "[vendor-im-sdk] ERROR: 无法从 package.json 读取 @tencentcloud/chat 版本" >&2
  exit 1
fi

URL="https://unpkg.com/@tencentcloud/chat@${VERSION}/index.js"
TMP="$(mktemp -t tim-js.XXXXXX).js"

echo "[vendor-im-sdk] 下载 $URL"
curl -sSfL -o "$TMP" "$URL"

# 简单完整性检查: 文件至少 100KB 且包含 "TencentCloudChat"
SIZE=$(wc -c < "$TMP" | tr -d ' ')
if [ "$SIZE" -lt 100000 ]; then
  echo "[vendor-im-sdk] ERROR: 下载文件过小 ($SIZE 字节),疑似被劫持或 URL 失效" >&2
  rm -f "$TMP"
  exit 1
fi
if ! grep -q "TencentCloudChat" "$TMP"; then
  echo "[vendor-im-sdk] ERROR: 下载文件里找不到 TencentCloudChat 符号" >&2
  rm -f "$TMP"
  exit 1
fi

mkdir -p "$VENDOR_DIR"
mv "$TMP" "$TARGET"

NEW_SHA=$(shasum -a 256 "$TARGET" | awk '{print $1}')

if [ -f "$SHA_FILE" ]; then
  EXPECTED=$(awk '{print $1}' "$SHA_FILE")
  if [ "$EXPECTED" != "$NEW_SHA" ]; then
    echo "[vendor-im-sdk] WARNING: sha 与 $SHA_FILE 不一致" >&2
    echo "  expected: $EXPECTED" >&2
    echo "  got:      $NEW_SHA" >&2
    echo "  如果是主动升级 SDK,用 --update-sha 写入新的 sha:" >&2
    echo "    bash scripts/vendor-im-sdk.sh --update-sha" >&2
    if [ "${1:-}" != "--update-sha" ]; then
      exit 2
    fi
    echo "$NEW_SHA  tim-js.js" > "$SHA_FILE"
    echo "[vendor-im-sdk] sha 已更新到 $SHA_FILE"
  else
    echo "[vendor-im-sdk] sha 校验通过: $NEW_SHA"
  fi
else
  echo "$NEW_SHA  tim-js.js" > "$SHA_FILE"
  echo "[vendor-im-sdk] 首次写入 sha: $NEW_SHA → $SHA_FILE"
fi

echo "[vendor-im-sdk] OK: $TARGET ($(wc -c < "$TARGET" | tr -d ' ') 字节, version=$VERSION)"
