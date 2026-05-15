#!/usr/bin/env bash
# verify-canned-answer.sh — Gate script for PII redaction feature.
# Wraps run-judge.sh and asserts exit 0, then echoes VERIFIED.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/run-judge.sh"
EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "FAILED: PII redaction judge exited $EXIT_CODE" >&2
  exit 1
fi

echo ""
echo "VERIFIED: pii-redaction PASS"
