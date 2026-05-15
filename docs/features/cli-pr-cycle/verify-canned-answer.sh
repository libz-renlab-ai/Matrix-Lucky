#!/usr/bin/env bash
# Verify: teamagent pr-cycle --help exits 0 and contains expected keywords.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mkdir -p docs/features/cli-pr-cycle

OUT=$(pnpm teamagent pr-cycle --help 2>&1 | head -40)
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "FAIL: teamagent pr-cycle --help exited $STATUS"
  exit 1
fi

# pr-cycle must mention PR or review
if echo "$OUT" | grep -qi -E '\bPR\b|review'; then
  echo "VERIFIED: pr-cycle command PASS"
  exit 0
else
  echo "FAIL: pr-cycle --help output missing 'PR' or 'review'"
  echo "--- output ---"
  echo "$OUT"
  exit 1
fi
