#!/usr/bin/env bash
# Verify: teamagent dogfood-report --help exits 0 and contains expected keywords.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mkdir -p docs/features/cli-dogfood-report

OUT=$(pnpm teamagent dogfood-report --help 2>&1 | head -40)
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "FAIL: teamagent dogfood-report --help exited $STATUS"
  exit 1
fi

# dogfood-report must mention tier or sandbox
if echo "$OUT" | grep -qi -E 'tier|sandbox'; then
  echo "VERIFIED: dogfood-report command PASS"
  exit 0
else
  echo "FAIL: dogfood-report --help output missing 'tier' or 'sandbox'"
  echo "--- output ---"
  echo "$OUT"
  exit 1
fi
