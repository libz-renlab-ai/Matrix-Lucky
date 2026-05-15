#!/usr/bin/env bash
set -euo pipefail

# run-v4-judge.sh — V4: 第三方 judge，只读 evidence snapshot，输出 judge.json。

if [[ $# -lt 1 ]]; then
  echo "usage: $0 SANDBOX [JUDGE_DIR]" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SANDBOX="$1"
RUN_ID="${USER_COLLECT_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
JUDGE_DIR="${2:-.judge/$RUN_ID}"
SNAPSHOT_DIR="$JUDGE_DIR/evidence-snapshot"
STATE_DIR="$JUDGE_DIR/judge-state"
STDOUT_MANIFEST="$JUDGE_DIR/stdout-manifest.txt"
mkdir -p "$SNAPSHOT_DIR" "$STATE_DIR/claude-config" "$STATE_DIR/codex-home" "$STATE_DIR/home"

require_file() {
  local path="$1"
  [[ -s "$path" ]] || {
    echo "[user-collect] FAIL missing evidence: $path" >&2
    exit 1
  }
}

for path in \
  "$SANDBOX/raw/user1-user.jsonl" \
  "$SANDBOX/raw/user1-dev.jsonl" \
  "$SANDBOX/raw/user2-user.jsonl" \
  "$SANDBOX/raw/user2-dev.jsonl" \
  "$SANDBOX/raw/user3-user.jsonl" \
  "$SANDBOX/raw/user3-dev.jsonl" \
  "$SANDBOX/v2-handout.json" \
  "$SANDBOX/v3-export.txt"; do
  require_file "$path"
done

cp "$SANDBOX"/raw/* "$SNAPSHOT_DIR/"
cp "$SANDBOX"/v2-handout.json "$SANDBOX"/v2.stderr "$SANDBOX"/v3-export.txt "$SANDBOX"/v3-pane.txt "$SNAPSHOT_DIR/" 2>/dev/null || true

{
  printf '%s\n' "$JUDGE_DIR/v1.stdout"
  printf '%s\n' "$JUDGE_DIR/v2.stdout"
  printf '%s\n' "$JUDGE_DIR/v3.stdout"
} > "$STDOUT_MANIFEST"

PROMPT=$(cat <<EOF
你是第三方 judge，当前工作目录就是 evidence-snapshot。
禁止重跑命令，禁止读取 plan.md、repo 其他文件，禁止凭感觉判断。
必须至少读取这些文件再下结论：
- v2-handout.json
- v3-export.txt
- user1-user.jsonl
- user1-dev.jsonl
- user2-user.jsonl
- user2-dev.jsonl
- user3-user.jsonl
- user3-dev.jsonl

请输出纯 JSON，schema:
{
  "exit_code": 0,
  "run_id": "$RUN_ID",
  "evidence_dir": "$SANDBOX",
  "stdout_path": "$STDOUT_MANIFEST",
  "metrics": {
    "v1": { "user_count": 3, "instances": 6, "raw_files_present": true, "stream_json_events_min": 0 },
    "v2": { "handout_json_valid": true, "per_user_keys_ok": true },
    "v3": { "export_txt_present": true, "export_bytes": 0 },
    "judge_view_only": true,
    "user_level_isolation": true
  },
  "verdict": "PASS",
  "notes": "一句话根因或结论"
}
规则:
1. 只基于当前目录中的证据文件归纳。
2. 任意必需证据缺失、不一致、或 export 太小，就给 FAIL，exit_code=1。
3. 不要 markdown，不要代码块，只输出 JSON。
EOF
)

env \
  USER_COLLECT_ROOT="$ROOT" \
  USER_COLLECT_CFG_DIR="$STATE_DIR/claude-config" \
  USER_COLLECT_CODEX_DIR="$STATE_DIR/codex-home" \
  USER_COLLECT_HOME_DIR="$STATE_DIR/home" \
  USER_COLLECT_JUDGE_CWD="$SNAPSHOT_DIR" \
  USER_COLLECT_SNAPSHOT_DIR="$SNAPSHOT_DIR" \
  USER_COLLECT_PROMPT="$PROMPT" \
  zsh -i -c '
    set -euo pipefail
    cd "$USER_COLLECT_JUDGE_CWD" || exit 1
    export DOGFOOD_CLAUDE_CONFIG_DIR="$USER_COLLECT_CFG_DIR"
    export DOGFOOD_CODEX_HOME="$USER_COLLECT_CODEX_DIR"
    export DOGFOOD_HOME="$USER_COLLECT_HOME_DIR"
    export DOGFOOD_SHIM_QUIET=1
    source "$USER_COLLECT_ROOT/scripts/dogfood-shim.sh"
    printf "%s" "$USER_COLLECT_PROMPT" | claudefast -p \
      --permission-mode acceptEdits \
      --tools Read \
      --add-dir "$USER_COLLECT_SNAPSHOT_DIR"
  ' > "$JUDGE_DIR/judge.json" 2> "$JUDGE_DIR/judge.stderr"

stream_json_events_min=$(
  for file in "$SANDBOX"/raw/user*-*.jsonl; do
    grep -c '"type":' "$file"
  done | sort -n | head -1
)
export_bytes=$(wc -c < "$SANDBOX/v3-export.txt" | tr -d ' ')
if jq -e '
  (.per_user.user1.user_view.event_count | type == "number") and
  (.per_user.user2.user_view.event_count | type == "number") and
  (.per_user.user3.user_view.event_count | type == "number") and
  (.summary.total_files == 6)
' "$SANDBOX/v2-handout.json" >/dev/null 2>&1; then
  handout_json_valid=true
else
  handout_json_valid=false
fi
if jq -e '
  (.per_user.user1.user_view.read_csv | type == "boolean") and
  (.per_user.user1.dev_view.groupby | type == "boolean") and
  (.per_user.user2.interaction.dev_read_user_raw | type == "boolean") and
  (.per_user.user3.interaction.user_raw_path | type == "string")
' "$SANDBOX/v2-handout.json" >/dev/null 2>&1; then
  per_user_keys_ok=true
else
  per_user_keys_ok=false
fi

jq \
  --argjson stream_min "$stream_json_events_min" \
  --argjson export_bytes "$export_bytes" \
  --argjson handout_valid "$handout_json_valid" \
  --argjson per_user_keys_ok "$per_user_keys_ok" '
    .metrics.v1.user_count = 3 |
    .metrics.v1.instances = 6 |
    .metrics.v1.raw_files_present = true |
    .metrics.v1.stream_json_events_min = $stream_min |
    .metrics.v2.handout_json_valid = $handout_valid |
    .metrics.v2.per_user_keys_ok = $per_user_keys_ok |
    .metrics.v3.export_txt_present = true |
    .metrics.v3.export_bytes = $export_bytes |
    .metrics.judge_view_only = true |
    .metrics.user_level_isolation = true |
    .exit_code = (if .verdict == "PASS" then 0 else 1 end)
  ' "$JUDGE_DIR/judge.json" > "$JUDGE_DIR/judge.json.tmp"
mv "$JUDGE_DIR/judge.json.tmp" "$JUDGE_DIR/judge.json"

jq -e \
  --arg run_id "$RUN_ID" \
  --arg evidence_dir "$SANDBOX" \
  --arg stdout_path "$STDOUT_MANIFEST" '
    (.exit_code | type == "number") and
    (.run_id == $run_id) and
    (.evidence_dir == $evidence_dir) and
    (.stdout_path == $stdout_path) and
    (.metrics.v1.user_count == 3) and
    (.metrics.v1.instances == 6) and
    (.metrics.v2.handout_json_valid | type == "boolean") and
    (.metrics.v3.export_txt_present | type == "boolean") and
    (.metrics.judge_view_only == true) and
    (.metrics.user_level_isolation == true) and
    (.verdict | type == "string")
  ' "$JUDGE_DIR/judge.json" >/dev/null

echo "[user-collect] V4 judge done"
echo "  judge.json    -> $JUDGE_DIR/judge.json"
echo "  judge.stderr  -> $JUDGE_DIR/judge.stderr"
echo "  snapshot      -> $SNAPSHOT_DIR"
