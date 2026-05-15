#!/usr/bin/env bash
# verify-postinstall-detached.sh — judge harness for ADR 0001 two-stage install.
#
# Runs packages/teamagent/postinstall.mjs against a temp HOME with a stubbed
# dist/bin.js so the integration is hermetic (no model download). Emits raw
# stdout/stderr + JSON metrics so an LLM judge can rule PASS/FAIL from
# .judge/<run_id>/ without reading the source.
#
# Pass criteria (see docs/plans/2026-05-07-fix-install/plan.md §3):
#   1. default-mode wall-clock <= 30s
#   2. ~/.teamagent/.warmup-state.json present, status=="downloading", pid==0
#   3. foreground-mode still works (TEAMAGENT_FOREGROUND_WARMUP=1)
#   4. skip-mode still works (TEAMAGENT_SKIP_WARMUP=1)
set -eu
cd "$(dirname "$0")/.."

WORKTREE=$(pwd)
RUN_ID="${RUN_ID:-$(date +%s)}"
JUDGE_DIR=".judge/${RUN_ID}"
EVIDENCE_DIR="${JUDGE_DIR}/evidence"
mkdir -p "${EVIDENCE_DIR}"

# 1) Stub bin.js — exits 0 for every subcommand; covers doctor / install-user-hook /
#    warmup so the parent's branches all see a clean child.
DIST_DIR="${WORKTREE}/packages/teamagent/dist"
STUB_CREATED=0
if [ ! -f "${DIST_DIR}/bin.js" ]; then
  mkdir -p "${DIST_DIR}"
  cat > "${DIST_DIR}/bin.js" <<'STUB_EOF'
#!/usr/bin/env node
// hermetic stub: exits 0 for any subcommand
process.exit(0);
STUB_EOF
  chmod +x "${DIST_DIR}/bin.js"
  STUB_CREATED=1
fi

run_one() {
  local label="$1"; shift
  local tmphome
  tmphome=$(mktemp -d)
  local stdout="${EVIDENCE_DIR}/${label}.stdout"
  local stderr="${EVIDENCE_DIR}/${label}.stderr"
  local timing="${EVIDENCE_DIR}/${label}.time"
  local statefile="${tmphome}/.teamagent/.warmup-state.json"
  local exit_code=0

  # /usr/bin/time -p prints "real <s>" to stderr; capture separately.
  HOME="${tmphome}" "$@" /usr/bin/time -p \
    node "${WORKTREE}/packages/teamagent/postinstall.mjs" \
    >"${stdout}" 2>"${stderr}.raw" || exit_code=$?

  # Pull all three POSIX time -p lines (real/user/sys) into timing file;
  # leave everything else (postinstall output) in stderr proper.
  awk '/^real |^user |^sys /{print; next} {print > "/dev/stderr"}' "${stderr}.raw" \
    1>"${timing}" 2>"${stderr}"
  rm -f "${stderr}.raw"

  local wall_s
  wall_s=$(awk '/^real /{print $2}' "${timing}" | head -1)

  # State file snapshot
  local state_status="<absent>"
  local state_pid="<absent>"
  if [ -f "${statefile}" ]; then
    state_status=$(node -e "console.log((JSON.parse(require('fs').readFileSync('${statefile}','utf8')).status)||'<missing>')" 2>/dev/null || echo "<parse-err>")
    state_pid=$(node -e "console.log((JSON.parse(require('fs').readFileSync('${statefile}','utf8')).pid)??'<missing>')" 2>/dev/null || echo "<parse-err>")
    cp "${statefile}" "${EVIDENCE_DIR}/${label}.warmup-state.json"
  fi

  cat > "${JUDGE_DIR}/${label}.json" <<JSON_EOF
{
  "label": "${label}",
  "exit_code": ${exit_code},
  "wallclock_s": "${wall_s:-null}",
  "warmup_state_status": "${state_status}",
  "warmup_state_pid": "${state_pid}",
  "stdout_path": "${EVIDENCE_DIR}/${label}.stdout",
  "stderr_path": "${EVIDENCE_DIR}/${label}.stderr",
  "timing_path": "${EVIDENCE_DIR}/${label}.time"
}
JSON_EOF

  rm -rf "${tmphome}"
}

# Path 1: default detached
run_one "01-default-detached" env

# Path 2: TEAMAGENT_FOREGROUND_WARMUP=1 (synchronous; stub exits 0 immediately)
run_one "02-foreground" env TEAMAGENT_FOREGROUND_WARMUP=1

# Path 3: TEAMAGENT_SKIP_WARMUP=1
run_one "03-skip" env TEAMAGENT_SKIP_WARMUP=1

# Cleanup stub if we created it
if [ "${STUB_CREATED}" = "1" ]; then
  rm -f "${DIST_DIR}/bin.js"
  rmdir "${DIST_DIR}" 2>/dev/null || true
fi

# Summary table for quick eyeball
printf '\n=== verify-postinstall-detached run %s ===\n' "${RUN_ID}"
for f in "${JUDGE_DIR}"/*.json; do
  node -e "const j=require('${WORKTREE}/${f}'); console.log(JSON.stringify(j))"
done
echo "evidence dir: ${EVIDENCE_DIR}"
