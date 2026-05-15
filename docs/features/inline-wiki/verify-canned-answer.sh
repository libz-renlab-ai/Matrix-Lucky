#!/usr/bin/env bash
# Verify: Inline wiki injection into AI context
# The user-prompt-submit hook injects rules inline into AI context.
# Primary: assert 'inject' keyword exists in bin-user-prompt-submit.ts
# Secondary: run user-prompt inject tests
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

mkdir -p docs/features/inline-wiki

FAIL=0

# Primary: assert 'inject' exists in bin-user-prompt-submit.ts
BIN_FILE="packages/cli/src/bin-user-prompt-submit.ts"
if grep -q "inject" "$BIN_FILE"; then
  echo "  [OK] 'inject' found in $BIN_FILE"
else
  echo "  [FAIL] 'inject' NOT found in $BIN_FILE"
  FAIL=1
fi

# Secondary: run user-prompt inject tests
OUT="$(pnpm vitest run --reporter=basic packages/cli/src/__tests__/user-prompt-inject.test.ts 2>&1 | tail -10)"
VITEST_EXIT=$?
echo "$OUT"

if [ "$VITEST_EXIT" -ne 0 ]; then
  echo "  [FAIL] user-prompt-inject tests exited $VITEST_EXIT"
  FAIL=1
else
  echo "  [OK] user-prompt-inject tests pass"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "FAIL: inline wiki injection check failed"
  exit 1
fi

echo "VERIFIED: inline wiki injection PASS"
