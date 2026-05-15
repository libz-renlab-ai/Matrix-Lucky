#!/usr/bin/env bash
# Judge harness: tech-taste pure helper (packages/core/src/taste)
#
# Checks:
#   1. vitest passes for packages/core/src/taste/__tests__/tech-taste.test.ts
#   2. rankTechChoices ranks dayjs first for lightweight context
#   3. scoreTechChoice returns negative for matching weakness context
#
# Output: .judge/tech-taste/<run_id>/judge.json + verdict.txt

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/.judge/tech-taste/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== tech-taste judge harness run_id=${RUN_ID} ==="
cd "${REPO_ROOT}"

# 1. Run vitest
VITEST_EXIT=0
pnpm vitest run packages/core/src/taste/__tests__/tech-taste.test.ts \
  --reporter=json --outputFile="${EVIDENCE_DIR}/vitest.json" 2>&1 || VITEST_EXIT=$?

VITEST_PASS_COUNT=0
VITEST_FAIL_COUNT=0
if [ -f "${EVIDENCE_DIR}/vitest.json" ]; then
  VITEST_PASS_COUNT=$(node -e "const j=require('${EVIDENCE_DIR}/vitest.json'); console.log(j.numPassedTests ?? 0)" 2>/dev/null || echo 0)
  VITEST_FAIL_COUNT=$(node -e "const j=require('${EVIDENCE_DIR}/vitest.json'); console.log(j.numFailedTests ?? 0)" 2>/dev/null || echo 0)
fi

# 2. Mechanical check via tsx
TASTE_CHECK_EXIT=0
node --input-type=module <<'EOF' > "${EVIDENCE_DIR}/taste-check.json" 2>&1 || TASTE_CHECK_EXIT=$?
import { rankTechChoices, scoreTechChoice } from './packages/core/src/taste/tech-taste.js';
const dayjs = { name: 'dayjs', strengths: ['lightweight', 'immutable'], weaknesses: ['large-bundle'] };
const moment = { name: 'moment', strengths: ['legacy', 'mature'], weaknesses: ['large-bundle', 'mutable'] };
const ranked = rankTechChoices([moment, dayjs], 'lightweight immutable dates');
const weakScore = scoreTechChoice(dayjs, 'large-bundle legacy project');
const result = { first_name: ranked[0]?.name, weakness_score: weakScore };
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
EOF

FIRST_NAME="$(node -e "try{const j=require('${EVIDENCE_DIR}/taste-check.json');console.log(j.first_name||'')}catch(e){console.log('')}" 2>/dev/null || echo '')"
WEAKNESS_SCORE="$(node -e "try{const j=require('${EVIDENCE_DIR}/taste-check.json');console.log(j.weakness_score??0)}catch(e){console.log(0)}" 2>/dev/null || echo 0)"

VITEST_OK=false
[ "${VITEST_EXIT}" -eq 0 ] && VITEST_OK=true

RANK_OK=false
[ "${FIRST_NAME}" = "dayjs" ] && RANK_OK=true

WEAKNESS_OK=false
node -e "process.exit(parseInt('${WEAKNESS_SCORE}', 10) < 0 ? 0 : 1)" 2>/dev/null && WEAKNESS_OK=true || true

OVERALL_PASS=false
( $VITEST_OK && $RANK_OK && $WEAKNESS_OK ) && OVERALL_PASS=true

cat > "${EVIDENCE_DIR}/judge.json" <<ENDJSON
{
  "run_id": "${RUN_ID}",
  "exit_code": $([ "${OVERALL_PASS}" = "true" ] && echo 0 || echo 1),
  "vitest_pass_count": ${VITEST_PASS_COUNT},
  "vitest_fail_count": ${VITEST_FAIL_COUNT},
  "vitest_ok": ${VITEST_OK},
  "rank_first_name": "${FIRST_NAME}",
  "rank_ok": ${RANK_OK},
  "weakness_score": ${WEAKNESS_SCORE},
  "weakness_ok": ${WEAKNESS_OK},
  "overall_pass": ${OVERALL_PASS},
  "evidence_dir": "${EVIDENCE_DIR}",
  "stdout_path": "${STDOUT_LOG}"
}
ENDJSON

echo "=== Mechanical results ==="
echo "vitest_ok: ${VITEST_OK} (pass=${VITEST_PASS_COUNT}, fail=${VITEST_FAIL_COUNT})"
echo "rank_ok: ${RANK_OK} (first=${FIRST_NAME})"
echo "weakness_ok: ${WEAKNESS_OK} (score=${WEAKNESS_SCORE})"
echo "overall_pass: ${OVERALL_PASS}"
echo "judge.json: ${EVIDENCE_DIR}/judge.json"

if [ "${OVERALL_PASS}" = "true" ]; then
  echo "PASS" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 0
else
  echo "FAIL" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 1
fi
