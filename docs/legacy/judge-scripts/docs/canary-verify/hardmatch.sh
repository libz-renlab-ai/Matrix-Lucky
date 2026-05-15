#!/usr/bin/env bash
# Verifier 3/3: paired JSON deep-equal between claudefast and codex outputs.
# Uses jq -S to canonicalize key order, then diff for byte-equality.
# Exits 0 only when both files exist AND are identical.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

A="docs/canary-verify/runs/claudefast.json"
B="docs/canary-verify/runs/codex.json"

[[ -f "$A" ]] || { echo "FAIL: $A not found — run verify-claudefast.sh first" >&2; exit 2; }
[[ -f "$B" ]] || { echo "FAIL: $B not found — run verify-codex.sh first" >&2; exit 2; }

# Canonicalize: sort keys recursively.
A_CANON="$(mktemp)"; trap 'rm -f "$A_CANON" "$B_CANON"' EXIT
B_CANON="$(mktemp)"
jq -S '.' "$A" >"$A_CANON"
jq -S '.' "$B" >"$B_CANON"

if diff -u "$A_CANON" "$B_CANON" >/dev/null; then
  echo "PASS hardmatch: claudefast.json == codex.json (canonical jq -S diff)"
  echo
  echo "--- canonical JSON ---"
  cat "$A_CANON"
  exit 0
else
  echo "FAIL hardmatch: claudefast.json != codex.json"
  echo
  diff -u "$A_CANON" "$B_CANON" | sed -e 's#^#  #'
  exit 1
fi
