#!/usr/bin/env bash
# 一键将 starter 模板改名成新项目:替换 package.json 名称、README 标题、
# PM2 配置样例、storage key 前缀等。
#
# 用法:
#   bash scripts/rename-project.sh <new-project-name> [new-storage-prefix]
#
# 例子:
#   bash scripts/rename-project.sh my-cool-app mycool
#
# 参数:
#   new-project-name    新项目名(npm 包名格式,小写短横线),会替换 package.json 的 name 字段
#   new-storage-prefix  可选,前端 localStorage key 前缀,默认取项目名去短横线。
#                       会把 web/*.js 里的 "app." 前缀替换为 "<prefix>."
#
# 执行前请确认:
#   1. 已初始化 git(方便撤销)
#   2. 已阅读 docs/rename-checklist.md(如存在)中的手工修改项

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/rename-project.sh <new-project-name> [new-storage-prefix]
EOF
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

NEW_NAME="$1"
if [[ ! "$NEW_NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "ERROR: new-project-name must be lowercase letters/digits/dashes." >&2
  exit 1
fi

DEFAULT_PREFIX="${NEW_NAME//-/}"
NEW_PREFIX="${2:-$DEFAULT_PREFIX}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "WARN: git not found; changes will not be revertible." >&2
fi

echo "=== Rename starter ==="
echo "  root            : $ROOT"
echo "  new name        : $NEW_NAME"
echo "  storage prefix  : $NEW_PREFIX"
echo

# 1. package.json name
if [[ -f package.json ]]; then
  node -e "
    const fs=require('fs');
    const p=JSON.parse(fs.readFileSync('package.json','utf8'));
    p.name='${NEW_NAME}';
    fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');
  "
  echo "[ok] package.json name -> ${NEW_NAME}"
fi

# 2. README 标题(首行 # xxx)
if [[ -f README.md ]]; then
  # 兼容 macOS/BSD sed
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "1s/^# .*/# ${NEW_NAME}/" README.md
  else
    sed -i "1s/^# .*/# ${NEW_NAME}/" README.md
  fi
  echo "[ok] README.md title"
fi

# 3. 前端 storage key: app.* -> <prefix>.*
for file in web/api.js web/webview-identity.js web/debug.js; do
  [[ -f "$file" ]] || continue
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s/\"app\\./\"${NEW_PREFIX}./g" "$file"
    sed -i '' "s/'app\\./'${NEW_PREFIX}./g" "$file"
  else
    sed -i "s/\"app\\./\"${NEW_PREFIX}./g" "$file"
    sed -i "s/'app\\./'${NEW_PREFIX}./g" "$file"
  fi
  echo "[ok] storage prefix in $file"
done

cat <<EOF

=== Next manual steps ===
  1. 更新 server/index.js 里的 <title> / brand 文案
  2. 更新 design-system/ 里的品牌 token + logo
  3. 填写新的 .env.local(COS、IM、MySQL 等)
  4. 初始化新的 git 仓库或新 remote(scripts/setup-git-remotes.sh 可参考)
  5. git diff 人工检查改动,然后 commit

完成。
EOF
