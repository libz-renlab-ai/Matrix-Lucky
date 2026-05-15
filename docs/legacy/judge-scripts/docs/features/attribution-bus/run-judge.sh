#!/usr/bin/env bash
# Judge harness: attribution bus (packages/adapters/src/attribution)
#
# Checks:
#   1. vitest passes for attribution tests (in-memory-bus + stdout-renderer)
#   2. InMemoryAttributionBus.emit → drain cycle returns all emitted events
#   3. Subscribe/unsubscribe works (no events after unsub)
#
# Output: .judge/attribution-bus/<run_id>/judge.json + verdict.txt

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/.judge/attribution-bus/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== attribution-bus judge harness run_id=${RUN_ID} ==="
cd "${REPO_ROOT}"

# 1. Run vitest for attribution adapter tests
VITEST_EXIT=0
pnpm vitest run \
  packages/adapters/src/attribution/__tests__/in-memory-bus.test.ts \
  packages/adapters/src/attribution/__tests__/stdout-renderer.test.ts \
  --reporter=json --outputFile="${EVIDENCE_DIR}/vitest.json" 2>&1 || VITEST_EXIT=$?

VITEST_PASS_COUNT=0
VITEST_FAIL_COUNT=0
if [ -f "${EVIDENCE_DIR}/vitest.json" ]; then
  VITEST_PASS_COUNT=$(node -e "const j=require('${EVIDENCE_DIR}/vitest.json'); console.log(j.numPassedTests ?? 0)" 2>/dev/null || echo 0)
  VITEST_FAIL_COUNT=$(node -e "const j=require('${EVIDENCE_DIR}/vitest.json'); console.log(j.numFailedTests ?? 0)" 2>/dev/null || echo 0)
fi

# 2. Mechanical emit/drain/subscribe check via tsx
BUS_CHECK_EXIT=0
node --input-type=module <<'EOF' > "${EVIDENCE_DIR}/bus-check.json" 2>&1 || BUS_CHECK_EXIT=$?
import { InMemoryAttributionBus } from './packages/adapters/src/attribution/in-memory-bus.js';
const bus = new InMemoryAttributionBus();

// emit + drain
const evt = { type: 'rule_applied', ruleId: 'r1', sessionId: 's1', timestamp: Date.now() };
bus.emit(evt);
const drained = bus.drain();

// subscribe/unsubscribe
let subCount = 0;
const unsub = bus.subscribe(() => { subCount++; });
bus.emit(evt);
unsub();
bus.emit(evt);

const result = {
  drain_count: drained.length,
  drain_first_rule_id: drained[0]?.ruleId,
  sub_count_before_unsub: subCount,
  buf_after_drain: bus.drain().length,
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
EOF

DRAIN_COUNT="$(node -e "try{const j=require('${EVIDENCE_DIR}/bus-check.json');console.log(j.drain_count??-1)}catch(e){console.log(-1)}" 2>/dev/null || echo -1)"
SUB_COUNT="$(node -e "try{const j=require('${EVIDENCE_DIR}/bus-check.json');console.log(j.sub_count_before_unsub??-1)}catch(e){console.log(-1)}" 2>/dev/null || echo -1)"
BUF_AFTER="$(node -e "try{const j=require('${EVIDENCE_DIR}/bus-check.json');console.log(j.buf_after_drain??-1)}catch(e){console.log(-1)}" 2>/dev/null || echo -1)"

VITEST_OK=false
[ "${VITEST_EXIT}" -eq 0 ] && VITEST_OK=true

BUS_OK=false
[ "${DRAIN_COUNT}" -eq 1 ] && [ "${SUB_COUNT}" -eq 1 ] && [ "${BUF_AFTER}" -eq 2 ] && BUS_OK=true

OVERALL_PASS=false
( $VITEST_OK && $BUS_OK ) && OVERALL_PASS=true

cat > "${EVIDENCE_DIR}/judge.json" <<ENDJSON
{
  "run_id": "${RUN_ID}",
  "exit_code": $([ "${OVERALL_PASS}" = "true" ] && echo 0 || echo 1),
  "vitest_pass_count": ${VITEST_PASS_COUNT},
  "vitest_fail_count": ${VITEST_FAIL_COUNT},
  "vitest_ok": ${VITEST_OK},
  "drain_count": ${DRAIN_COUNT},
  "sub_count_before_unsub": ${SUB_COUNT},
  "buf_after_drain": ${BUF_AFTER},
  "bus_ok": ${BUS_OK},
  "overall_pass": ${OVERALL_PASS},
  "evidence_dir": "${EVIDENCE_DIR}",
  "stdout_path": "${STDOUT_LOG}"
}
ENDJSON

echo "=== Mechanical results ==="
echo "vitest_ok: ${VITEST_OK} (pass=${VITEST_PASS_COUNT}, fail=${VITEST_FAIL_COUNT})"
echo "bus_ok: ${BUS_OK} (drain_count=${DRAIN_COUNT}, sub_count=${SUB_COUNT}, buf_after_drain=${BUF_AFTER})"
echo "overall_pass: ${OVERALL_PASS}"
echo "judge.json: ${EVIDENCE_DIR}/judge.json"

if [ "${OVERALL_PASS}" = "true" ]; then
  echo "PASS" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 0
else
  echo "FAIL" | tee "${EVIDENCE_DIR}/verdict.txt"
  exit 1
fi
