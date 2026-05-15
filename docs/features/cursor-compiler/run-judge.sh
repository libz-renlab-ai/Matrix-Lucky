#!/usr/bin/env bash
# Judge harness: cursor compiler MVP verification
#
# Assertions:
#   1. vitest unit tests pass for cursor-compiler.test.ts
#   2. Functional integration: seed 3 fixture rules, compileCursorRules emits
#      a non-empty plain-text file containing text from each rule
#   3. Output file is plain text (first char is not '{' or '[')
#   4. File size: > 100 bytes and < 100KB
#
# Usage:
#   bash docs/features/cursor-compiler/run-judge.sh
#
# Output:
#   tmp/.judge/cursor/<run_id>/judge.json
#   tmp/.judge/cursor/<run_id>/verdict.txt

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/tmp/.judge/cursor/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== cursor-compiler judge harness run_id=${RUN_ID} ==="
cd "${REPO_ROOT}"

# ── Step 1: vitest unit tests ─────────────────────────────────────────────────
VITEST_JSON="${EVIDENCE_DIR}/vitest.json"
VITEST_EXIT=0
pnpm vitest run packages/core/src/compiler/__tests__/cursor-compiler.test.ts \
  --reporter=json --outputFile="${VITEST_JSON}" 2>>"${STDOUT_LOG}" || VITEST_EXIT=$?

VITEST_PASS=0
VITEST_FAIL=0
if [ -f "${VITEST_JSON}" ]; then
  VITEST_PASS=$(node -e "const d=JSON.parse(require('fs').readFileSync('${VITEST_JSON}','utf8')); console.log(d.numPassedTests ?? 0)")
  VITEST_FAIL=$(node -e "const d=JSON.parse(require('fs').readFileSync('${VITEST_JSON}','utf8')); console.log(d.numFailedTests ?? 0)")
fi
echo "[vitest] passed=${VITEST_PASS} failed=${VITEST_FAIL} exit=${VITEST_EXIT}"

# ── Step 2: functional integration — seed 3 rules + emit .cursorrules ─────────
# Write a small vitest-compatible integration script using tsx (project has tsx in dev deps)
# Write integration script inside packages/core so tsx resolves workspace packages
INTEGRATION_SCRIPT="${REPO_ROOT}/packages/core/cursor-harness-integration-$$.ts"
CURSORRULES_OUT="${EVIDENCE_DIR}/.cursorrules"

cat > "${INTEGRATION_SCRIPT}" <<'TSEOF'
import { compileCursorRules } from "@teamagent/core";
import type { KnowledgeEntry } from "@teamagent/types";
import { writeFileSync } from "fs";
import { argv } from "process";

const outPath = argv[2] ?? "/tmp/cursor-integration-out.cursorrules";

function mkEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "base", scope: { level: "team" }, category: "C", tags: [], type: "avoidance",
    nature: "objective", trigger: "base-trigger", wrong_pattern: "", correct_pattern: "base-correct",
    reasoning: "base-reason", confidence: 0.9, enforcement: "warn", status: "active",
    hit_count: 0, success_count: 0, override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-01-01T00:00:00Z", last_hit_at: "", last_validated_at: "",
    source: "accumulated", conflict_with: [], current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const, tier_entered_at: "", demerit: 0,
    demerit_last_updated: "", resurrect_count: 0,
    ...overrides,
  };
}

const fixtures: KnowledgeEntry[] = [
  mkEntry({
    id: "avoidance-hardcode-key",
    type: "avoidance",
    trigger: "hardcode-credentials",
    wrong_pattern: "WRONG_HARDCODE_SECRET_KEY",
    correct_pattern: "read from process.env.API_KEY",
    reasoning: "Hardcoded credentials get committed to version control",
  }),
  mkEntry({
    id: "practice-immutability",
    type: "practice",
    trigger: "prefer-immutability",
    wrong_pattern: "",
    correct_pattern: "CORRECT_USE_CONST_FREEZEOBJECT",
    reasoning: "Immutability prevents accidental mutation bugs at runtime",
  }),
  mkEntry({
    id: "reference-tdd",
    type: "practice",
    trigger: "test-driven-development",
    wrong_pattern: "",
    correct_pattern: "CORRECT_WRITE_TESTS_FIRST_TDD",
    reasoning: "TDD_REASON_TEST_DRIVEN_DEVELOPMENT_ENSURES_COVERAGE",
  }),
];

