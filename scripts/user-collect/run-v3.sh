#!/usr/bin/env bash
set -euo pipefail

# run-v3.sh — V3: tmux 起 interactive claudefast，覆盖三类 pandas 例子，并强制产出 /export 证据。

if [[ $# -lt 1 ]]; then
  echo "usage: $0 SANDBOX" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SANDBOX="$1"
STATE_DIR="$SANDBOX/v3-state"
SESSION="user-collect-v3-$(date +%s)"
EXPORT_FILE="$SANDBOX/v3-export.txt"
PANE_FILE="$SANDBOX/v3-pane.txt"
LAUNCHER="$SANDBOX/v3-launch.zsh"
REL_EXPORT_STEM=".judge/$SESSION/v3-export"
REL_EXPORT_DIR="$ROOT/.judge/$SESSION"
REL_EXPORT_TXT="$ROOT/$REL_EXPORT_STEM.txt"
REL_EXPORT_MD="$ROOT/$REL_EXPORT_STEM.md"
mkdir -p "$STATE_DIR/claude-config" "$STATE_DIR/codex-home" "$STATE_DIR/home" "$REL_EXPORT_DIR"

cat > "$LAUNCHER" <<EOF
cd "$ROOT" || exit 1
export DOGFOOD_CLAUDE_CONFIG_DIR="$STATE_DIR/claude-config"
export DOGFOOD_CODEX_HOME="$STATE_DIR/codex-home"
export DOGFOOD_HOME="$STATE_DIR/home"
export DOGFOOD_SHIM_QUIET=1
source "$ROOT/scripts/dogfood-shim.sh"
exec claudefast --permission-mode acceptEdits --add-dir "$SANDBOX"
EOF
chmod +x "$LAUNCHER"

PROMPT='请帮我学 Python pandas，必须给出 read_csv、dataframe 选列、groupby 三个最小例子，并说明什么时候该用 groupby。'

fail() {
  tmux capture-pane -t "$SESSION" -p >> "$PANE_FILE" 2>/dev/null || true
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  echo "[user-collect] FAIL: $*" >&2
  echo "[user-collect] see pane: $PANE_FILE" >&2
  exit 1
}

handle_setup_prompt() {
  local pane_text="$1"
  if printf '%s\n' "$pane_text" | grep -q "Choose the text style"; then
    tmux send-keys -t "$SESSION" Enter
    sleep 2
    return 0
  fi
  if printf '%s\n' "$pane_text" | grep -q "Do you want to use this API key?"; then
    tmux send-keys -t "$SESSION" "1"
    sleep 1
    tmux send-keys -t "$SESSION" C-m
    sleep 2
    return 0
  fi
  if printf '%s\n' "$pane_text" | grep -q "Press Enter to continue"; then
    tmux send-keys -t "$SESSION" Enter
    sleep 2
    return 0
  fi
  if printf '%s\n' "$pane_text" | grep -q "Yes, I trust this folder"; then
    tmux send-keys -t "$SESSION" "1"
    sleep 1
    tmux send-keys -t "$SESSION" C-m
    sleep 2
    return 0
  fi
  if printf '%s\n' "$pane_text" | grep -q "New MCP server found in .mcp.json"; then
    tmux send-keys -t "$SESSION" "3"
    sleep 1
    tmux send-keys -t "$SESSION" C-m
    sleep 2
    return 0
  fi
  if printf '%s\n' "$pane_text" | grep -q "Allow external CLAUDE.md file imports"; then
    tmux send-keys -t "$SESSION" "1"
    sleep 1
    tmux send-keys -t "$SESSION" C-m
    sleep 2
    return 0
  fi
  if printf '%s\n' "$pane_text" | grep -q "running in Bypass Permissions mode"; then
    tmux send-keys -t "$SESSION" "2"
    sleep 1
    tmux send-keys -t "$SESSION" C-m
    sleep 2
    return 0
  fi
  return 1
}

snapshot_pane() {
  local label="$1"
  {
    printf '===== %s =====\n' "$label"
    tmux capture-pane -t "$SESSION" -p 2>/dev/null || true
    printf '\n'
  } >> "$PANE_FILE"
}

rm -f "$EXPORT_FILE" "$PANE_FILE" "$REL_EXPORT_TXT" "$REL_EXPORT_MD"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -x 220 -y 60 -c "$ROOT" "exec zsh -i '$LAUNCHER'"
: > "$PANE_FILE"

ready=0
for _i in $(seq 1 30); do
  sleep 2
  pane="$(tmux capture-pane -t "$SESSION" -p 2>/dev/null || true)"
  if handle_setup_prompt "$pane"; then
    continue
  fi
  if printf '%s\n' "$pane" | grep -q "Claude Code"; then
    ready=1
    break
  fi
done
[[ "$ready" -eq 1 ]] || fail "claudefast interactive UI not ready within 60s"
snapshot_pane "after-ready"

tmux send-keys -t "$SESSION" C-u
tmux send-keys -t "$SESSION" "$PROMPT"
sleep 1
tmux send-keys -t "$SESSION" Enter

for _i in $(seq 1 60); do
  sleep 3
  pane_tail="$(tmux capture-pane -t "$SESSION" -p | tail -8)"
  if handle_setup_prompt "$pane_tail"; then
    continue
  fi
  if printf '%s\n' "$pane_tail" | grep -q "Do you want to proceed?"; then
    tmux send-keys -t "$SESSION" "1"
    sleep 1
    tmux send-keys -t "$SESSION" C-m
    continue
  fi
  if printf '%s\n' "$pane_tail" | grep -qE "esc to interrupt|queued messages"; then
    continue
  fi
  break
done

sleep 10
snapshot_pane "after-prompt"

tmux send-keys -t "$SESSION" C-u
tmux send-keys -t "$SESSION" "/export $REL_EXPORT_STEM"
sleep 1
tmux send-keys -t "$SESSION" Enter

exported=0
for _j in $(seq 1 30); do
  sleep 2
  if [[ -s "$REL_EXPORT_TXT" || -s "$REL_EXPORT_MD" ]]; then
    exported=1
    break
  fi
done

snapshot_pane "after-export"
tmux send-keys -t "$SESSION" "/exit" C-m
sleep 1
tmux kill-session -t "$SESSION" 2>/dev/null || true

if [[ -s "$REL_EXPORT_TXT" ]]; then
  cp "$REL_EXPORT_TXT" "$EXPORT_FILE"
elif [[ -s "$REL_EXPORT_MD" ]]; then
  cp "$REL_EXPORT_MD" "$EXPORT_FILE"
fi

[[ "$exported" -eq 1 && -s "$EXPORT_FILE" ]] || fail "/export did not produce a usable file"

size=$(wc -c < "$EXPORT_FILE" | tr -d ' ')
[[ "$size" -ge 100 ]] || fail "export too small: $EXPORT_FILE bytes=$size"

echo "[user-collect] V3 done export=$EXPORT_FILE bytes=$size"
echo "[user-collect] pane=$PANE_FILE"
