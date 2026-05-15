#!/usr/bin/env bash
# Verify: Live Knowledge Portal (HTTP + WebSocket)
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
echo "=== knowledge-portal verify ==="
OUTPUT="$(pnpm --dir "${REPO_ROOT}" vitest run packages/portal --reporter=basic 2>&1 | tail -20)"
echo "${OUTPUT}"
if echo "${OUTPUT}" | grep -q "Test Files  1 passed"; then
  echo "VERIFIED: live knowledge portal HTTP+WS PASS"
  exit 0
else
  echo "FAIL: portal tests did not pass"
  exit 1
fi
