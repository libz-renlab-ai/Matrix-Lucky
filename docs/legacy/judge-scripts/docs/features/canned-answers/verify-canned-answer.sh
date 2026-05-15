#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VERIFY_ALL="$REPO_ROOT/scripts/verify-all-rules.sh"
CLAUDE_MD="$REPO_ROOT/CLAUDE.md"

if [ -x "$VERIFY_ALL" ]; then
  echo "==> [canned-answers] running verify-all-rules.sh"
  bash "$VERIFY_ALL" 2>&1 | tail -30
else
  echo "==> [canned-answers] verify-all-rules.sh not found; falling back to grep check"
  for kw in DOGFOOD POSTPR BUGREPORT FASTPROBE PRESHIP DUCKPLAN; do
    if ! grep -q "$kw" "$CLAUDE_MD"; then
      echo "FAIL: keyword '$kw' not found in CLAUDE.md"
      exit 1
    fi
    echo "  [ok] $kw found in CLAUDE.md"
  done
fi

echo "VERIFIED: stable canned-answer rules PASS"
