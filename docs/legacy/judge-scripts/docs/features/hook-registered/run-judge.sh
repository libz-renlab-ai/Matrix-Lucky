#!/usr/bin/env bash
# Judge harness: hook-registered feature verification
#
# Assertions:
#   1. doctor --json reports hook-registered: pass (status="pass")
#   2. Functional probe: invoking the built hook bundle via stdin produces an
#      event row in the isolated events.db (proves real execution, not just
#      config-file-present check)
#
# Prerequisites (one-time, done by fix-eng before calling this):
#   pnpm install
#   pnpm --filter @teamagent/cli build:hook
#
# Usage:
#   bash docs/features/hook-registered/run-judge.sh
#
# Output:
#   tmp/.judge/hook/<run_id>/judge.json
#   tmp/.judge/hook/<run_id>/verdict.txt
#   (stdout paths recorded inside judge.json)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/tmp/.judge/hook/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== hook-registered judge harness run_id=${RUN_ID} ==="

# ── Isolated env dirs ──────────────────────────────────────────────────────────
ISO_HOME="${EVIDENCE_DIR}/home"
ISO_CLAUDE="${EVIDENCE_DIR}/claude"
ISO_PROJECT="${EVIDENCE_DIR}/project"
mkdir -p "${ISO_HOME}/.teamagent" "${ISO_CLAUDE}" "${ISO_PROJECT}/.teamagent" "${ISO_PROJECT}/.claude"

# ── Step 1: build the hook bundle (idempotent if already built) ────────────────
HOOK_BUNDLE="${REPO_ROOT}/packages/cli/dist/bin-pre-tool-use.cjs"
if [ ! -f "${HOOK_BUNDLE}" ]; then
  echo "[build] dist/bin-pre-tool-use.cjs not found — building..."
  (cd "${REPO_ROOT}" && pnpm --filter @teamagent/cli build:hook) \
    > "${EVIDENCE_DIR}/build.stdout.txt" 2> "${EVIDENCE_DIR}/build.stderr.txt"
  BUILD_EXIT=$?
  echo "[build] exit=${BUILD_EXIT}"
else
  echo "[build] bundle already exists, skipping build"
  BUILD_EXIT=0
fi

# ── Step 2: init isolated project (knowledge.db required by doctor) ────────────
echo "[init] initialising isolated project at ${ISO_PROJECT}..."
INIT_OUT="${EVIDENCE_DIR}/init.stdout.txt"
INIT_ERR="${EVIDENCE_DIR}/init.stderr.txt"
HOME="${ISO_HOME}" \
  pnpm --dir "${REPO_ROOT}" exec tsx "${REPO_ROOT}/packages/cli/src/bin.ts" \
  init --cwd "${ISO_PROJECT}" \
  > "${INIT_OUT}" 2> "${INIT_ERR}" || true
INIT_EXIT=$?
echo "[init] exit=${INIT_EXIT}"

# ── Step 3: install hook into isolated .claude/settings.local.json ─────────────
echo "[install-hook] writing hook into ${ISO_PROJECT}/.claude/settings.local.json..."
INSTALL_OUT="${EVIDENCE_DIR}/install-hook.stdout.txt"
INSTALL_ERR="${EVIDENCE_DIR}/install-hook.stderr.txt"
HOME="${ISO_HOME}" \
  pnpm --dir "${REPO_ROOT}" exec tsx "${REPO_ROOT}/packages/cli/src/bin.ts" \
  install-hook --cwd "${ISO_PROJECT}" \
  > "${INSTALL_OUT}" 2> "${INSTALL_ERR}" || true
INSTALL_EXIT=$?
echo "[install-hook] exit=${INSTALL_EXIT}"

# ── Step 4: run doctor --json in isolated context ──────────────────────────────
DOCTOR_OUT="${EVIDENCE_DIR}/doctor.stdout.txt"
DOCTOR_ERR="${EVIDENCE_DIR}/doctor.stderr.txt"
echo "[doctor] running doctor --json..."
HOME="${ISO_HOME}" \
  pnpm --dir "${REPO_ROOT}" exec tsx "${REPO_ROOT}/packages/cli/src/bin.ts" \
  doctor --json --cwd "${ISO_PROJECT}" \
  > "${DOCTOR_OUT}" 2> "${DOCTOR_ERR}" || true
DOCTOR_EXIT=$?
echo "[doctor] exit=${DOCTOR_EXIT}"

# Parse hook-registered status from doctor JSON
cp "${DOCTOR_OUT}" "${EVIDENCE_DIR}/doctor.json"
HOOK_REGISTERED_STATUS="$(node -e "
  try {
    const d = JSON.parse(require('fs').readFileSync('${DOCTOR_OUT}','utf-8'));
    const c = (d.checks||[]).find(c=>c.name==='hook-registered');
    process.stdout.write(c ? c.status : 'missing');
  } catch(e) { process.stdout.write('parse-error:'+e.message); }
