#!/usr/bin/env bash
# Live demo for `scripts/teamagent-statusline.cjs`.
#
# Builds an isolated sandbox under /tmp, seeds project/global/events
# SQLite DBs, then opens tmux sessions that:
#
#   1. `--watch`   — 4 windows, each watching one of the script's
#                    runtime branches (full-state / missing-project-db /
#                    global-only / no-db). Refreshes every 2s.
#
#   2. `--claude`  — boots real `claude` inside the sandbox with the
#                    statusLine wired into .claude/settings.local.json,
#                    so the user sees the actual Claude Code TUI render
#                    the production statusline at the bottom.
#
# By default both modes run in two separate tmux sessions and a Terminal
# window pops for each. Pass --no-popup to skip osascript.
#
# Usage:
#   teamagent-statusline-demo.sh              # both watch + claude, popup Terminal
#   teamagent-statusline-demo.sh --watch      # only the 4-scenario watch
#   teamagent-statusline-demo.sh --claude     # only the real-claude TUI
#   teamagent-statusline-demo.sh --no-popup   # build sessions, don't open Terminal
#   teamagent-statusline-demo.sh --cleanup    # kill sessions, remove sandbox
#
# The sandbox lives at /tmp/teamagent-statusline-demo and is fully
# disposable; the user's real ~/.teamagent is never touched.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATUSLINE_PRODUCTION="$REPO_ROOT/scripts/teamagent-statusline.cjs"
SEEDER="$REPO_ROOT/scripts/teamagent-statusline-demo-seed.cjs"
WATCHER="$REPO_ROOT/scripts/teamagent-statusline-demo-watch.sh"

SANDBOX="${TEAMAGENT_DEMO_SANDBOX_DIR:-/tmp/teamagent-statusline-demo}"
WATCH_SESSION="${TEAMAGENT_DEMO_WATCH_SESSION:-statusline-live}"
CLAUDE_SESSION="${TEAMAGENT_DEMO_CLAUDE_SESSION:-statusline-claude}"

MODE="all"
POPUP="yes"

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --watch)    MODE="watch"   ;;
    --claude)   MODE="claude"  ;;
    --all)      MODE="all"     ;;
    --no-popup) POPUP="no"     ;;
    --cleanup)  MODE="cleanup" ;;
    -h|--help)  usage 0        ;;
    *) printf 'unknown flag: %s\n' "$1" >&2; usage 1 ;;
  esac
  shift
done

require_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'missing required binary: %s\n' "$1" >&2
    exit 1
  }
}
require_bin tmux
require_bin node

[ -f "$STATUSLINE_PRODUCTION" ] || {
  printf 'statusline script not found: %s\n' "$STATUSLINE_PRODUCTION" >&2
  exit 1
}

cleanup() {
  tmux kill-session -t "$WATCH_SESSION"  2>/dev/null || true
  tmux kill-session -t "$CLAUDE_SESSION" 2>/dev/null || true
  rm -rf "$SANDBOX"
  printf 'cleaned: tmux sessions %s, %s; sandbox %s\n' \
    "$WATCH_SESSION" "$CLAUDE_SESSION" "$SANDBOX"
}

if [ "$MODE" = "cleanup" ]; then
  cleanup
  exit 0
fi

# Replace any prior sandbox; idempotent.
rm -rf "$SANDBOX"
mkdir -p "$SANDBOX/home/.teamagent" \
         "$SANDBOX/project/.teamagent" \
         "$SANDBOX/project-no-db" \
         "$SANDBOX/non-project" \
         "$SANDBOX/empty-home" \
         "$SANDBOX/empty-non-project"

# Project markers so isProjectDir() returns true in the right scenarios.
echo '{"name":"statusline-demo-project","version":"0.0.0"}' > "$SANDBOX/project/package.json"
echo '{"name":"statusline-demo-no-db","version":"0.0.0"}'   > "$SANDBOX/project-no-db/package.json"

# Timestamps relative to "now" so helped/risk metrics light up sensibly.
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TODAY="$(date -u +%Y-%m-%dT00:30:00Z)"
WEEKAGO="$(date -u -v-3d +%Y-%m-%dT12:00:00Z 2>/dev/null \
        || date -u -d '3 days ago' +%Y-%m-%dT12:00:00Z)"

