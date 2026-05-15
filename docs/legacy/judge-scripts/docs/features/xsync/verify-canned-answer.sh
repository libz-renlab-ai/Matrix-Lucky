#!/usr/bin/env bash
# verify-canned-answer.sh — Gate script for cross-machine git-sync (xsync) feature.
# Wraps run-judge.sh and asserts exit 0, then echoes VERIFIED.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/run-judge.sh"
EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "FAILED: cross-machine git-sync (xsync) judge exited $EXIT_CODE" >&2
  exit 1
fi

echo ""
echo "VERIFIED: xsync cross-machine sync PASS"
