#!/usr/bin/env bash
# Verify: SQLite migration (migrate-v6)
# Asserts pnpm teamagent migrate-v6 --dry-run exits 0 and outputs migration info
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

mkdir -p docs/features/sqlite-store

OUT="$(pnpm teamagent migrate-v6 --dry-run 2>&1 | tail -20)"
EXIT_CODE=$?

echo "$OUT"

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "FAIL: migrate-v6 --dry-run exited $EXIT_CODE"
  exit 1
fi

if ! echo "$OUT" | grep -qi "migrat"; then
  echo "FAIL: output does not contain 'migrat' keyword"
  exit 1
fi

echo "VERIFIED: SQLite migration v6 PASS"
