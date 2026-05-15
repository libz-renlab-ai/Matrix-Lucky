#!/usr/bin/env bash
# verify-canned-answer.sh — Gate script for team-share round-trip (export/import) feature.
# Wraps run-transfer-judge.sh and asserts exit 0, then echoes VERIFIED.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/run-transfer-judge.sh"
EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "FAILED: team-share round-trip (export/import) judge exited $EXIT_CODE" >&2
  exit 1
fi

echo ""
echo "VERIFIED: team-share round-trip PASS"
