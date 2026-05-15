#!/usr/bin/env bash
# Third-party judge harness: portal package stub
#
# Mechanical checks:
#   1. packages/portal/src/index.ts exists
#   2. exports createPortalServer function
#   3. exports PortalServer interface (type keyword or TypeScript interface)
#   4. package.json has correct name @teamagent/portal
#   5. TypeScript compiles without errors (tsc --noEmit on portal package)
#
# Output:
#   tmp/.judge/portal/<run_id>/judge.json
#   tmp/.judge/portal/<run_id>/stdout.log
#
# Usage: bash docs/features/phase3-4/portal/run-judge.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/tmp/.judge/portal/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"
STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== portal stub judge run_id=${RUN_ID} ==="

PORTAL_INDEX="${REPO_ROOT}/packages/portal/src/index.ts"
PORTAL_PKG="${REPO_ROOT}/packages/portal/package.json"

# Check 1: file exists
CHECK_EXISTS=false
if [ -f "${PORTAL_INDEX}" ]; then
  CHECK_EXISTS=true
  echo "[1] index.ts exists: PASS"
else
  echo "[1] index.ts exists: FAIL — ${PORTAL_INDEX} missing"
fi

# Check 2: exports createPortalServer
CHECK_EXPORT_FN=false
if [ "${CHECK_EXISTS}" = "true" ] && grep -q "export.*createPortalServer" "${PORTAL_INDEX}"; then
  CHECK_EXPORT_FN=true
  echo "[2] exports createPortalServer: PASS"
else
  echo "[2] exports createPortalServer: FAIL"
fi

# Check 3: exports PortalServer interface/type
CHECK_EXPORT_IFACE=false
if [ "${CHECK_EXISTS}" = "true" ] && grep -q "export.*PortalServer" "${PORTAL_INDEX}"; then
  CHECK_EXPORT_IFACE=true
  echo "[3] exports PortalServer type: PASS"
else
  echo "[3] exports PortalServer type: FAIL"
fi

# Check 4: package.json name
CHECK_PKG_NAME=false
if [ -f "${PORTAL_PKG}" ]; then
  PKG_NAME="$(node --no-warnings -e "process.stdout.write(JSON.parse(require('fs').readFileSync('${PORTAL_PKG}','utf-8')).name||'')")"
  if [ "${PKG_NAME}" = "@teamagent/portal" ]; then
    CHECK_PKG_NAME=true
    echo "[4] package.json name=@teamagent/portal: PASS"
  else
    echo "[4] package.json name=@teamagent/portal: FAIL (got '${PKG_NAME}')"
  fi
else
  echo "[4] package.json: FAIL — file missing"
fi

# Check 5: TypeScript compiles
CHECK_TSC=false
TSC_OUT="${EVIDENCE_DIR}/tsc.stdout.txt"
TSC_ERR="${EVIDENCE_DIR}/tsc.stderr.txt"
(cd "${REPO_ROOT}/packages/portal" && "${REPO_ROOT}/node_modules/.bin/tsc" --noEmit 2>"${TSC_ERR}" >"${TSC_OUT}") && CHECK_TSC=true || true
if [ "${CHECK_TSC}" = "true" ]; then
  echo "[5] tsc --noEmit: PASS"
else
  echo "[5] tsc --noEmit: FAIL — see ${TSC_ERR}"
fi

ALL_PASSED=false
if [ "${CHECK_EXISTS}" = "true" ] && \
   [ "${CHECK_EXPORT_FN}" = "true" ] && \
   [ "${CHECK_EXPORT_IFACE}" = "true" ] && \
   [ "${CHECK_PKG_NAME}" = "true" ] && \
   [ "${CHECK_TSC}" = "true" ]; then
  ALL_PASSED=true
fi

JUDGE_JSON="${EVIDENCE_DIR}/judge.json"
node --no-warnings -e "
const fs = require('fs');
const j = {
  run_id: '${RUN_ID}',
  feature: 'portal',
  evidence_dir: '${EVIDENCE_DIR}',
  stdout_path: '${STDOUT_LOG}',
  checks: {
    index_ts_exists: ${CHECK_EXISTS},
    exports_createPortalServer: ${CHECK_EXPORT_FN},
    exports_PortalServer_type: ${CHECK_EXPORT_IFACE},
    package_json_name_correct: ${CHECK_PKG_NAME},
    tsc_noEmit_pass: ${CHECK_TSC}
  },
  all_passed: ${ALL_PASSED}
};
fs.writeFileSync('${JUDGE_JSON}', JSON.stringify(j, null, 2) + '\n');
console.log(JSON.stringify(j, null, 2));
"

echo ""
echo "evidence_dir : ${EVIDENCE_DIR}"
echo "all_passed   : ${ALL_PASSED}"
if [ "${ALL_PASSED}" = "true" ]; then
  echo "RESULT: PASS"; exit 0
else
  echo "RESULT: FAIL"; exit 1
fi
