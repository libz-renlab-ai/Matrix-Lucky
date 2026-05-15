#!/usr/bin/env bash
# Judge harness: canned-answer probes (DOGFOOD / DUCKPLAN / POSTPR)
#
# Probes claudefast for the three most safety-critical canned answers.
# All checks are mechanical string greps — no LLM re-judge.
#
# PASS requires ALL anchors present in their respective probe output.
#
# Output: .judge/canned-answers/<run_id>/judge.json + verdict.txt

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/.judge/canned-answers/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== canned-answers judge harness run_id=${RUN_ID} ==="
cd "${REPO_ROOT}"

TIMEOUT_BIN="$(command -v timeout || command -v gtimeout || true)"

run_cf() {
  local prompt="$1" outfile="$2"
  if [ -n "${TIMEOUT_BIN}" ]; then
    "${TIMEOUT_BIN}" 180 claudefast -p "${prompt}" > "${outfile}" 2>&1 || true
  else
    claudefast -p "${prompt}" > "${outfile}" 2>&1 || true
  fi
}

# Probe A: DOGFOOD
echo "[Probe A] DOGFOOD ..."
run_cf "what would happen when we say DOGFOOD?" "${EVIDENCE_DIR}/probe-dogfood.txt"

# Probe B: DUCKPLAN
echo "[Probe B] DUCKPLAN ..."
run_cf "what would happen if we say 'DUCKPLAN'" "${EVIDENCE_DIR}/probe-duckplan.txt"

# Probe C: POSTPR
echo "[Probe C] POSTPR ..."
run_cf "what we shall do after each PR?" "${EVIDENCE_DIR}/probe-postpr.txt"

# Mechanical checks
check() {
  local file="$1" pattern="$2" label="$3"
  if grep -Eq "${pattern}" "${file}"; then
    echo "[PASS] ${label}"
    echo "true"
  else
    echo "[FAIL] ${label} (missing: ${pattern})"
    echo "false"
  fi
}

DOGFOOD_A=$(check "${EVIDENCE_DIR}/probe-dogfood.txt" "two tmux windows|two.tmux.windows" "dogfood:two-tmux-windows"; true)
DOGFOOD_B=$(check "${EVIDENCE_DIR}/probe-dogfood.txt" "left.?right.?split|left/right" "dogfood:left-right-split"; true)
DOGFOOD_C=$(check "${EVIDENCE_DIR}/probe-dogfood.txt" "interact" "dogfood:interact"; true)

DUCKPLAN_A=$(check "${EVIDENCE_DIR}/probe-duckplan.txt" "task description|任务描述" "duckplan:task-description"; true)
DUCKPLAN_B=$(check "${EVIDENCE_DIR}/probe-duckplan.txt" "expected outputs|预期产出" "duckplan:expected-outputs"; true)
DUCKPLAN_C=$(check "${EVIDENCE_DIR}/probe-duckplan.txt" "judge harness|JSON|LLM" "duckplan:judge-harness"; true)
DUCKPLAN_D=$(check "${EVIDENCE_DIR}/probe-duckplan.txt" "duck|鸭|呷呷" "duckplan:duck"; true)

POSTPR_A=$(check "${EVIDENCE_DIR}/probe-postpr.txt" "fetch the codex review|fetch.*codex" "postpr:fetch-codex-review"; true)
POSTPR_B=$(check "${EVIDENCE_DIR}/probe-postpr.txt" "chatgpt-codex-connector" "postpr:codex-bot"; true)
POSTPR_C=$(check "${EVIDENCE_DIR}/probe-postpr.txt" "pulls/.*comments|pulls.*comments" "postpr:pulls-comments"; true)
POSTPR_D=$(check "${EVIDENCE_DIR}/probe-postpr.txt" "silent|loop" "postpr:silent-loop"; true)

# Aggregate
all_pass() {
  for v in "$@"; do [ "$v" = "true" ] || return 1; done
}

OVERALL_PASS=false

# Re-evaluate properly
DA=false; grep -Eq "two tmux windows|two.tmux.windows" "${EVIDENCE_DIR}/probe-dogfood.txt" 2>/dev/null && DA=true || true
DB=false; grep -Eq "left.?right.?split|left/right" "${EVIDENCE_DIR}/probe-dogfood.txt" 2>/dev/null && DB=true || true
DC=false; grep -Eq "interact" "${EVIDENCE_DIR}/probe-dogfood.txt" 2>/dev/null && DC=true || true
DPA=false; grep -Eq "task description|任务描述" "${EVIDENCE_DIR}/probe-duckplan.txt" 2>/dev/null && DPA=true || true
DPB=false; grep -Eq "expected outputs|预期产出" "${EVIDENCE_DIR}/probe-duckplan.txt" 2>/dev/null && DPB=true || true
DPC=false; grep -Eq "judge harness|JSON|LLM" "${EVIDENCE_DIR}/probe-duckplan.txt" 2>/dev/null && DPC=true || true
DPD=false; grep -Eq "duck|鸭|呷呷" "${EVIDENCE_DIR}/probe-duckplan.txt" 2>/dev/null && DPD=true || true
PA=false; grep -Eq "fetch the codex review|fetch.*codex" "${EVIDENCE_DIR}/probe-postpr.txt" 2>/dev/null && PA=true || true
PB=false; grep -Eq "chatgpt-codex-connector" "${EVIDENCE_DIR}/probe-postpr.txt" 2>/dev/null && PB=true || true
PC=false; grep -Eq "pulls/.*comments|pulls.*comments" "${EVIDENCE_DIR}/probe-postpr.txt" 2>/dev/null && PC=true || true
PD=false; grep -Eq "silent|loop" "${EVIDENCE_DIR}/probe-postpr.txt" 2>/dev/null && PD=true || true

( $DA && $DB && $DC && $DPA && $DPB && $DPC && $DPD && $PA && $PB && $PC && $PD ) && OVERALL_PASS=true || true

cat > "${EVIDENCE_DIR}/judge.json" <<ENDJSON
{
  "run_id": "${RUN_ID}",
  "exit_code": $([ "${OVERALL_PASS}" = "true" ] && echo 0 || echo 1),
  "dogfood": {
    "two_tmux_windows": ${DA},
    "left_right_split": ${DB},
    "interact": ${DC}
  },
  "duckplan": {
    "task_description": ${DPA},
    "expected_outputs": ${DPB},
    "judge_harness": ${DPC},
    "duck": ${DPD}
  },
  "postpr": {
    "fetch_codex_review": ${PA},
    "codex_bot": ${PB},
    "pulls_comments": ${PC},
    "silent_loop": ${PD}
  },
  "overall_pass": ${OVERALL_PASS},
  "evidence_dir": "${EVIDENCE_DIR}",
  "stdout_path": "${STDOUT_LOG}"
}
ENDJSON

echo "=== Summary ==="
echo "dogfood: tmux=${DA} split=${DB} interact=${DC}"
echo "duckplan: task=${DPA} outputs=${DPB} harness=${DPC} duck=${DPD}"
echo "postpr: fetch=${PA} bot=${PB} pulls=${PC} silent=${PD}"
echo "overall_pass: ${OVERALL_PASS}"
echo "judge.json: ${EVIDENCE_DIR}/judge.json"

if [ "${OVERALL_PASS}" = "true" ]; then
  echo "PASS" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 0
else
  echo "FAIL" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 1
fi
