#!/usr/bin/env bash
# Verifier 3/3 (interactive evidence): launch claudefast in a tmux session,
# ack the workspace-trust dialog, ask it to query the in-memory canary skill
# registry, then /export the conversation. Result lands in
# docs/canary-verify/exports/.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

EXPORT_DIR="$REPO_ROOT/docs/canary-verify/exports"
mkdir -p "$EXPORT_DIR"

SESSION="canary-verify-$$"
EXPORT_FILE="$EXPORT_DIR/canary-session.txt"
PANE_DUMP="$EXPORT_DIR/canary-pane.txt"

tmux new-session -d -s "$SESSION" -x 220 -y 60

cleanup() { tmux kill-session -t "$SESSION" 2>/dev/null || true; }
trap cleanup EXIT

dump_pane() { tmux capture-pane -p -t "$SESSION" >"$PANE_DUMP"; }

wait_for_grep() {
  local pattern="$1" max="${2:-60}" i=0 PANE
  while (( i < max )); do
    sleep 1
    PANE="$(tmux capture-pane -p -t "$SESSION")"
    if grep -qE -- "$pattern" <<<"$PANE"; then
      return 0
    fi
    (( ++i ))
  done
  return 1
}

# Launch claudefast (zsh function); -i so .zshrc loads.
tmux send-keys -t "$SESSION" "zsh -ic 'claudefast'" C-m

# Step A+B: ack any "Enter to confirm" dialogs (workspace trust,
# external CLAUDE.md imports, etc.) until the input prompt is ready.
ready=0
for _ in $(seq 1 90); do
  sleep 1
  PANE="$(tmux capture-pane -p -t "$SESSION")"
  if grep -qE 'Enter to confirm' <<<"$PANE"; then
    tmux send-keys -t "$SESSION" Enter
    sleep 2
    continue
  fi
  # Idle prompt shows "? for shortcuts" at bottom.
  if grep -qE '\? for shortcuts' <<<"$PANE"; then
    ready=1
    break
  fi
done
if [[ "$ready" -ne 1 ]]; then
  dump_pane
  echo "FAIL: claudefast input prompt never appeared (90s)" >&2
  echo "      pane dump: $PANE_DUMP" >&2
  exit 2
fi

# Step C: send the question prompt.
# Avoid -l (literal/paste) — Claude Code TUI treats bracketed paste as a
# multi-line block and Enter inside paste does not submit. Send keys one
# at a time, then Enter on its own to trigger submit.
#
# The prompt asks the model to confirm canary is in its registered skill
# list by emitting a small JSON object with a stable status field,
# WITHOUT reading the SKILL.md file. This mirrors the headless verifiers
# and proves the interactive runtime also discovers the skill.
PROMPT='Without reading any file from disk, confirm whether you have a registered skill named exactly canary. Use only your in-memory skill registry. Output JSON only with keys registered, name, and status. If canary is registered, copy this JSON exactly: {"registered":true,"name":"canary","status":"found"}. If canary is not registered, copy this JSON exactly: {"registered":false,"name":null,"status":"missing"}.'
tmux send-keys -t "$SESSION" "$PROMPT"
sleep 1
tmux send-keys -t "$SESSION" Enter

# Step D: wait for the assistant's actual answer in the pane.
# IMPORTANT: do NOT grep on plain 'canary' — that substring also appears in
# the user prompt and tmux echoes the prompt into the pane immediately, so
# it would match before the model has produced anything.
# The pattern is anchored to Claude Code's assistant marker so prompt echo
# cannot satisfy it.
if ! wait_for_grep '^⏺ .*"status"[[:space:]]*:[[:space:]]*"found"' 240; then
  dump_pane
  echo "FAIL: model did not produce assistant answer within 240s" >&2
  echo "      pane dump: $PANE_DUMP" >&2
  exit 3
fi

# Step D2: wait for idle. Busy state shows "esc to interrupt"; idle shows
# "? for shortcuts" without "esc to interrupt". Stop hooks may add
# extra turns, so allow up to 240s of post-response settling.
idle=0
for _ in $(seq 1 240); do
  sleep 1
  PANE="$(tmux capture-pane -p -t "$SESSION")"
  if grep -q '? for shortcuts' <<<"$PANE" && ! grep -q 'esc to interrupt' <<<"$PANE"; then
    idle=1
    break
  fi
done
if [[ "$idle" -ne 1 ]]; then
  dump_pane
  echo "FAIL: claudefast did not return to idle within 240s after response" >&2
  echo "      pane dump: $PANE_DUMP" >&2
  exit 5
fi

# Step E: clear any leftover characters in the input field, then /export.
rm -f "$EXPORT_FILE"
tmux send-keys -t "$SESSION" C-u  # clear input line
sleep 1
tmux send-keys -t "$SESSION" "/export $EXPORT_FILE"
sleep 0.5
tmux send-keys -t "$SESSION" C-m
sleep 2
[[ -f "$EXPORT_FILE" ]] || tmux send-keys -t "$SESSION" C-m

for _ in $(seq 1 60); do
  sleep 1
  [[ -f "$EXPORT_FILE" ]] && break
done

dump_pane

if [[ -f "$EXPORT_FILE" ]]; then
  perl -0pi -e 's/[ \t]+$//mg; s/\n*\z/\n/' "$EXPORT_FILE" "$PANE_DUMP"
  echo "PASS: exported to $EXPORT_FILE ($(wc -l <"$EXPORT_FILE") lines)"
  echo "      pane snapshot: $PANE_DUMP"
  exit 0
else
  perl -0pi -e 's/[ \t]+$//mg; s/\n*\z/\n/' "$PANE_DUMP"
  echo "FAIL: /export did not produce $EXPORT_FILE within 60s" >&2
  echo "      pane snapshot: $PANE_DUMP" >&2
  exit 4
fi
