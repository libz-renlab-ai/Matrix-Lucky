#!/usr/bin/env bash
# Verify: team review gate (PII redaction)
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
echo "=== review-gate verify ==="

OUTPUT="$(pnpm --dir "${REPO_ROOT}" vitest run packages/core/src/pii/__tests__/redactor.test.ts --reporter=basic 2>&1 | tail -10)"
echo "${OUTPUT}"

if echo "${OUTPUT}" | grep -qE "(passed|✓)"; then
  echo "VERIFIED: team review gate (PII redaction) PASS"
  exit 0
else
  echo "FAIL: PII redactor tests did not pass"
  exit 1
fi
