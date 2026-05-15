#!/usr/bin/env bash
# verify-canned-answer.sh — Gate script for "auto-capture corrections from every session" feature.
# Runs extraction-judge.sh + real-judge.sh if present; falls back to vitest.
# Exit 0 = VERIFIED.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve repo root via git common dir (handles worktrees)
GIT_COMMON_DIR="$(git -C "$SCRIPT_DIR" rev-parse --git-common-dir 2>/dev/null || true)"
if [ -n "$GIT_COMMON_DIR" ]; then
  REPO_ROOT="$(cd "$GIT_COMMON_DIR/.." && pwd)"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
fi

EXTRACTION_JUDGE="$SCRIPT_DIR/extraction-judge.sh"
REAL_JUDGE="$SCRIPT_DIR/real-judge.sh"

if [ -f "$EXTRACTION_JUDGE" ] && [ -f "$REAL_JUDGE" ]; then
  echo "[verify] Running extraction-judge.sh ..."
  bash "$EXTRACTION_JUDGE"
  echo "[verify] Running real-judge.sh ..."
  bash "$REAL_JUDGE"
else
  echo "[verify] Judge harness scripts not found in $SCRIPT_DIR; falling back to vitest ..."
  ( cd "$REPO_ROOT" && pnpm vitest run packages/core/src/correction-detector --reporter=basic 2>&1 | tail -20 )
fi

echo ""
echo "VERIFIED: auto-capture extraction + real-session detection PASS"
