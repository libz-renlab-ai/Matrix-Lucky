#!/usr/bin/env bash
# Matcher scope regression harness
# Probe A: "list all product features" — response should be generated (not silently suppressed)
# Probe B: "list product feature not tech feature" — should include CEO/duck CSV with header

set -euo pipefail

RUN_ID="$(date +%s)"
EVIDENCE_BASE="/Users/m1/projects/TeamBrain/.claude/worktrees/dev-codex-pr/.judge/matcher"
EVIDENCE="${EVIDENCE_BASE}/${RUN_ID}"
mkdir -p "$EVIDENCE"

echo "=== Matcher Scope Regression Harness run_id=${RUN_ID} ==="
echo "Evidence dir: ${EVIDENCE}"

echo "[Probe A] list all product features ..."
claudefast -p "list all product features" 2>&1 | head -100 > "$EVIDENCE/probe-a.txt"

echo "[Probe B] list product feature not tech feature ..."
claudefast -p "list product feature not tech feature" 2>&1 | head -100 > "$EVIDENCE/probe-b.txt"

PROBE_A_LINES=$(grep -c '[^[:space:]]' "$EVIDENCE/probe-a.txt" || true)
PROBE_B_LINES=$(grep -c '[^[:space:]]' "$EVIDENCE/probe-b.txt" || true)

PROBE_A_PASS=false
if [ "$PROBE_A_LINES" -gt 5 ]; then
  PROBE_A_PASS=true
fi

PROBE_B_HAS_CSV=false
if grep -qF '"状态","功能","给小鸭CEO/VC的解释"' "$EVIDENCE/probe-b.txt"; then
  PROBE_B_HAS_CSV=true
fi

cat > "$EVIDENCE/judge.json" <<EOF
{
  "run_id": "${RUN_ID}",
  "exit_code": 0,
  "probe_a_lines": ${PROBE_A_LINES},
  "probe_b_lines": ${PROBE_B_LINES},
  "probe_b_has_csv_header": ${PROBE_B_HAS_CSV},
  "evidence_dir": "${EVIDENCE}",
  "stdout_paths": {
    "a": "${EVIDENCE}/probe-a.txt",
    "b": "${EVIDENCE}/probe-b.txt"
  }
}
EOF

echo "=== Mechanical checks ==="
echo "probe_a_lines: ${PROBE_A_LINES} (need > 5, pass=${PROBE_A_PASS})"
echo "probe_b_has_csv_header: ${PROBE_B_HAS_CSV}"
echo "judge.json written to: ${EVIDENCE}/judge.json"

echo "[Verdict] Asking LLM judge ..."
claudefast -p "read this judge.json and return PASS only if probe_a_lines > 5 AND probe_b_has_csv_header = true; else FAIL with which probe failed. JSON: $(cat "$EVIDENCE/judge.json")" 2>&1 > "$EVIDENCE/verdict.txt"

echo "=== Verdict ==="
cat "$EVIDENCE/verdict.txt"
echo ""
echo "Evidence dir: ${EVIDENCE}"
echo "JUDGE_JSON=${EVIDENCE}/judge.json"
