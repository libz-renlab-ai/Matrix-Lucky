#!/usr/bin/env bash
# verify-statusline.sh — Channel #4: Statusline rendering evidence collector
#
# Inputs (env vars):
#   RUN_ID      — unique identifier for this harness run (required)
#   HOMEDIR     — tmp HOME dir with .claude/ wired by teamagent init (required)
#   PROJECT_DIR — fresh tmp project dir (required)
#   WAIT_SECS   — seconds to wait for UI to fully render (optional, default: 8)
#
# Outputs written to .judge/$RUN_ID/evidence/:
#   tmux-statusline.snapshot — raw tmux pane capture (3000-line scrollback)
#
# Exit codes:
#   0 — tmux session spawned and snapshot captured successfully
#   1 — tmux not found on PATH, required env var missing, or tmux new-session failed
#
# Caveats:
#   - Requires a real PTY / tmux server; will fail on headless servers without
#     a running tmux server or display.
#   - claudefast must be able to start non-interactively with HOME=$HOMEDIR.
#   - The orchestrator/probes should grep the snapshot for statusline anchors
#     (e.g. "ta:", rule count numbers, "rules") — this script only captures.

set -eu

# ── Validate required env vars ────────────────────────────────────────────────
: "${RUN_ID:?ERROR: RUN_ID is required}"
: "${HOMEDIR:?ERROR: HOMEDIR is required}"
: "${PROJECT_DIR:?ERROR: PROJECT_DIR is required}"
WAIT_SECS="${WAIT_SECS:-8}"

# ── Validate tmux is on PATH ──────────────────────────────────────────────────
if ! command -v tmux >/dev/null 2>&1; then
    echo "ERROR: tmux not found on PATH — install it before running Channel #4" >&2
    exit 1
fi

# ── Prepare evidence directory (absolute, robust to any cd) ──────────────────
WORKTREE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVIDENCE_DIR="${WORKTREE_ROOT}/.judge/${RUN_ID}/evidence"
mkdir -p "${EVIDENCE_DIR}"

SNAPSHOT_FILE="${EVIDENCE_DIR}/tmux-statusline.snapshot"

# ── Session name: unique per RUN_ID ──────────────────────────────────────────
SESSION="teamagent-verify-${RUN_ID}"

# ── Trap: always kill tmux session on exit (prevents leaks on abort) ─────────
cleanup() {
    tmux kill-session -t "${SESSION}" 2>/dev/null || true
}
trap cleanup EXIT

# ── Spawn detached claudefast inside tmux ────────────────────────────────────
# -x 200 -y 60 gives enough columns/rows for statusline to render.
# IMPORTANT: do NOT override HOME here. claudefast wraps `zsh -ic` to load its
# function from the user's real .zshrc; an empty tmp HOME breaks the wrapper.
# Project-local hook at PROJECT_DIR/.claude/settings.local.json is picked up
# via cwd-based discovery (claudefast walks up from cwd).
if ! tmux new-session -d -s "${SESSION}" -x 200 -y 60 \
        "cd \"${PROJECT_DIR}\" && claudefast"; then
    echo "ERROR: tmux new-session failed — cannot spawn Channel #4 session" >&2
    exit 1
fi

# ── Wait for UI + statusline to render ───────────────────────────────────────
sleep "${WAIT_SECS}"

# ── Send a benign prompt to wake any lazy renderers ──────────────────────────
tmux send-keys -t "${SESSION}" "echo hello-from-verify" Enter
sleep 3

# ── Capture pane scrollback ──────────────────────────────────────────────────
tmux capture-pane -t "${SESSION}":0.0 -p -S -3000 > "${SNAPSHOT_FILE}"

echo "Channel #4 evidence collected"
echo "  snapshot : ${SNAPSHOT_FILE}"
echo "  session  : ${SESSION} (will be killed by trap)"

exit 0
