#!/usr/bin/env bash
# verify-runtime-hooks.sh — Channel #3: Hook invocation evidence collector
#
# Inputs (env vars, all required):
#   RUN_ID      — unique identifier for this harness run
#   HOMEDIR     — tmp HOME dir (contains .claude/settings.json wired by teamagent init)
#   PROJECT_DIR — fresh tmp project dir (must contain package.json)
#
# Outputs written to .judge/$RUN_ID/evidence/:
#   streamjson.log       — claudefast stdout+stderr (stream-json + debug output)
#   hooks.debug.log      — claudefast hook debug log (--debug-file target)
#   hooks-exit-code.txt  — exit code from the claudefast invocation (single integer)
#
# Exit codes:
#   0 — claudefast was successfully spawned (regardless of its own exit code)
#   1 — claudefast not found on PATH, or required env var missing

set -eu

# ── Validate required env vars ────────────────────────────────────────────────
: "${RUN_ID:?ERROR: RUN_ID is required}"
: "${HOMEDIR:?ERROR: HOMEDIR is required}"
: "${PROJECT_DIR:?ERROR: PROJECT_DIR is required}"

# ── Compute absolute paths up front (before any cd) ──────────────────────────
# Bug fix: EVIDENCE_DIR must be absolute so writes land in the worktree root
# regardless of any subsequent cd into PROJECT_DIR.
WORKTREE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVIDENCE_DIR="${WORKTREE_ROOT}/.judge/${RUN_ID}/evidence"
mkdir -p "${EVIDENCE_DIR}"

# ── Validate claudefast is on PATH ────────────────────────────────────────────
if ! command -v claudefast >/dev/null 2>&1; then
    echo "ERROR: claudefast not found on PATH — install it before running Channel #3" >&2
    exit 1
fi

DEBUG_FILE="${EVIDENCE_DIR}/hooks.debug.log"
STREAM_LOG="${EVIDENCE_DIR}/streamjson.log"
EXIT_CODE_FILE="${EVIDENCE_DIR}/hooks-exit-code.txt"

# ── Invoke claudefast from PROJECT_DIR ────────────────────────────────────────
# Prompt is engineered to trigger a PreToolUse Read event (Channel #3 target).
# SessionStart fires automatically on session open.
# claudefast is wrapped in a 120-second portable timeout (macOS has no GNU timeout).
# Exit code 137 means killed by the timeout watchdog.
#
# IMPORTANT: do NOT override HOME. claudefast at ~/.local/bin/claudefast is a
# thin wrapper that exec's `zsh -ic 'claudefast "$@"'` — it sources the user's
# real .zshrc to load the claudefast shell function (which configures the
# MiniMax token + ANTHROPIC_BASE_URL etc). With HOME overridden to a tmp dir,
# zsh -i sources an empty .zshrc, the function is undefined, and the wrapper
# fails silently. The hook we care about was registered to PROJECT_DIR/.claude/
# settings.local.json (verified in teamagent init output), so claudefast picks
# it up via project-local discovery from cwd, not via HOME.
cd "${PROJECT_DIR}"

claudefast -p \
    --output-format stream-json \
    --include-partial-messages \
    --verbose \
    --debug hooks \
    --debug-file "${DEBUG_FILE}" \
    --permission-mode acceptEdits \
    "Read the file package.json in this directory and tell me one fact about it." \
    > "${STREAM_LOG}" 2>&1 &
CLAUDEFAST_PID=$!
( sleep 120 && kill "${CLAUDEFAST_PID}" 2>/dev/null ) &
KILLER_PID=$!
# Codex P1 fix: with `set -eu`, a non-zero `wait` aborts the script before
# the exit-code file is written, leaving Probe E with no evidence on the
# very failure modes (timeout = 137, network/auth = non-zero) we most need
# to capture. Use `|| CF_EXIT=$?` so the assignment runs unconditionally;
# CF_EXIT defaults to 0 on success.
CF_EXIT=0
wait "${CLAUDEFAST_PID}" 2>/dev/null || CF_EXIT=$?
kill "${KILLER_PID}" 2>/dev/null || true

# Record claudefast's own exit code for the orchestrator to inspect
# (137 = killed by 120s timeout watchdog)
printf '%s\n' "${CF_EXIT}" > "${EXIT_CODE_FILE}"

echo "Channel #3 evidence collected — claudefast exit=${CF_EXIT}"
echo "  stream-json : ${STREAM_LOG}"
echo "  hook debug  : ${DEBUG_FILE}"
echo "  exit code   : ${EXIT_CODE_FILE}"

exit 0
