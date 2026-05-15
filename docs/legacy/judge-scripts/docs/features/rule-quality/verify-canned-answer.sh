#!/usr/bin/env bash
# Rule-quality validator feature verification gate.
# Runs run-judge.sh and asserts exit 0, then echoes VERIFIED.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/run-judge.sh"
EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "FAILED: rule-quality judge exited $EXIT_CODE" >&2
  exit 1
fi

echo "VERIFIED: rule-quality validator PASS"
