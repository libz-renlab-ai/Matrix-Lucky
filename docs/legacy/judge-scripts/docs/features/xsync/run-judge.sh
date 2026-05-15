#!/usr/bin/env bash
# Third-party judge harness: cross-machine git-sync e2e
#
# Tests that `teamagent sync push|pull` correctly transfers team rules
# between two isolated machine directories via a bare git remote.
#
# Workflow:
#   1. Init a bare git repo as "remote" storage
#   2. Machine-A seeds 5 team-scope rules (with confidence + demerit + reasoning)
#   3. Machine-A runs `teamagent sync push --remote <bare>` → commits+pushes bundle
#   4. Machine-B runs `teamagent sync pull --remote <bare>` → clones+imports rules
#   5. Assert Machine-B has all 5 rules with exact metadata match
#
# Output:
#   tmp/.judge/xsync/<run_id>/judge.json   — {rules_a, rules_b, metadata_match, push_ms, pull_ms, pass}
#   tmp/.judge/xsync/<run_id>/stdout.log
#
# Usage:
#   bash docs/features/xsync/run-judge.sh
#
# Prerequisites:
#   pnpm install

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/tmp/.judge/xsync/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== cross-machine git-sync e2e harness run_id=${RUN_ID} ==="
echo "evidence_dir: ${EVIDENCE_DIR}"

TSX="${REPO_ROOT}/node_modules/.bin/tsx"
BIN="${REPO_ROOT}/packages/cli/src/bin.ts"

# ── Isolated working directories ────────────────────────────────────────────────
WORK_DIR="${EVIDENCE_DIR}/work"
REMOTE_GIT="${WORK_DIR}/remote.git"
MACHINE_A="${WORK_DIR}/machine-a"
MACHINE_A_HOME="${WORK_DIR}/home-a"
MACHINE_B="${WORK_DIR}/machine-b"
MACHINE_B_HOME="${WORK_DIR}/home-b"

mkdir -p "${REMOTE_GIT}" "${MACHINE_A}" "${MACHINE_A_HOME}" "${MACHINE_B}" "${MACHINE_B_HOME}"

# Init bare remote repo
git init --bare "${REMOTE_GIT}" >/dev/null 2>&1
echo "Initialized bare remote repo at ${REMOTE_GIT}"

# ── Seed 5 team-scope rules in Machine-A ────────────────────────────────────────
echo ""
echo "── Seeding Machine-A rules ───────────────────────────────────────────────"

mkdir -p "${MACHINE_A}/.teamagent" "${MACHINE_A_HOME}/.teamagent"

"${TSX}" -e "
import { DualLayerStore } from '${REPO_ROOT}/packages/adapters/src/index.ts';

const store = new DualLayerStore({
  projectDbPath: '${MACHINE_A}/.teamagent/knowledge.db',
  userGlobalDbPath: '${MACHINE_A_HOME}/.teamagent/global.db',
});

const base: any = {
  scope: { level: 'team' },
  category: 'C',
  tags: ['team'],
  type: 'avoidance',
  nature: 'objective',
  wrong_pattern: 'axios',
  correct_pattern: 'fetch',
  enforcement: 'warn',
  status: 'active',
  hit_count: 0,
  success_count: 0,
  override_count: 0,
  evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
  created_at: '2026-05-01T00:00:00Z',
  last_hit_at: '',
  last_validated_at: '',
  source: 'accumulated',
  conflict_with: [],
  current_tier: 'probation',
  max_tier_ever: 'probation',
  tier_entered_at: '2026-05-01T00:00:00Z',
  demerit_last_updated: '2026-05-01T00:00:00Z',
  resurrect_count: 0,
};

const rules = [
  { ...base, id: 'xsync-rule-01', trigger: 'use team fetch', confidence: 0.91, demerit: 0.10, reasoning: 'native fetch preferred over axios' },
  { ...base, id: 'xsync-rule-02', trigger: 'use type guard', confidence: 0.85, demerit: 0.05, reasoning: 'type guards prevent runtime errors' },
  { ...base, id: 'xsync-rule-03', trigger: 'avoid console log in core', confidence: 0.78, demerit: 0.20, reasoning: 'use attribution bus for structured output' },
  { ...base, id: 'xsync-rule-04', trigger: 'inject time dependency', confidence: 0.92, demerit: 0.08, reasoning: 'pure functions require injected now for testability' },
  { ...base, id: 'xsync-rule-05', trigger: 'small commit rule', confidence: 0.88, demerit: 0.12, reasoning: 'each commit should cover one conceptually complete unit' },
];

for (const r of rules) store.add(r as any);
store.close();
process.stdout.write('Seeded 5 rules in machine-a\n');
" 2>&1

