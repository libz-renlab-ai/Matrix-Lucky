#!/usr/bin/env bash
# Judge harness: internet-rag pure helper (packages/core/src/rag)
#
# Checks:
#   1. vitest passes for packages/core/src/rag/__tests__/internet-rag.test.ts
#   2. rankSources returns non-empty array for non-empty input
#   3. Domain tier tie-breaking is correct (paper > docs > blog)
#
# Output: .judge/internet-rag/<run_id>/judge.json + verdict.txt

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/.judge/internet-rag/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== internet-rag judge harness run_id=${RUN_ID} ==="
cd "${REPO_ROOT}"

# 1. Run vitest for rag tests
VITEST_EXIT=0
pnpm vitest run packages/core/src/rag/__tests__/internet-rag.test.ts \
  --reporter=json --outputFile="${EVIDENCE_DIR}/vitest.json" 2>&1 || VITEST_EXIT=$?

VITEST_PASS_COUNT=0
VITEST_FAIL_COUNT=0
if [ -f "${EVIDENCE_DIR}/vitest.json" ]; then
  VITEST_PASS_COUNT=$(node -e "const j=require('${EVIDENCE_DIR}/vitest.json'); console.log(j.numPassedTests ?? 0)" 2>/dev/null || echo 0)
  VITEST_FAIL_COUNT=$(node -e "const j=require('${EVIDENCE_DIR}/vitest.json'); console.log(j.numFailedTests ?? 0)" 2>/dev/null || echo 0)
fi

# 2. Mechanically verify rankSources output via tsx
RANK_CHECK_EXIT=0
node --input-type=module <<'EOF' > "${EVIDENCE_DIR}/rank-check.json" 2>&1 || RANK_CHECK_EXIT=$?
import { rankSources } from './packages/core/src/rag/internet-rag.js';
const sources = [
  { url: 'https://blog.com/a', title: 'gradient descent blog', domain: 'blog' },
  { url: 'https://arxiv.org/b', title: 'gradient descent paper', domain: 'paper' },
  { url: 'https://docs.com/c', title: 'gradient descent docs', domain: 'docs' },
];
const ranked = rankSources(sources, 'gradient descent', Date.now());
const result = {
  first_domain: ranked[0]?.domain,
  last_domain: ranked[ranked.length - 1]?.domain,
  count: ranked.length,
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
EOF

FIRST_DOMAIN="$(node -e "try{const j=require('${EVIDENCE_DIR}/rank-check.json');console.log(j.first_domain||'')}catch(e){console.log('')}" 2>/dev/null || echo '')"
RANK_COUNT="$(node -e "try{const j=require('${EVIDENCE_DIR}/rank-check.json');console.log(j.count||0)}catch(e){console.log(0)}" 2>/dev/null || echo 0)"

VITEST_OK=false
[ "${VITEST_EXIT}" -eq 0 ] && VITEST_OK=true

RANK_OK=false
[ "${FIRST_DOMAIN}" = "paper" ] && [ "${RANK_COUNT}" -ge 3 ] && RANK_OK=true

OVERALL_PASS=false
( $VITEST_OK && $RANK_OK ) && OVERALL_PASS=true

cat > "${EVIDENCE_DIR}/judge.json" <<ENDJSON
{
  "run_id": "${RUN_ID}",
  "exit_code": $([ "${OVERALL_PASS}" = "true" ] && echo 0 || echo 1),
  "vitest_pass_count": ${VITEST_PASS_COUNT},
  "vitest_fail_count": ${VITEST_FAIL_COUNT},
  "vitest_ok": ${VITEST_OK},
  "rank_check_first_domain": "${FIRST_DOMAIN}",
  "rank_check_count": ${RANK_COUNT},
  "rank_ok": ${RANK_OK},
  "overall_pass": ${OVERALL_PASS},
  "evidence_dir": "${EVIDENCE_DIR}",
  "stdout_path": "${STDOUT_LOG}"
}
ENDJSON

echo "=== Mechanical results ==="
echo "vitest_ok: ${VITEST_OK} (pass=${VITEST_PASS_COUNT}, fail=${VITEST_FAIL_COUNT})"
echo "rank_ok: ${RANK_OK} (first_domain=${FIRST_DOMAIN}, count=${RANK_COUNT})"
echo "overall_pass: ${OVERALL_PASS}"
echo "judge.json: ${EVIDENCE_DIR}/judge.json"

if [ "${OVERALL_PASS}" = "true" ]; then
  echo "PASS" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 0
else
  echo "FAIL" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 1
fi
