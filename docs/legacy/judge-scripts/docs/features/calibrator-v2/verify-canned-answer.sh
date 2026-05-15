#!/usr/bin/env bash
# verify-canned-answer.sh — verify calibrator-v2 feature via dynamic probe.
#
# Replaces the old static canned-answer-snippet.md approach.
# Runs scripts/probe-feature.sh calibrator-v2 and asserts:
#   1. Probe artifact directory was created.
#   2. stream.jsonl exists and is non-empty.
#   3. Probe answer references at least one real source file
#      (substring: calibration-pipeline-v2.ts).
#
# Exit codes:
#   0  — PASS or SKIP (claudefast unavailable)
#   1  — FAIL (assertion message names the failing check)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
PROBE_SCRIPT="$REPO_ROOT/scripts/probe-feature.sh"
FEATURE="calibrator-v2"
ARTIFACT_BASE="$REPO_ROOT/.fastprobe/feature-${FEATURE}"

# Check claudefast availability; SKIP (exit 0) if not reachable.
# A bare PATH binary or a zsh alias both count as available.
_cf_available() {
  # Binary/script on PATH (works in subshells without sourcing .zshrc)
  local bin
  bin="$(command -v claudefast 2>/dev/null || true)"
  if [[ -n "$bin" && -x "$bin" ]]; then return 0; fi
  # zsh alias/function fallback (interactive zsh only)
  if zsh -i -c "command -v claudefast" >/dev/null 2>&1; then return 0; fi
  return 1
}

if ! _cf_available; then
  echo "SKIP [calibrator-v2]: claudefast unavailable — skipping probe"
  exit 0
fi

# Ensure probe script exists
if [[ ! -f "$PROBE_SCRIPT" ]]; then
  echo "FAIL [calibrator-v2]: probe script not found: $PROBE_SCRIPT" >&2
  exit 1
fi

cd "$REPO_ROOT"

# Run the probe (exit 2 = claudefast error but artifacts still written — allow)
PROBE_EXIT=0
bash "$PROBE_SCRIPT" "$FEATURE" || PROBE_EXIT=$?
if [[ $PROBE_EXIT -eq 1 ]]; then
  echo "FAIL [calibrator-v2]: probe-feature.sh exited 1 (usage/flag error)" >&2
  exit 1
fi

# Assertion 1: artifact directory created
LATEST_DIR="$(find "$ARTIFACT_BASE" -maxdepth 1 -name 'probe-*' -type d 2>/dev/null \
  | sort | tail -1)"
if [[ -z "$LATEST_DIR" ]]; then
  echo "FAIL [calibrator-v2]: no probe artifact directory found under $ARTIFACT_BASE" >&2
  exit 1
fi

# Assertion 2: stream.jsonl is non-empty
STREAM_LOG="${LATEST_DIR}/stream.jsonl"
if [[ ! -f "$STREAM_LOG" ]]; then
  echo "FAIL [calibrator-v2]: stream.jsonl not found at $STREAM_LOG" >&2
  exit 1
fi
STREAM_BYTES="$(wc -c <"$STREAM_LOG" | tr -d ' ')"
if [[ "$STREAM_BYTES" -lt 1 ]]; then
  echo "FAIL [calibrator-v2]: stream.jsonl is empty at $STREAM_LOG" >&2
  exit 1
fi

# Assertion 3: probe output references a real source file.
# Check answer.md first; fall back to searching stream.jsonl directly
# (probe-feature.sh's jq extractor may miss non-delta event formats).
ANSWER_MD="${LATEST_DIR}/answer.md"
EVIDENCE_FILE="calibration-pipeline-v2.ts"
if { [[ -f "$ANSWER_MD" ]] && grep -qF "$EVIDENCE_FILE" "$ANSWER_MD"; } \
    || grep -qF "$EVIDENCE_FILE" "$STREAM_LOG" 2>/dev/null; then
  : # evidence found — assertion passes
else
  echo "FAIL [calibrator-v2]: neither answer.md nor stream.jsonl references '$EVIDENCE_FILE'" >&2
  echo "  answer.md:   $ANSWER_MD" >&2
  echo "  stream.jsonl: $STREAM_LOG" >&2
  exit 1
fi

echo "VERIFIED: calibrator-v2 probe PASS"
echo "  Artifact: $LATEST_DIR"
echo "  stream.jsonl: ${STREAM_BYTES} bytes"
echo "  Evidence anchor found: $EVIDENCE_FILE"