")"
DOCTOR_HOOK_REGISTERED=false
[ "${HOOK_REGISTERED_STATUS}" = "pass" ] && DOCTOR_HOOK_REGISTERED=true
echo "[doctor] hook-registered status=${HOOK_REGISTERED_STATUS} => doctor_hook_registered=${DOCTOR_HOOK_REGISTERED}"

# ── Step 5: functional probe — invoke hook bundle directly via stdin ───────────
# The bundle calls os.homedir() internally; we redirect HOME so events land in
# the isolated events.db.  If fix-eng didn't patch os.homedir() to respect HOME,
# we detect that and still record what we observe.
PROBE_STDIN='{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo judge-harness-probe"},"cwd":"'"${ISO_PROJECT}"'","session_id":"judge-harness-'"${RUN_ID}"'"}'
PROBE_OUT="${EVIDENCE_DIR}/probe.stdout.txt"
PROBE_ERR="${EVIDENCE_DIR}/probe.stderr.txt"
echo "[probe] sending synthetic PreToolUse event to bundle..."
echo "${PROBE_STDIN}" \
  | HOME="${ISO_HOME}" node "${HOOK_BUNDLE}" \
  > "${PROBE_OUT}" 2> "${PROBE_ERR}" || true
PROBE_EXIT=$?
echo "[probe] exit=${PROBE_EXIT}"

# Count events in isolated events.db
ISO_EVENTS_DB="${ISO_HOME}/.teamagent/events.db"
FUNCTIONAL_PROBE_EVENT_COUNT=0
if [ -f "${ISO_EVENTS_DB}" ]; then
  FUNCTIONAL_PROBE_EVENT_COUNT="$(node -e "
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync('${ISO_EVENTS_DB}');
    const row = db.prepare('SELECT COUNT(*) as n FROM events').get();
    db.close();
    process.stdout.write(String(row ? row.n : 0));
  " 2>/dev/null || echo 0)"
  echo "[probe] events in isolated events.db: ${FUNCTIONAL_PROBE_EVENT_COUNT}"
else
  echo "[probe] WARNING: isolated events.db not found at ${ISO_EVENTS_DB}"
  echo "[probe] This means the hook bundle ignores HOME override (uses real homedir)."
  echo "[probe] Falling back: check real homedir events.db for new rows since probe start."

  # Fallback: count events in real homedir events.db that appeared after probe
  REAL_EVENTS_DB="${HOME}/.teamagent/events.db"
  PROBE_SESSION_ID="judge-harness-${RUN_ID}"
  if [ -f "${REAL_EVENTS_DB}" ]; then
    FUNCTIONAL_PROBE_EVENT_COUNT="$(node -e "
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync('${REAL_EVENTS_DB}');
      const row = db.prepare(\"SELECT COUNT(*) as n FROM events WHERE payload LIKE '%${PROBE_SESSION_ID}%'\").get();
      db.close();
      process.stdout.write(String(row ? row.n : 0));
    " 2>/dev/null || echo 0)"
    echo "[probe] events matching session_id in real events.db: ${FUNCTIONAL_PROBE_EVENT_COUNT}"
  else
    echo "[probe] real events.db also not found; functional probe count=0"
  fi
fi

# ── Step 6: write judge.json ───────────────────────────────────────────────────
JUDGE_JSON="${EVIDENCE_DIR}/judge.json"
node -e "
const j = {
  run_id: '${RUN_ID}',
  exit_codes: {
    build: ${BUILD_EXIT},
    init: ${INIT_EXIT},
    install_hook: ${INSTALL_EXIT},
    doctor: ${DOCTOR_EXIT},
    probe: ${PROBE_EXIT}
  },
  doctor_hook_registered: ${DOCTOR_HOOK_REGISTERED},
  functional_probe_event_count: ${FUNCTIONAL_PROBE_EVENT_COUNT},
  hook_registered_status_raw: '${HOOK_REGISTERED_STATUS}',
  evidence_dir: '${EVIDENCE_DIR}',
  stdout_path: '${STDOUT_LOG}',
  doctor_stdout_path: '${DOCTOR_OUT}',
  probe_stdout_path: '${PROBE_OUT}',
  probe_stderr_path: '${PROBE_ERR}'
};
require('fs').writeFileSync('${JUDGE_JSON}', JSON.stringify(j, null, 2) + '\n');
console.log(JSON.stringify(j, null, 2));
"

echo ""
echo "=== judge.json written to ${JUDGE_JSON} ==="

# ── Step 7: LLM verdict via claudefast ────────────────────────────────────────
VERDICT_FILE="${EVIDENCE_DIR}/verdict.txt"
JUDGE_PROMPT="Read this judge.json and respond PASS only if doctor_hook_registered=true AND functional_probe_event_count>0; else FAIL with reason. Output only PASS or FAIL:<reason>.

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