# ── Read Machine-A rules for later comparison ───────────────────────────────────
RULES_A_FILE="${EVIDENCE_DIR}/rules_a.json"
"${TSX}" -e "
import { DualLayerStore } from '${REPO_ROOT}/packages/adapters/src/index.ts';
const store = new DualLayerStore({
  projectDbPath: '${MACHINE_A}/.teamagent/knowledge.db',
  userGlobalDbPath: '${MACHINE_A_HOME}/.teamagent/global.db',
});
const entries = store.findByScopeLevel('team');
store.close();
const slim = entries.map(e => ({
  id: e.id, confidence: (e as any).confidence, demerit: (e as any).demerit, reasoning: (e as any).reasoning
}));
process.stdout.write(JSON.stringify(slim, null, 2));
" > "${RULES_A_FILE}" 2>/dev/null

RULES_A_COUNT=$(python3 -c "import json; print(len(json.load(open('${RULES_A_FILE}'))))")
echo "rules_a count: ${RULES_A_COUNT}"

if [ "${RULES_A_COUNT}" -ne 5 ]; then
  echo "FAIL: expected 5 rules in machine-a, got ${RULES_A_COUNT}"
  python3 -c "
import json
result = {'run_id': '${RUN_ID}', 'rules_a': [], 'rules_b': [],
  'metadata_match': False, 'push_ms': 0, 'pull_ms': 0, 'pass': False,
  'error': 'Seed failed: expected 5 rules in machine-a, got ${RULES_A_COUNT}'}
print(json.dumps(result, indent=2))
" > "${EVIDENCE_DIR}/judge.json"
  cat "${EVIDENCE_DIR}/judge.json"
  exit 1
fi

# ── Machine-A: teamagent sync push ──────────────────────────────────────────────
echo ""
echo "── Machine-A: teamagent sync push ────────────────────────────────────────"
PUSH_START=$(python3 -c "import time; print(int(time.time()*1000))")

PUSH_LOG="${EVIDENCE_DIR}/push.log"
PUSH_EXIT=0
HOME="${MACHINE_A_HOME}" "${TSX}" "${BIN}" sync push \
  --remote "${REMOTE_GIT}" \
  --cwd "${MACHINE_A}" \
  2>&1 | tee "${PUSH_LOG}" || PUSH_EXIT=$?

PUSH_END=$(python3 -c "import time; print(int(time.time()*1000))")
PUSH_MS=$((PUSH_END - PUSH_START))
echo "push exit=${PUSH_EXIT} duration=${PUSH_MS}ms"

if [ "${PUSH_EXIT}" -ne 0 ]; then
  echo "FAIL: sync push exited with ${PUSH_EXIT}"
  python3 -c "
import json
rules_a = json.load(open('${RULES_A_FILE}'))
result = {'run_id': '${RUN_ID}', 'rules_a': rules_a, 'rules_b': [],
  'metadata_match': False, 'push_ms': ${PUSH_MS}, 'pull_ms': 0, 'pass': False,
  'error': 'sync push failed with exit ${PUSH_EXIT}'}
print(json.dumps(result, indent=2))
" > "${EVIDENCE_DIR}/judge.json"
  cat "${EVIDENCE_DIR}/judge.json"
  exit 1
fi

# Confirm bundle was created
BUNDLE_PATH="${MACHINE_A}/.teamagent/team-rules.json"
if [ ! -f "${BUNDLE_PATH}" ]; then
  echo "FAIL: expected bundle at ${BUNDLE_PATH}"
  exit 1
fi
echo "Bundle exists: ${BUNDLE_PATH}"
python3 -c "
import json
d = json.load(open('${BUNDLE_PATH}'))
print(f'  schema_version={d[\"schema_version\"]} entries={len(d[\"entries\"])}')
"

# ── Machine-B: teamagent sync pull ──────────────────────────────────────────────
echo ""
echo "── Machine-B: teamagent sync pull ────────────────────────────────────────"
PULL_START=$(python3 -c "import time; print(int(time.time()*1000))")

PULL_LOG="${EVIDENCE_DIR}/pull.log"
PULL_EXIT=0
HOME="${MACHINE_B_HOME}" "${TSX}" "${BIN}" sync pull \
  --remote "${REMOTE_GIT}" \
  --cwd "${MACHINE_B}" \
  2>&1 | tee "${PULL_LOG}" || PULL_EXIT=$?

PULL_END=$(python3 -c "import time; print(int(time.time()*1000))")
PULL_MS=$((PULL_END - PULL_START))
echo "pull exit=${PULL_EXIT} duration=${PULL_MS}ms"

if [ "${PULL_EXIT}" -ne 0 ]; then
  echo "FAIL: sync pull exited with ${PULL_EXIT}"
  python3 -c "
import json
rules_a = json.load(open('${RULES_A_FILE}'))
result = {'run_id': '${RUN_ID}', 'rules_a': rules_a, 'rules_b': [],
  'metadata_match': False, 'push_ms': ${PUSH_MS}, 'pull_ms': ${PULL_MS}, 'pass': False,
  'error': 'sync pull failed with exit ${PULL_EXIT}'}
