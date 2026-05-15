#!/usr/bin/env bash
# verify-real-install-30s.sh — judge harness for real-world install <=30s.
#
# Builds + npm-packs teamagent, then runs `npm install -g` against an isolated
# --prefix and --cache directory (so the user's global npm setup is untouched).
# Measures wall-clock for three paths so we can attribute time:
#   01-skip       TEAMAGENT_SKIP_WARMUP=1   pure npm work (no postinstall warmup branch)
#   02-detached   default                   ADR 0001 path (Stage 2 detached)
#   03-foreground TEAMAGENT_FOREGROUND_WARMUP=1  legacy sync warmup (escape hatch)
#
# 03-foreground takes ~5-10min on first run because it actually pulls the
# 120MB Xenova model. Pass SKIP_FOREGROUND=1 to drop it from the run.
set -eu
cd "$(dirname "$0")/.."

# Hard-fail if required tools are missing (all channels mandatory — no silent skip).
if ! command -v fswatch >/dev/null 2>&1; then
  echo "FATAL: fswatch required: brew install fswatch" >&2
  exit 1
fi
if ! command -v du >/dev/null 2>&1; then
  echo "FATAL: du required (should be a POSIX built-in; check PATH)" >&2
  exit 1
fi

WORKTREE=$(pwd)
RUN_ID="${RUN_ID:-real-$(date +%s)}"
JUDGE_DIR=".judge/${RUN_ID}"
EVIDENCE_DIR="${JUDGE_DIR}/evidence"
mkdir -p "${EVIDENCE_DIR}"

PKG_DIR="${WORKTREE}/packages/teamagent"
TGZ=$(ls "${PKG_DIR}"/teamagent-*.tgz 2>/dev/null | head -1 || true)
if [ -z "${TGZ}" ] || [ ! -f "${TGZ}" ]; then
  echo "FATAL: no tarball; run 'cd packages/teamagent && npm pack' first" >&2
  exit 1
fi
TGZ_SIZE=$(stat -f%z "${TGZ}" 2>/dev/null || stat -c%s "${TGZ}")
echo "tarball: ${TGZ} (${TGZ_SIZE} bytes)"

