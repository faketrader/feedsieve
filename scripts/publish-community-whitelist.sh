#!/usr/bin/env sh
# 把 community/lists/whitelist.yaml（GitHub 公开维护的白名单源文件）发布到线上 D1。
#
# 这是「PR 提交 → 维护者审核合并 → 生效」链路里唯一需要运营亲手执行的一步：
# 合并 whitelist.yaml 的 PR 后运行本脚本，内容以「文件为唯一事实」整体同步
# （文件里删除的账号会被撤销，不再进快照 whitelist 段）。
#
# 用法:
#   scripts/publish-community-whitelist.sh            # 校验并发布
#   scripts/publish-community-whitelist.sh --check    # 只校验+预览，不写库
#
# 前置:
#   - 已在 apps/community-api/wrangler.local.jsonc 配置好真实的 D1 database_id
#     （该文件已被 gitignore，不入库；与部署共用同一份配置）
#   - 本机 wrangler 已登录（与部署同账号）
set -eu
cd "$(dirname "$0")/.."

source_file="community/lists/whitelist.yaml"
config_dir="apps/community-api"
config="wrangler.local.jsonc"
database="feedsieve-community"

mode="${1:-}"
if [ "$mode" != "" ] && [ "$mode" != "--check" ]; then
  echo "usage: $0 [--check]" >&2
  exit 1
fi

sql_file="$(mktemp "${TMPDIR:-/tmp}/feedsieve-whitelist.XXXXXX.sql")"
trap 'rm -f "$sql_file"' EXIT

# 校验/SQL 生成统一走 JS 实现（scripts/lib/whitelist-schema.mjs），
# 这里只是 CLI 薄包装：mode 为空（写 SQL 文件）或 --check（只校验+预览）。
node scripts/publish-whitelist-sql.mjs "$source_file" "$mode" "$sql_file"

if [ -z "$mode" ]; then
  echo "publishing to D1 ($database)…"
  (cd "$config_dir" && pnpm exec wrangler d1 execute "$database" --remote --config "$config" --file "$sql_file")

  # D1 同步完成后立即触发快照发布（人工发布通道，绕开当日一版节流）。
  # 这是唯一的生效入口：脚本直写 D1 不会置快照脏标记，cron 不感知，必须在这里显式收尾。
  . "$(dirname "$0")/lib/api-base.sh"
  resolve_feedsieve_api_base
  base="$FEEDSIEVE_API_BASE"
  key="${FEEDSIEVE_AGENT_KEY:-$(cat "${FEEDSIEVE_AGENT_KEY_FILE:-$HOME/.config/feedsieve/agent.key}" 2>/dev/null || true)}"
  if [ -z "$base" ] || [ -z "$key" ]; then
    echo "warning: 缺少 agent API 配置，快照未发布——白名单要等下一次 cron 版本号滚动才可见" >&2
    exit 0
  fi
  echo "publishing snapshot…"
  if ! curl -fsSL -X POST -H "x-agent-key: $key" -H 'content-type: application/json' "$base/api/agent/accounts/publish"; then
    echo "error: 快照发布失败，白名单已入库但没有随快照可见（重跑本脚本或调用 /api/agent/accounts/publish）" >&2
    exit 1
  fi
  echo "published. 快照与白名单均已生效。"
fi