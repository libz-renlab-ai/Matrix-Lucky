#!/usr/bin/env bash
# Verify: teamagent init --help exits 0 and contains expected keywords.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mkdir -p docs/features/cli-init

OUT=$(pnpm teamagent init --help 2>&1 | head -40)
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "FAIL: teamagent init --help exited $STATUS"
  exit 1
fi

# init must mention init or config
if echo "$OUT" | grep -qi -E '\binit\b|config'; then
  echo "VERIFIED: init command PASS"
  exit 0
else
  echo "FAIL: init --help output missing 'init' or 'config'"
  echo "--- output ---"
  echo "$OUT"
  exit 1
fi
