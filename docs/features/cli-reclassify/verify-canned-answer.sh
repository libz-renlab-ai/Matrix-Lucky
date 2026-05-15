#!/usr/bin/env bash
# Verify: teamagent reclassify --help exits 0 and contains expected keywords.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mkdir -p docs/features/cli-reclassify

OUT=$(pnpm teamagent reclassify --help 2>&1 | head -40)
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "FAIL: teamagent reclassify --help exited $STATUS"
  exit 1
fi

# reclassify must mention rule or scope
if echo "$OUT" | grep -qi -E 'rule|scope'; then
  echo "VERIFIED: reclassify command PASS"
  exit 0
else
  echo "FAIL: reclassify --help output missing 'rule' or 'scope'"
  echo "--- output ---"
  echo "$OUT"
  exit 1
fi
