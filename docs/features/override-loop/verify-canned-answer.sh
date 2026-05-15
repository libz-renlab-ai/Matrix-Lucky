#!/usr/bin/env bash
# Verify: AI override closed-loop feedback
# Runs the override-loop vitest suite and asserts exit 0
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

mkdir -p docs/features/override-loop

OUT="$(pnpm vitest run --reporter=basic packages/core/src/__tests__/override-loop.test.ts 2>&1 | tail -10)"
EXIT_CODE=$?

echo "$OUT"

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "FAIL: override-loop tests exited $EXIT_CODE"
  exit 1
fi

echo "VERIFIED: AI override closed-loop PASS"
