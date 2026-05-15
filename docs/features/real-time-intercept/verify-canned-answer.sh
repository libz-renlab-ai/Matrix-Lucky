#!/usr/bin/env bash
# verify-canned-answer.sh — Gate script for "real-time intercept (PreToolUse)" feature.
# Runs the stop-narrative-scan vitest suite and asserts exit 0.
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

( cd "$REPO_ROOT" && pnpm vitest run packages/cli/src/__tests__/stop-narrative-scan.test.ts --reporter=basic 2>&1 | tail -20 )

echo ""
echo "VERIFIED: real-time intercept (PreToolUse path) PASS"
