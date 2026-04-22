#!/usr/bin/env bash
# Fetch vConsole UMD build into assets/vconsole.min.js.
# 运行时机:
#   - 升级 vConsole 版本后(改下面的 VERSION,跑 --update-sha)
#   - 新 clone 仓库后(如果 assets/vconsole.min.js 没提交)
# 校验:
#   - 如果同目录有 vconsole.min.js.sha256,下载后会校验 sha;不一致直接退出非 0
#
# 为什么 version 写死在脚本里(而不是像 IM 那样读 package.json):
#   vConsole 仅前端调试工具,没必要进 dependencies / node_modules。
#   升级时改这里的 VERSION + 同步改 web/debug.js 里 ?v=xxx 的 cache-bust 串。

set -euo pipefail

VERSION="3.15.1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS_DIR="$ROOT_DIR/assets"
TARGET="$ASSETS_DIR/vconsole.min.js"
SHA_FILE="$ASSETS_DIR/vconsole.min.js.sha256"

URL="https://unpkg.com/vconsole@${VERSION}/dist/vconsole.min.js"
TMP="$(mktemp -t vconsole.XXXXXX).js"

echo "[vendor-vconsole] 下载 $URL"
curl -sSfL -o "$TMP" "$URL"

# 简单完整性检查: 文件至少 50KB 且包含 "VConsole"
SIZE=$(wc -c < "$TMP" | tr -d ' ')
if [ "$SIZE" -lt 50000 ]; then
  echo "[vendor-vconsole] ERROR: 下载文件过小 ($SIZE 字节),疑似被劫持或 URL 失效" >&2
  rm -f "$TMP"
  exit 1
fi
if ! grep -q "VConsole" "$TMP"; then
  echo "[vendor-vconsole] ERROR: 下载文件里找不到 VConsole 符号" >&2
  rm -f "$TMP"
  exit 1
fi

mkdir -p "$ASSETS_DIR"
mv "$TMP" "$TARGET"

NEW_SHA=$(shasum -a 256 "$TARGET" | awk '{print $1}')

if [ -f "$SHA_FILE" ]; then
  EXPECTED=$(awk '{print $1}' "$SHA_FILE")
  if [ "$EXPECTED" != "$NEW_SHA" ]; then
    echo "[vendor-vconsole] WARNING: sha 与 $SHA_FILE 不一致" >&2
    echo "  expected: $EXPECTED" >&2
    echo "  got:      $NEW_SHA" >&2
    echo "  如果是主动升级 vConsole,用 --update-sha 写入新的 sha:" >&2
    echo "    bash scripts/vendor-vconsole.sh --update-sha" >&2
    if [ "${1:-}" != "--update-sha" ]; then
      exit 2
    fi
    echo "$NEW_SHA  vconsole.min.js" > "$SHA_FILE"
    echo "[vendor-vconsole] sha 已更新到 $SHA_FILE"
  else
    echo "[vendor-vconsole] sha 校验通过: $NEW_SHA"
  fi
else
  echo "$NEW_SHA  vconsole.min.js" > "$SHA_FILE"
  echo "[vendor-vconsole] 首次写入 sha: $NEW_SHA → $SHA_FILE"
fi

echo "[vendor-vconsole] OK: $TARGET ($(wc -c < "$TARGET" | tr -d ' ') 字节, version=$VERSION)"
