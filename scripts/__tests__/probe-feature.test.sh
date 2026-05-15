#!/usr/bin/env bash
# __tests__/probe-feature.test.sh — smoke test for scripts/probe-feature.sh
#
# Usage:
#   bash scripts/__tests__/probe-feature.test.sh
#
# Behavior:
#   - If claudefast is NOT on PATH (and not reachable as a zsh alias), prints
#     SKIP and exits 0 — CI without claudefast must not fail.
#   - If claudefast IS reachable, runs probe-feature.sh against feature
#     "calibrator-v2" and asserts:
#       1. The artifact directory .fastprobe/feature-calibrator-v2/probe-<ts>/
#          was created.
#       2. stream.jsonl exists inside that directory.
#       3. stream.jsonl is non-empty (at least 1 byte).
#       4. answer.md exists inside that directory.
#
# Exit codes:
#   0  — PASS or SKIP
#   1  — FAIL

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$REPO_ROOT" ]]; then
  echo "SKIP: cannot determine repo root (not inside a git repo)" >&2
  exit 0
fi

PROBE_SCRIPT="$REPO_ROOT/scripts/probe-feature.sh"
FEATURE="calibrator-v2"

# ── check claudefast availability ─────────────────────────────────────────────
cf_available() {
  if command -v claudefast >/dev/null 2>&1; then
    return 0
  fi
  # Try zsh interactive to pick up aliases
  if zsh -i -c "command -v claudefast" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

if ! cf_available; then
  echo "SKIP: claudefast not found on PATH or as a zsh alias — skipping probe-feature smoke test"
  exit 0
fi

# ── verify probe script exists ────────────────────────────────────────────────
if [[ ! -f "$PROBE_SCRIPT" ]]; then
  echo "FAIL: probe script not found at $PROBE_SCRIPT" >&2
  exit 1
fi

# ── run probe ────────────────────────────────────────────────────────────────
echo "probe-feature.test: running probe for feature '${FEATURE}'..."
cd "$REPO_ROOT"

# Capture exit code without aborting the test script
PROBE_EXIT=0
bash "$PROBE_SCRIPT" "$FEATURE" || PROBE_EXIT=$?

# Probe exits 2 on claudefast error but still writes artifacts — we treat that
# as acceptable for the smoke test (network or model issues shouldn't block CI).
if [[ $PROBE_EXIT -eq 1 ]]; then
  echo "FAIL: probe-feature.sh exited 1 (usage error or missing flag)" >&2
  exit 1
fi

# ── assert artifacts ──────────────────────────────────────────────────────────
ARTIFACT_BASE=".fastprobe/feature-${FEATURE}"

# Find the most recently created probe-* directory
LATEST_DIR="$(find "$ARTIFACT_BASE" -maxdepth 1 -name 'probe-*' -type d 2>/dev/null \
  | sort | tail -1)"

if [[ -z "$LATEST_DIR" ]]; then
  echo "FAIL: no probe-* directory found under $ARTIFACT_BASE" >&2
  exit 1
fi
echo "probe-feature.test: artifact dir: $LATEST_DIR"

STREAM_LOG="${LATEST_DIR}/stream.jsonl"
ANSWER_MD="${LATEST_DIR}/answer.md"

# Assert 1: artifact directory exists (already confirmed above)
echo "  [PASS] artifact directory created: $LATEST_DIR"

# Assert 2: stream.jsonl exists
if [[ ! -f "$STREAM_LOG" ]]; then
  echo "FAIL: stream.jsonl not found at $STREAM_LOG" >&2
  exit 1
fi
echo "  [PASS] stream.jsonl exists"

# Assert 3: stream.jsonl is non-empty
STREAM_BYTES="$(wc -c <"$STREAM_LOG" | tr -d ' ')"
if [[ "$STREAM_BYTES" -lt 1 ]]; then
  echo "FAIL: stream.jsonl is empty (0 bytes) at $STREAM_LOG" >&2
  exit 1
fi
echo "  [PASS] stream.jsonl is non-empty (${STREAM_BYTES} bytes)"

# Assert 4: answer.md exists
if [[ ! -f "$ANSWER_MD" ]]; then
  echo "FAIL: answer.md not found at $ANSWER_MD" >&2
  exit 1
fi
echo "  [PASS] answer.md exists"

echo ""
echo "probe-feature.test: PASS — all assertions passed for feature '${FEATURE}'"
exit 0
