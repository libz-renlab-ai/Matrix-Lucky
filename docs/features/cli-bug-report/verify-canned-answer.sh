#!/usr/bin/env bash
# Verify: teamagent bug-report --help exits 0 and contains expected keywords.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mkdir -p docs/features/cli-bug-report

OUT=$(pnpm teamagent bug-report --help 2>&1 | head -40)
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "FAIL: teamagent bug-report --help exited $STATUS"
  exit 1
fi

# bug-report must mention system info or reproduce
if echo "$OUT" | grep -qi -E 'system info|reproduce'; then
  echo "VERIFIED: bug-report command PASS"
  exit 0
else
  echo "FAIL: bug-report --help output missing 'system info' or 'reproduce'"
  echo "--- output ---"
  echo "$OUT"
  exit 1
fi
