#!/usr/bin/env bash
set -euo pipefail

# run-v1.sh — V1: 先跑 3 路 user，再跑 3 路 dev；dev 读取 user raw，形成真实 inter-communication。
# 输入: $1=SANDBOX (绝对路径)
# 输出: $SANDBOX/raw/{user1..3}-{user,dev}.{jsonl,debug.log,stderr.log,help.txt}

if [[ $# -lt 1 ]]; then
  echo "usage: $0 SANDBOX" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SANDBOX="$1"
RAW_DIR="$SANDBOX/raw"
mkdir -p "$RAW_DIR"

USER_PROMPT='请帮我学 Python pandas，必须给出 read_csv、dataframe 选列、groupby 三个最小例子。'

launch_one() {
  local user_id="$1"
  local view="$2"
  local prompt="$3"
  local pid_book="$4"

  local user_root="$SANDBOX/$user_id"
  local cfg_dir="$user_root/claude-config"
  local codex_dir="$user_root/codex-home"
  local home_dir="$user_root/home"
  local out_jsonl="$RAW_DIR/${user_id}-${view}.jsonl"
  local debug_log="$RAW_DIR/${user_id}-${view}.debug.log"
  local stderr_log="$RAW_DIR/${user_id}-${view}.stderr.log"
  local help_file="$RAW_DIR/${user_id}-${view}.help.txt"
  mkdir -p "$cfg_dir" "$codex_dir" "$home_dir"

  (
    env \
      USER_COLLECT_ROOT="$ROOT" \
      USER_COLLECT_SANDBOX="$SANDBOX" \
      USER_COLLECT_CFG_DIR="$cfg_dir" \
      USER_COLLECT_CODEX_DIR="$codex_dir" \
      USER_COLLECT_HOME_DIR="$home_dir" \
      USER_COLLECT_HELP_FILE="$help_file" \
      USER_COLLECT_DEBUG_LOG="$debug_log" \
      USER_COLLECT_PROMPT="$prompt" \
      zsh -i -c '
        set -euo pipefail
        cd "$USER_COLLECT_ROOT" || exit 1
        export DOGFOOD_CLAUDE_CONFIG_DIR="$USER_COLLECT_CFG_DIR"
        export DOGFOOD_CODEX_HOME="$USER_COLLECT_CODEX_DIR"
        export DOGFOOD_HOME="$USER_COLLECT_HOME_DIR"
        export DOGFOOD_SHIM_QUIET=1
        source scripts/dogfood-shim.sh
        source docs/feature-verify-kit/claudefast-stream-json-flags.sh
        typeset -a stream_flags
        while IFS= read -r flag; do
          stream_flags+=("$flag")
        done < <(claudefast_stream_json_flags claudefast "$USER_COLLECT_HELP_FILE" "$USER_COLLECT_DEBUG_LOG")
        printf "%s" "$USER_COLLECT_PROMPT" | claudefast -p \
          "${stream_flags[@]}" \
          --permission-mode acceptEdits \
          --add-dir "$USER_COLLECT_SANDBOX"
      ' >"$out_jsonl" 2>"$stderr_log"
  ) &

  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$!" "$user_id-$view" "$out_jsonl" "$debug_log" "$stderr_log" "$help_file" \
    >> "$pid_book"
  echo "[user-collect] launched $user_id-$view pid=$! out=$out_jsonl"
}

validate_one() {
  local tag="$1"
  local out_jsonl="$2"
  local debug_log="$3"
  local stderr_log="$4"
  local help_file="$5"
  local event_count

  [[ -s "$out_jsonl" ]] || {
    echo "[user-collect] FAIL $tag missing stream-json output: $out_jsonl" >&2
    return 1
  }

  event_count=$(grep -c '"type":' "$out_jsonl" || true)
  [[ "$event_count" -ge 1 ]] || {
    echo "[user-collect] FAIL $tag stream-json event count < 1: $out_jsonl" >&2
    return 1
  }

  if [[ -s "${help_file}.capabilities.json" ]] &&
     jq -e '.hookDebugSupported == true' "${help_file}.capabilities.json" >/dev/null 2>&1; then
    [[ -s "$debug_log" ]] || {
      echo "[user-collect] FAIL $tag hook debug log missing: $debug_log" >&2
      return 1
    }
  fi

  if [[ -s "$stderr_log" ]] && grep -qiE 'fatal|error:' "$stderr_log"; then
    echo "[user-collect] FAIL $tag stderr contains fatal/error: $stderr_log" >&2
    sed -n '1,80p' "$stderr_log" >&2
    return 1
  fi

  echo "[user-collect] OK $tag events=$event_count"
}

wait_batch() {
  local label="$1"
  local pid_book="$2"
  local failed=0

  while IFS=$'\t' read -r pid tag out_jsonl debug_log stderr_log help_file; do
    [[ -n "${pid:-}" ]] || continue
    if ! wait "$pid"; then
      echo "[user-collect] FAIL $label process exit != 0: $tag pid=$pid" >&2
      failed=1
      continue
    fi
    if ! validate_one "$tag" "$out_jsonl" "$debug_log" "$stderr_log" "$help_file"; then
      failed=1
    fi
  done < "$pid_book"

  [[ "$failed" -eq 0 ]] || exit 1
}

build_dev_prompt() {
  local user_id="$1"
  local user_raw="$RAW_DIR/${user_id}-user.jsonl"
  cat <<EOF
读取文件 $user_raw 的 stream-json transcript。你是该用户的 dev 同事：
1. 只基于该 transcript 总结用户卡住的地方；
2. 给出 read_csv、dataframe 选列、groupby 三个最小例子；
3. 明确写出你读到的 user raw 文件路径。
只回复正文，不要 markdown 标题。
EOF
}

USER_PID_BOOK="$RAW_DIR/.user-pids"
DEV_PID_BOOK="$RAW_DIR/.dev-pids"
: > "$USER_PID_BOOK"
: > "$DEV_PID_BOOK"

echo "[user-collect] phase=user start"
for uid in user1 user2 user3; do
  launch_one "$uid" "user" "$USER_PROMPT" "$USER_PID_BOOK"
done
wait_batch "user" "$USER_PID_BOOK"

echo "[user-collect] phase=dev start"
for uid in user1 user2 user3; do
  launch_one "$uid" "dev" "$(build_dev_prompt "$uid")" "$DEV_PID_BOOK"
done
wait_batch "dev" "$DEV_PID_BOOK"

echo "[user-collect] V1 done sandbox=$SANDBOX"
ls -la "$RAW_DIR"
