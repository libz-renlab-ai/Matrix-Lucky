#!/usr/bin/env bash
set -euo pipefail

INSTALL_OR_UPDATE_CMD='npm install -g github:libz-renlab-ai/TeamBrain#release'
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

deny() {
  local reason="$1"

  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "TeamAgent is required for Claude-assisted work in this repository. ${reason} Install or update TeamAgent, then restart Claude. Command: ${INSTALL_OR_UPDATE_CMD}"
  }
}
JSON

  exit 0
}

if ! command -v teamagent >/dev/null 2>&1; then
  deny "TeamAgent is not installed."
fi

if ! teamagent required-check --project "$PROJECT_DIR" >/dev/null 2>&1; then
  deny "TeamAgent is missing, stale, unhealthy, or not current for this repository."
fi

exit 0
