#!/usr/bin/env bash
# Verify: Session Monitor (live in-session warnings via PreToolUse + Stop hooks)
# Runs the stop-narrative-scan tests which cover the real-time intercept pipeline
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

mkdir -p docs/features/session-monitor

OUT="$(pnpm vitest run --reporter=basic packages/cli/src/__tests__/stop-narrative-scan.test.ts 2>&1 | tail -10)"
EXIT_CODE=$?

echo "$OUT"

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "FAIL: stop-narrative-scan tests exited $EXIT_CODE"
  exit 1
fi

echo "VERIFIED: session monitor (live warnings via PreToolUse + Stop hooks) PASS"
