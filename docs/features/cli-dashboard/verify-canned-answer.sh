#!/usr/bin/env bash
# Verify: teamagent dashboard --help exits 0 and contains expected keywords.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mkdir -p docs/features/cli-dashboard

OUT=$(pnpm teamagent dashboard --help 2>&1 | head -40)
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "FAIL: teamagent dashboard --help exited $STATUS"
  exit 1
fi

# dashboard must mention VERIFIED or PLANNED (dashboard shows feature status)
if echo "$OUT" | grep -qi -E 'VERIFIED|PLANNED'; then
  echo "VERIFIED: dashboard command PASS"
  exit 0
else
  echo "FAIL: dashboard --help output missing 'VERIFIED' or 'PLANNED'"
  echo "--- output ---"
  echo "$OUT"
  exit 1
fi