run_install() {
  local label="$1"; shift
  local pref
  local cach
  local home
  pref=$(mktemp -d -t "ta-pre-${label}-XXXX")
  cach=$(mktemp -d -t "ta-cache-${label}-XXXX")
  home=$(mktemp -d -t "ta-home-${label}-XXXX")
  local out="${EVIDENCE_DIR}/${label}.out"
  local timing="${EVIDENCE_DIR}/${label}.time"
  local statefile="${home}/.teamagent/.warmup-state.json"
  local fswatch_log="${EVIDENCE_DIR}/${label}.fswatch.log"
  local cache_pre_file="${EVIDENCE_DIR}/${label}.cache-pre.size"
  local cache_post_file="${EVIDENCE_DIR}/${label}.cache-post.size"
  local exit_code=0
  local FSWATCH_PID=""

  # Cleanup trap: kill fswatch on any exit path.
  trap '[ -n "${FSWATCH_PID}" ] && kill "${FSWATCH_PID}" 2>/dev/null; true' EXIT INT TERM

  # Pre-create watched dirs so fswatch doesn't refuse to start.
  mkdir -p "${home}/.teamagent" "${cach}" "${pref}/lib/node_modules"

  # Cache-size BEFORE install.
  du -sk "${cach}" | awk '{print $1}' > "${cache_pre_file}"

  # Start fswatch in background.
  # --latency 0.1 forces fswatch to emit events as they happen rather than the
  # default 1-second batch cadence; without this a fast install (~3-15s) may
  # finish and the SIGTERM below fires before the first batch flushes, leaving
  # an empty log. -0 NUL-separated, -t timestamps, -x event flags.
  fswatch --latency 0.1 -0 -t -x \
    "${home}/.teamagent" "${cach}" "${pref}/lib/node_modules" \
    > "${fswatch_log}" 2>&1 &
  FSWATCH_PID=$!
  # Brief pause so FSEvents attach completes before npm starts firing events.
  sleep 0.3

  echo ">>> ${label}: prefix=${pref} cache=${cach} home=${home}" | tee -a "${EVIDENCE_DIR}/run.log"
  # --foreground-scripts forwards postinstall stdout/stderr to the parent
  # process so banner anchors (e.g. "语义匹配: 未安装", "TEAMAGENT_INCLUDE_
  # OPTIONAL=1") land in $out where Probe B can read them. Without this,
  # npm 10 hides postinstall output by default and the banner judge fails.
  HOME="${home}" "$@" \
    /usr/bin/time -p npm install -g --foreground-scripts \
      --prefix="${pref}" \
      --cache="${cach}" \
      "${TGZ}" \
    >"${out}" 2>"${timing}.raw" || exit_code=$?

  # Stop fswatch now that install is done.
  # Tiny sleep gives fswatch time to flush its --latency 0.1 buffer to disk
  # before SIGTERM aborts the process.
  sleep 0.3
  kill "${FSWATCH_PID}" 2>/dev/null || true
  wait "${FSWATCH_PID}" 2>/dev/null || true
  FSWATCH_PID=""

  # Cache-size AFTER install.
  du -sk "${cach}" | awk '{print $1}' > "${cache_post_file}"

  # Compute delta in kB (integer).
  local cache_pre cache_post cache_delta
  cache_pre=$(cat "${cache_pre_file}")
  cache_post=$(cat "${cache_post_file}")
  cache_delta=$((cache_post - cache_pre))

  # /usr/bin/time -p writes "real <s>" / "user <s>" / "sys <s>" on stderr (POSIX).
  # macOS implementation matches; GNU time on Linux is also -p compliant. If
  # porting to a host with a different time(1), retest this awk filter.
  awk '/^real |^user |^sys /{print > "/dev/stderr"; next} {print}' "${timing}.raw" 2>"${timing}" 1>>"${out}"
  rm -f "${timing}.raw"

  local wall_s
  wall_s=$(awk '/^real /{print $2}' "${timing}" | head -1)
  local user_s
  user_s=$(awk '/^user /{print $2}' "${timing}" | head -1)
  local sys_s
  sys_s=$(awk '/^sys /{print $2}' "${timing}" | head -1)

  local state_status="<absent>"
  local state_pid="<absent>"
  if [ -f "${statefile}" ]; then
    state_status=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('${statefile}','utf8')).status)}catch(e){console.log('<parse-err>')}" 2>/dev/null || echo "<parse-err>")
    state_pid=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('${statefile}','utf8')).pid)}catch(e){console.log('<parse-err>')}" 2>/dev/null || echo "<parse-err>")
    cp "${statefile}" "${EVIDENCE_DIR}/${label}.warmup-state.json"
  fi

  # Build JSON-safe fragments for optional numeric fields (bare null, not quoted "null").
  local wall_s_json user_s_json sys_s_json
  if [ -n "${wall_s:-}" ]; then wall_s_json="\"${wall_s}\""; else wall_s_json="null"; fi
  if [ -n "${user_s:-}" ]; then user_s_json="\"${user_s}\""; else user_s_json="null"; fi
  if [ -n "${sys_s:-}" ]; then sys_s_json="\"${sys_s}\""; else sys_s_json="null"; fi

  cat > "${JUDGE_DIR}/${label}.json" <<JSON_EOF
{
  "label": "${label}",
  "exit_code": ${exit_code},
  "wallclock_s": ${wall_s_json},
  "user_s": ${user_s_json},
  "sys_s": ${sys_s_json},
  "warmup_state_status": "${state_status}",
  "warmup_state_pid": "${state_pid}",
  "tarball_size_bytes": ${TGZ_SIZE},
  "stdout_path": "${EVIDENCE_DIR}/${label}.out",
  "timing_path": "${EVIDENCE_DIR}/${label}.time",
  "fswatch_log_path": "${fswatch_log}",
  "cache_delta_kb": ${cache_delta}
}
JSON_EOF

  rm -rf "${pref}" "${cach}" "${home}"
  # Reset trap to no-op after clean per-run teardown.
  trap - EXIT INT TERM
}

# 01: SKIP_WARMUP baseline — pure npm work + Stage1+3 only
run_install "01-skip" env TEAMAGENT_SKIP_WARMUP=1

# 02: default detached — ADR 0001 path
run_install "02-detached" env

# 03: foreground (skip by default — would actually download 120MB; opt in via env)
if [ "${SKIP_FOREGROUND:-1}" != "1" ]; then
  run_install "03-foreground" env TEAMAGENT_FOREGROUND_WARMUP=1
fi

# Summary
printf '\n=== verify-real-install-30s run %s ===\n' "${RUN_ID}"
ANY_FAIL=0
for f in "${JUDGE_DIR}"/*.json; do
  node -e "const j=require('${WORKTREE}/${f}'); console.log(JSON.stringify(j))"
  ec=$(node -e "const j=require('${WORKTREE}/${f}'); console.log(j.exit_code ?? 0)")
  if [ "${ec}" != "0" ]; then ANY_FAIL=1; fi
done
echo "evidence dir: ${EVIDENCE_DIR}"

# Wave-9 P3 fix: propagate any non-zero install exit so the orchestrator's
# `if ! bash scripts/verify-real-install-30s.sh` guard actually fires when
# Phase 1 install fails. Per-run JSON still records the exit code for LLM
# judging; this exit code is the orchestrator-facing signal.
if [ "${ANY_FAIL}" = "1" ]; then
  echo "verify-real-install-30s: at least one install run had non-zero exit_code (see *.json)" >&2
  exit 1
fi
exit 0
