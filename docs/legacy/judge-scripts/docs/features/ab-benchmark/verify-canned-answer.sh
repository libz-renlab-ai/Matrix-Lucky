#!/usr/bin/env bash
# Verify: A/B benchmark vs bare Claude
# Runs the existing run-judge.sh and asserts exit 0
set -euo pipefail

BENCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$BENCH_DIR/run-judge.sh"
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "FAIL: A/B benchmark run-judge.sh exited $EXIT_CODE"
  exit 1
fi

echo "VERIFIED: A/B benchmark PASS"