print(json.dumps(result, indent=2))
" > "${EVIDENCE_DIR}/judge.json"
  cat "${EVIDENCE_DIR}/judge.json"
  exit 1
fi

# ── Read Machine-B rules ─────────────────────────────────────────────────────────
echo ""
echo "── Verifying Machine-B rules ─────────────────────────────────────────────"
RULES_B_FILE="${EVIDENCE_DIR}/rules_b.json"
"${TSX}" -e "
import { DualLayerStore } from '${REPO_ROOT}/packages/adapters/src/index.ts';
const store = new DualLayerStore({
  projectDbPath: '${MACHINE_B}/.teamagent/knowledge.db',
  userGlobalDbPath: '${MACHINE_B_HOME}/.teamagent/global.db',
});
const entries = store.findByScopeLevel('team');
store.close();
const slim = entries.map(e => ({
  id: e.id, confidence: (e as any).confidence, demerit: (e as any).demerit, reasoning: (e as any).reasoning
}));
process.stdout.write(JSON.stringify(slim, null, 2));
" > "${RULES_B_FILE}" 2>/dev/null

RULES_B_COUNT=$(python3 -c "import json; print(len(json.load(open('${RULES_B_FILE}'))))")
echo "rules_b count: ${RULES_B_COUNT}"
cat "${RULES_B_FILE}"

# ── Metadata comparison ──────────────────────────────────────────────────────────
METADATA_RESULT="${EVIDENCE_DIR}/metadata_compare.txt"
python3 <<PYEOF > "${METADATA_RESULT}" 2>&1
import json, sys

rules_a = json.load(open('${RULES_A_FILE}'))
rules_b = json.load(open('${RULES_B_FILE}'))

a_map = {r['id']: r for r in rules_a}
b_map = {r['id']: r for r in rules_b}

mismatches = []
for id, a in a_map.items():
    if id not in b_map:
        mismatches.append(f"{id}: missing in B")
        continue
    b = b_map[id]
    if abs(a['confidence'] - b['confidence']) > 0.001:
        mismatches.append(f"{id}: confidence {a['confidence']} != {b['confidence']}")
    if abs(a['demerit'] - b['demerit']) > 0.001:
        mismatches.append(f"{id}: demerit {a['demerit']} != {b['demerit']}")
    if a['reasoning'] != b['reasoning']:
        mismatches.append(f"{id}: reasoning '{a['reasoning']}' != '{b['reasoning']}'")

if mismatches:
    print("MISMATCH")
    for m in mismatches:
        print(f"  {m}")
else:
    print("MATCH")
PYEOF

cat "${METADATA_RESULT}"
METADATA_MATCH_LINE=$(head -1 "${METADATA_RESULT}")
if [ "${METADATA_MATCH_LINE}" = "MATCH" ]; then
  METADATA_MATCH_BOOL="true"
else
  METADATA_MATCH_BOOL="false"
fi
echo "metadata_match: ${METADATA_MATCH_BOOL}"

# ── Write judge.json ─────────────────────────────────────────────────────────────
echo ""
echo "── Writing judge.json ────────────────────────────────────────────────────"

PASS="false"
if [ "${RULES_B_COUNT}" -eq 5 ] && [ "${METADATA_MATCH_BOOL}" = "true" ]; then
  PASS="true"
fi

python3 - "${RULES_A_FILE}" "${RULES_B_FILE}" "${RUN_ID}" "${EVIDENCE_DIR}" "${METADATA_MATCH_BOOL}" "${PUSH_MS}" "${PULL_MS}" "${PASS}" > "${EVIDENCE_DIR}/judge.json" <<'PYEOF'
import json, sys

rules_a_file, rules_b_file, run_id, evidence_dir, metadata_match_str, push_ms_str, pull_ms_str, pass_str = sys.argv[1:]

rules_a = json.load(open(rules_a_file))
rules_b = json.load(open(rules_b_file))

result = {
    "run_id": run_id,
    "evidence_dir": evidence_dir,
    "rules_a": rules_a,
    "rules_b": rules_b,
    "metadata_match": metadata_match_str == "true",
    "push_ms": int(push_ms_str),
    "pull_ms": int(pull_ms_str),
    "pass": pass_str == "true",
}
print(json.dumps(result, indent=2))
PYEOF

cat "${EVIDENCE_DIR}/judge.json"

echo ""
if [ "${PASS}" = "true" ]; then
  echo "=== PASS: cross-machine git-sync e2e harness completed successfully ==="
else
  echo "=== FAIL: cross-machine git-sync e2e harness failed ==="
  echo "  rules_a=${RULES_A_COUNT} rules_b=${RULES_B_COUNT} metadata_match=${METADATA_MATCH_BOOL}"
  exit 1
fi
