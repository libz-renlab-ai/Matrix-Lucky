#!/usr/bin/env bash
set -euo pipefail

# run-v2.sh — V2: 开发者侧 verifier，只读 SANDBOX raw，输出结构化 handout JSON。

if [[ $# -lt 1 ]]; then
  echo "usage: $0 SANDBOX" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SANDBOX="$1"
OUT_JSON="$SANDBOX/v2-handout.json"
STDERR_LOG="$SANDBOX/v2.stderr"
HELP_FILE="$SANDBOX/v2-help.txt"
STATE_DIR="$SANDBOX/v2-state"
mkdir -p "$STATE_DIR/claude-config" "$STATE_DIR/codex-home" "$STATE_DIR/home"

PROMPT=$(cat <<EOF
读取 $SANDBOX/raw/*.jsonl，仅基于这些 raw transcript 输出纯 JSON。schema:
{
  "per_user": {
    "user1": {
      "user_view": { "event_count": 0, "assistant_messages": 0, "read_csv": true, "select_columns": true, "groupby": true },
      "dev_view": { "event_count": 0, "assistant_messages": 0, "read_csv": true, "select_columns": true, "groupby": true },
      "interaction": { "dev_read_user_raw": true, "user_raw_path": "$SANDBOX/raw/user1-user.jsonl" }
    },
    "user2": { "...same-shape..." : true },
    "user3": { "...same-shape..." : true }
  },
  "summary": {
    "total_files": 6,
    "all_examples_covered": true,
    "usage_rollup": { "total_events": 0, "assistant_messages": 0 }
  }
}
要求:
1. 不要 markdown，不要代码块，只输出 JSON。
2. 若某字段无法从证据确认，给 false 或 0，不要猜。
3. user2/user3 必须与 user1 同形。
EOF
)

env \
  USER_COLLECT_ROOT="$ROOT" \
  USER_COLLECT_SANDBOX="$SANDBOX" \
  USER_COLLECT_CFG_DIR="$STATE_DIR/claude-config" \
  USER_COLLECT_CODEX_DIR="$STATE_DIR/codex-home" \
  USER_COLLECT_HOME_DIR="$STATE_DIR/home" \
  USER_COLLECT_HELP_FILE="$HELP_FILE" \
  USER_COLLECT_PROMPT="$PROMPT" \
  zsh -i -c '
    set -euo pipefail
    cd "$USER_COLLECT_ROOT" || exit 1
    export DOGFOOD_CLAUDE_CONFIG_DIR="$USER_COLLECT_CFG_DIR"
    export DOGFOOD_CODEX_HOME="$USER_COLLECT_CODEX_DIR"
    export DOGFOOD_HOME="$USER_COLLECT_HOME_DIR"
    export DOGFOOD_SHIM_QUIET=1
    source scripts/dogfood-shim.sh
    claudefast -h >"$USER_COLLECT_HELP_FILE"
    printf "%s" "$USER_COLLECT_PROMPT" | claudefast -p \
      --permission-mode acceptEdits \
      --add-dir "$USER_COLLECT_SANDBOX"
  ' > "$OUT_JSON" 2> "$STDERR_LOG"

jq -e '
  (.per_user.user1.user_view.event_count | type == "number") and
  (.per_user.user1.dev_view.event_count | type == "number") and
  (.per_user.user2.user_view.event_count | type == "number") and
  (.per_user.user3.dev_view.event_count | type == "number") and
  (.per_user.user1.interaction.dev_read_user_raw | type == "boolean") and
  (.summary.total_files == 6) and
  (.summary.usage_rollup.total_events | type == "number") and
  (.summary.usage_rollup.assistant_messages | type == "number")
' "$OUT_JSON" >/dev/null

echo "[user-collect] V2 done -> $OUT_JSON"
ls -la "$OUT_JSON" "$STDERR_LOG" "$HELP_FILE"