# Seed project knowledge.db: 2 active non-wiki + 1 active wiki + 1 archived.
node "$SEEDER" "$SANDBOX/project/.teamagent/knowledge.db" knowledge "[
  {\"status\":\"active\",\"type\":\"avoidance\",\"created_at\":\"$TODAY\"},
  {\"status\":\"active\",\"type\":\"practice\",\"created_at\":\"$WEEKAGO\"},
  {\"status\":\"active\",\"type\":\"wiki\",\"created_at\":\"$TODAY\"},
  {\"status\":\"archived\",\"type\":\"avoidance\",\"created_at\":\"$WEEKAGO\"}
]" >/dev/null

# Seed sandbox global.db: 3 active non-wiki + 1 active wiki.
node "$SEEDER" "$SANDBOX/home/.teamagent/global.db" knowledge "[
  {\"status\":\"active\",\"type\":null,\"created_at\":\"$TODAY\"},
  {\"status\":\"active\",\"type\":\"avoidance\",\"created_at\":\"$WEEKAGO\"},
  {\"status\":\"active\",\"type\":\"practice\",\"created_at\":\"$WEEKAGO\"},
  {\"status\":\"active\",\"type\":\"wiki\",\"created_at\":\"$WEEKAGO\"}
]" >/dev/null

# Seed events.db so helped/risk/hint render real values.
node "$SEEDER" "$SANDBOX/home/.teamagent/events.db" events "[
  {\"kind\":\"hook-pre.matched\",\"timestamp\":\"$TODAY\"},
  {\"kind\":\"hook-pre.warned\",\"timestamp\":\"$TODAY\"},
  {\"kind\":\"hook-post.result\",\"timestamp\":\"$WEEKAGO\"},
  {\"kind\":\"compiler.updated\",\"timestamp\":\"$WEEKAGO\"},
  {\"kind\":\"pitfall.added\",\"timestamp\":\"$NOW\"}
]" >/dev/null

build_watch_session() {
  tmux kill-session -t "$WATCH_SESSION" 2>/dev/null || true

  local env_prefix="TEAMAGENT_DEMO_SANDBOX='$SANDBOX' \
TEAMAGENT_DEMO_STATUSLINE='$STATUSLINE_PRODUCTION'"

  tmux new-session -d -s "$WATCH_SESSION" -n "1·full-state" -x 220 -y 60 \
    "env $env_prefix bash '$WATCHER' full-state"
  tmux new-window -t "$WATCH_SESSION" -n "2·missing-db" \
    "env $env_prefix bash '$WATCHER' missing-project-db"
  tmux new-window -t "$WATCH_SESSION" -n "3·global-only" \
    "env $env_prefix bash '$WATCHER' global-only"
  tmux new-window -t "$WATCH_SESSION" -n "4·no-db" \
    "env $env_prefix bash '$WATCHER' no-db"
  tmux select-window -t "$WATCH_SESSION:0"
  printf 'tmux session built: %s (4 windows)\n' "$WATCH_SESSION"
}

build_claude_session() {
  command -v claude >/dev/null 2>&1 || {
    printf 'claude binary not found; skipping --claude session\n' >&2
    return 0
  }

  local demo="$SANDBOX/claude-demo"
  rm -rf "$demo"
  mkdir -p "$demo/.teamagent" "$demo/.claude"
  echo '{"name":"statusline-claude-demo","version":"1.0.0"}' > "$demo/package.json"
  echo '# Statusline live demo project' > "$demo/README.md"

  # Seed a small project DB so the rules: count is non-zero even before
  # the user's real ~/.teamagent is consulted.
  node "$SEEDER" "$demo/.teamagent/knowledge.db" knowledge "[
    {\"status\":\"active\",\"type\":\"avoidance\",\"created_at\":\"$TODAY\"},
    {\"status\":\"active\",\"type\":\"practice\",\"created_at\":\"$WEEKAGO\"},
    {\"status\":\"active\",\"type\":\"practice\",\"created_at\":\"$WEEKAGO\"},
    {\"status\":\"active\",\"type\":\"wiki\",\"created_at\":\"$WEEKAGO\"}
  ]" >/dev/null

  cat > "$demo/.claude/settings.local.json" <<JSON
{
  "statusLine": {
    "type": "command",
    "command": "node $STATUSLINE_PRODUCTION",
    "_teamagentTag": "teamagent-statusline"
  }
}
JSON

  tmux kill-session -t "$CLAUDE_SESSION" 2>/dev/null || true
  tmux new-session -d -s "$CLAUDE_SESSION" -n "real-claude" -x 220 -y 60 \
    "echo '╔══════════════════════════════════════════════════════════════════════╗'; \
     echo '║  Real Claude Code TUI — statusLine wired in .claude/settings.local   ║'; \
     echo '║  Look at the bottom of the screen once Claude boots.                 ║'; \
     echo '╚══════════════════════════════════════════════════════════════════════╝'; \
     sleep 1; \
     cd '$demo' && claude --add-dir '$demo'"
  tmux new-window -t "$CLAUDE_SESSION" -n "raw-script" \
    "env TEAMAGENT_DEMO_SANDBOX='$SANDBOX' TEAMAGENT_DEMO_STATUSLINE='$STATUSLINE_PRODUCTION' \
     bash '$WATCHER' full-state"
  tmux select-window -t "$CLAUDE_SESSION:0"
  printf 'tmux session built: %s (real claude in window 0, raw script in window 1)\n' \
    "$CLAUDE_SESSION"
}

popup() {
  local session="$1"
  if [ "$POPUP" != "yes" ]; then
    printf 'attach manually: tmux attach -t %s\n' "$session"
    return 0
  fi
  if [ "$(uname -s)" != "Darwin" ]; then
    printf '--no-popup forced (non-Darwin); attach manually: tmux attach -t %s\n' "$session"
    return 0
  fi
  /usr/bin/osascript <<OSA
tell application "Terminal"
    activate
    do script "tmux attach -t $session"
end tell
OSA
  printf 'Terminal popped for tmux session: %s\n' "$session"
}

case "$MODE" in
  watch)
    build_watch_session
    popup "$WATCH_SESSION"
    ;;
  claude)
    build_claude_session
    popup "$CLAUDE_SESSION"
    ;;
  all)
    build_watch_session
    build_claude_session
    popup "$WATCH_SESSION"
    popup "$CLAUDE_SESSION"
    ;;
esac

cat <<INFO
---
sandbox     : $SANDBOX
watch tmux  : tmux attach -t $WATCH_SESSION    (4 scenario windows)
claude tmux : tmux attach -t $CLAUDE_SESSION   (real claude TUI in window 0)
cleanup     : $0 --cleanup
INFO
