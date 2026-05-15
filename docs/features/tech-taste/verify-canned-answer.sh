#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"

echo "==> [tech-taste] running vitest for packages/core/src/taste"
output="$(cd "$REPO_ROOT" && pnpm vitest run packages/core/src/taste --reporter=basic 2>&1 | tail -10)"
echo "$output"

if echo "$output" | grep -q "Test Files.*0 passed\|FAIL\|Error:"; then
  echo "FAIL: tech-taste tests did not pass"
  exit 1
fi

echo "VERIFIED: tech-taste extraction from commit history PASS"