const output = compileCursorRules(fixtures);
writeFileSync(outPath, output, "utf8");
process.stdout.write(`integration_ok:true output_length:${output.length}\n`);
TSEOF

INTEGRATION_EXIT=0
INTEGRATION_OUT="${EVIDENCE_DIR}/integration.log"
# Run from REPO_ROOT so workspace package resolution works
node_modules/.bin/tsx "${INTEGRATION_SCRIPT}" "${CURSORRULES_OUT}" \
  > "${INTEGRATION_OUT}" 2>&1 || INTEGRATION_EXIT=$?
rm -f "${INTEGRATION_SCRIPT}"

echo "[integration] exit=${INTEGRATION_EXIT}"
cat "${INTEGRATION_OUT}"

# ── Step 3: mechanical assertions on emitted .cursorrules ─────────────────────
FILE_EXISTS=false
FILE_SIZE=0
FORMAT_IS_PLAIN_TEXT=false
R1_HIT=false
R2_HIT=false
R3_HIT=false

if [ -f "${CURSORRULES_OUT}" ]; then
  FILE_EXISTS=true
  FILE_SIZE="$(wc -c < "${CURSORRULES_OUT}" | tr -d ' ')"

  FIRST_CHAR="$(head -c 1 "${CURSORRULES_OUT}")"
  if [ "${FIRST_CHAR}" != "{" ] && [ "${FIRST_CHAR}" != "[" ]; then
    FORMAT_IS_PLAIN_TEXT=true
  fi

  grep -q "WRONG_HARDCODE_SECRET_KEY\|read from process.env.API_KEY\|Hardcoded credentials" \
    "${CURSORRULES_OUT}" && R1_HIT=true || true
  grep -q "CORRECT_USE_CONST_FREEZEOBJECT\|Immutability prevents" \
    "${CURSORRULES_OUT}" && R2_HIT=true || true
  grep -q "CORRECT_WRITE_TESTS_FIRST_TDD\|TDD_REASON_TEST_DRIVEN" \
    "${CURSORRULES_OUT}" && R3_HIT=true || true
fi

echo "[assertions] file_exists=${FILE_EXISTS} file_size=${FILE_SIZE}"
echo "[assertions] format_plain_text=${FORMAT_IS_PLAIN_TEXT}"
echo "[assertions] r1_hit=${R1_HIT} r2_hit=${R2_HIT} r3_hit=${R3_HIT}"

# ── Step 4: write judge.json ──────────────────────────────────────────────────
JUDGE_JSON="${EVIDENCE_DIR}/judge.json"
node -e "
const j = {
  run_id: '${RUN_ID}',
  exit_code: ${INTEGRATION_EXIT},
  vitest_passed: ${VITEST_PASS},
  vitest_failed: ${VITEST_FAIL},
  vitest_exit: ${VITEST_EXIT},
  file_exists: ${FILE_EXISTS},
  file_size_bytes: ${FILE_SIZE},
  rule_text_hits: [${R1_HIT}, ${R2_HIT}, ${R3_HIT}],
  format_is_plain_text: ${FORMAT_IS_PLAIN_TEXT},
  evidence_dir: '${EVIDENCE_DIR}',
  output_path: '${CURSORRULES_OUT}',
  stdout_path: '${STDOUT_LOG}',
};
require('fs').writeFileSync('${JUDGE_JSON}', JSON.stringify(j, null, 2) + '\n');
console.log(JSON.stringify(j, null, 2));
"

echo ""
echo "=== judge.json written to ${JUDGE_JSON} ==="

# ── Step 5: LLM verdict via claudefast ────────────────────────────────────────
VERDICT_FILE="${EVIDENCE_DIR}/verdict.txt"
JUDGE_PROMPT="Read this judge.json — PASS only if all 3 rule_text_hits true AND format_is_plain_text=true AND file_size_bytes > 100; else FAIL with which check failed. Output only PASS or FAIL:<reason>.

$(cat "${JUDGE_JSON}")"

echo "[verdict] calling claudefast for LLM verdict..."
echo "${JUDGE_PROMPT}" \
  | claudefast -p - \
  > "${VERDICT_FILE}" 2>"${EVIDENCE_DIR}/verdict.stderr.txt" || true

echo "[verdict] $(cat "${VERDICT_FILE}")"
echo ""
echo "=== DONE ==="
echo "evidence_dir : ${EVIDENCE_DIR}"
echo "judge.json   : ${JUDGE_JSON}"
echo "verdict.txt  : ${VERDICT_FILE}"
