#!/usr/bin/env bash
# Third-party judge harness: teamagent doctor command
#
# Mechanical checks:
#   1. packages/cli/src/commands/doctor.ts exists
#   2. exports runDoctor or executeDoctor function
#   3. exports DoctorResult interface
#   4. Contains all Phase 3 diagnostic check names:
#      knowledge-db, hook-registered, hook-script, plugin-sync, settings-json-scope
#   5. doctor command is registered in CLI bin
#
# Usage: bash docs/features/phase3-4/doctor/run-judge.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/tmp/.judge/doctor/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"
STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== doctor command judge run_id=${RUN_ID} ==="

DOCTOR_SRC="${REPO_ROOT}/packages/cli/src/commands/doctor.ts"
BIN_SRC="${REPO_ROOT}/packages/cli/src/bin.ts"

# Check 1: doctor.ts exists
CHECK_EXISTS=false
[ -f "${DOCTOR_SRC}" ] && CHECK_EXISTS=true
echo "[1] doctor.ts exists: ${CHECK_EXISTS}"

# Check 2: exports runDoctor or executeDoctor
CHECK_EXPORT_FN=false
if [ "${CHECK_EXISTS}" = "true" ] && grep -qE "export.*(runDoctor|executeDoctor)" "${DOCTOR_SRC}"; then
  CHECK_EXPORT_FN=true
fi
echo "[2] exports run/executeDoctor: ${CHECK_EXPORT_FN}"

# Check 3: exports DoctorResult
CHECK_EXPORT_RESULT=false
if [ "${CHECK_EXISTS}" = "true" ] && grep -q "export.*DoctorResult" "${DOCTOR_SRC}"; then
  CHECK_EXPORT_RESULT=true
fi
echo "[3] exports DoctorResult: ${CHECK_EXPORT_RESULT}"

# Check 4: contains required check probe names
CHECK_PROBES=false
MISSING_PROBES=""
for probe in "knowledge-db" "hook-registered" "hook-script" "plugin-sync" "settings-json-scope"; do
  if [ "${CHECK_EXISTS}" = "true" ] && grep -q "${probe}" "${DOCTOR_SRC}"; then
    echo "  probe '${probe}': present"
  else
    MISSING_PROBES="${MISSING_PROBES} ${probe}"
    echo "  probe '${probe}': MISSING"
  fi
done
[ -z "${MISSING_PROBES}" ] && CHECK_PROBES=true
echo "[4] all probe names present: ${CHECK_PROBES}"

# Check 5: doctor registered in bin.ts
CHECK_BIN_REGISTER=false
if [ -f "${BIN_SRC}" ] && grep -q "doctor" "${BIN_SRC}"; then
  CHECK_BIN_REGISTER=true
fi
echo "[5] doctor registered in bin: ${CHECK_BIN_REGISTER}"

ALL_PASSED=false
if [ "${CHECK_EXISTS}" = "true" ] && \
   [ "${CHECK_EXPORT_FN}" = "true" ] && \
   [ "${CHECK_EXPORT_RESULT}" = "true" ] && \
   [ "${CHECK_PROBES}" = "true" ] && \
   [ "${CHECK_BIN_REGISTER}" = "true" ]; then
  ALL_PASSED=true
fi

JUDGE_JSON="${EVIDENCE_DIR}/judge.json"
node --no-warnings -e "
const fs = require('fs');
const j = {
  run_id: '${RUN_ID}',
  feature: 'doctor',
  evidence_dir: '${EVIDENCE_DIR}',
  stdout_path: '${STDOUT_LOG}',
  checks: {
    doctor_ts_exists: ${CHECK_EXISTS},
    exports_run_or_execute_doctor: ${CHECK_EXPORT_FN},
    exports_DoctorResult: ${CHECK_EXPORT_RESULT},
    all_probe_names_present: ${CHECK_PROBES},
    registered_in_bin: ${CHECK_BIN_REGISTER}
  },
  all_passed: ${ALL_PASSED}
};
fs.writeFileSync('${JUDGE_JSON}', JSON.stringify(j, null, 2) + '\n');
console.log(JSON.stringify(j, null, 2));
"
echo "evidence_dir : ${EVIDENCE_DIR}"
echo "all_passed   : ${ALL_PASSED}"
[ "${ALL_PASSED}" = "true" ] && echo "RESULT: PASS" && exit 0 || { echo "RESULT: FAIL"; exit 1; }
