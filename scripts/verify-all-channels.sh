#!/usr/bin/env bash
# verify-all-channels.sh — master orchestrator for 8-channel install-fix verification
#
# Runs every collector in the right order, ALL CHANNELS MANDATORY.
# Pauses early to ask for sudo password (channel #2 fs_usage requires it).
# After completion, the MAIN agent dispatches 8 parallel claudefast probes
# per docs/plans/2026-05-07-fix-install/judge.md.
#
# Usage:
#   bash scripts/verify-all-channels.sh
#   RUN_ID=mine bash scripts/verify-all-channels.sh
#   KEEP_DIRS=1 bash scripts/verify-all-channels.sh   # don't rm phase-2 tmp dirs
#
# Prerequisites:
#   - packages/teamagent/teamagent-*.tgz must exist (run `pnpm --filter teamagent build && cd packages/teamagent && npm pack` first)
#   - Tools on PATH: fswatch, du, fs_usage, sqlite3, jq, claudefast, tmux, npm, node
#   - sudo password (one-time prompt at start)
#
# Channel mapping:
#   #1 file create        fswatch    (in verify-real-install-30s.sh phase 1)
#   #2 file read          fs_usage   (sudo; spans phase 2 install)
#   #3 hook called        stream-json (verify-runtime-hooks.sh)
#   #4 statusline         tmux       (verify-statusline.sh)
#   #5 lifecycle          time/exit  (in verify-real-install-30s.sh phase 1)
#   #6 content            sqlite/jq  (verify-db-content.sh, post-init)
#   #7 network            cache diff (in verify-real-install-30s.sh phase 1)
#   #8 negative existence test ! -d  (verify-negative-existence.sh, post phase 2)

set -eu
cd "$(dirname "$0")/.."

WORKTREE=$(pwd)
RUN_ID="${RUN_ID:-master-$(date +%s)}"
JUDGE_DIR=".judge/${RUN_ID}"
EVIDENCE_DIR="${JUDGE_DIR}/evidence"
mkdir -p "${EVIDENCE_DIR}"

# Pretty banner.
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  verify-all-channels  ·  RUN_ID=${RUN_ID}"
echo "  evidence: ${EVIDENCE_DIR}"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ─── Pre-flight: required tools ───────────────────────────────────────────
echo "── Pre-flight ──────────────────────────────────────────────"
MISSING=0
for tool in fswatch du fs_usage sqlite3 jq claudefast tmux npm node; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf "  ok   %s\n" "$tool"
  else
    printf "  MISS %s\n" "$tool"; MISSING=1
  fi
done
if [ "${MISSING}" = "1" ]; then
  echo "FATAL: missing tools (above) — install before continuing." >&2
  exit 1
fi

# ─── Tarball ──────────────────────────────────────────────────────────────
TGZ=$(ls "${WORKTREE}/packages/teamagent"/teamagent-*.tgz 2>/dev/null | head -1 || true)
if [ -z "${TGZ}" ] || [ ! -f "${TGZ}" ]; then
  echo "FATAL: no tarball at packages/teamagent/teamagent-*.tgz" >&2
  echo "  run: pnpm --filter teamagent build && (cd packages/teamagent && npm pack)" >&2
  exit 1
fi
echo "  tarball: ${TGZ}"

# ─── Sudo pause ───────────────────────────────────────────────────────────
# We support three sudo modes; orchestrator picks the first that works.
#   1. SUDO_ASKPASS already set (caller built an askpass helper).
#   2. Sudo already cached (sudo -n true succeeds).
#   3. Interactive TTY (we run sudo -v, it prompts the user).
# In askpass mode the harness uses `sudo -A`; in cached/interactive modes it
# uses bare `sudo`. macOS tty_tickets defaults make cached creds non-portable
# across nested subshells, so askpass is the most reliable mode for CI /
# Claude Code Bash tool / non-TTY contexts.
echo ""
echo "── Sudo (channel #2 fs_usage requires it) ─────────────────"
SUDO="sudo"
if [ -n "${SUDO_ASKPASS:-}" ]; then
  SUDO="sudo -A"
  if ! sudo -A -v 2>/dev/null; then
    echo "FATAL: SUDO_ASKPASS=${SUDO_ASKPASS} did not authenticate." >&2
    exit 2
  fi
  echo "  ok   sudo authenticated via SUDO_ASKPASS"
elif sudo -n true 2>/dev/null; then
  echo "  ok   sudo already cached (no prompt needed)"
elif [ -t 0 ] && [ -t 1 ]; then
  echo "Running 'sudo -v' — your shell will prompt for your password if not cached."
  echo "(Cached credentials last ~5 minutes; we keep them alive throughout the run.)"
  if ! sudo -v; then
    echo "FATAL: sudo authentication failed — cannot run channel #2." >&2
    exit 2
  fi
  echo "  ok   sudo cached"
else
  cat >&2 <<EOF
FATAL: no TTY available for sudo prompt and no cached sudo credentials.

Channel #2 (fs_usage) is mandatory. To proceed, either:

  1. Re-run from your interactive shell so it can prompt for the password:
       sudo -v && bash scripts/verify-all-channels.sh

  2. In Claude Code, prefix with '!' so the command runs in your TTY:
       ! sudo -v && bash scripts/verify-all-channels.sh

  3. Configure SUDO_ASKPASS to point at an askpass helper, then:
       SUDO_ASKPASS=/path/to/askpass.sh bash scripts/verify-all-channels.sh

EOF
  exit 2
fi
export SUDO

# Keep sudo alive in background.
( while true; do sudo -n true 2>/dev/null || break; sleep 50; done ) &
SUDO_KEEPER=$!
cleanup_master() {
  kill "${SUDO_KEEPER}" 2>/dev/null || true
}
trap cleanup_master EXIT INT TERM

# ─── Phase 1: real install timing (3 runs) + fswatch + cache delta ────────
echo ""
echo "── Phase 1: real install (3 runs) — channels #1, #5, #7, #8(partial) ──"
echo ""
CHANNEL_FAILURES=()
if ! RUN_ID="${RUN_ID}" SKIP_FOREGROUND=1 bash scripts/verify-real-install-30s.sh; then
  echo "  ✗ verify-real-install-30s.sh failed (mandatory channel #1/5/7)" >&2
  CHANNEL_FAILURES+=("1:phase1-real-install")
fi

# ─── Phase 2: persistent install for post-install channels ────────────────
echo ""
echo "── Phase 2: persistent install (channels #2, #3, #4, #6, #8) ────"

P2_PREF=$(mktemp -d -t "p2-pre-XXXX")
P2_CACH=$(mktemp -d -t "p2-cache-XXXX")
P2_HOME=$(mktemp -d -t "p2-home-XXXX")
P2_PROJ=$(mktemp -d -t "p2-proj-XXXX")
mkdir -p "${P2_HOME}/.teamagent" "${P2_HOME}/.claude" "${P2_PROJ}"

cleanup_phase2() {
  if [ "${KEEP_DIRS:-0}" != "1" ]; then
    rm -rf "${P2_PREF}" "${P2_CACH}" "${P2_HOME}" "${P2_PROJ}" 2>/dev/null || true
  fi
  cleanup_master
}
trap cleanup_phase2 EXIT INT TERM

echo "  prefix:  ${P2_PREF}"
echo "  cache:   ${P2_CACH}"
echo "  home:    ${P2_HOME}"
echo "  project: ${P2_PROJ}"

# Channel #2: fs_usage trace spans the install.
echo ""
echo "── Channel #2: fs_usage (sudo) ─────────────────────────────"
FSUSAGE_PID=""
if FSUSAGE_PID=$(RUN_ID="${RUN_ID}" DURATION=180 bash scripts/verify-fs-usage.sh); then
  echo "  fs_usage pid: ${FSUSAGE_PID}  log: ${EVIDENCE_DIR}/fs_usage.log"
else
  echo "  ✗ verify-fs-usage.sh failed (mandatory channel #2)" >&2
  CHANNEL_FAILURES+=("2:fs-usage")
  FSUSAGE_PID=""
fi

# Sleep so fs_usage dtrace kernel probe attaches before install starts.
sleep 3

# Real install (default path; should be ~3s).
echo ""
echo "── Default install (default path) ───────────────────────────"
INSTALL_OUT="${EVIDENCE_DIR}/p2-install.out"
INSTALL_TIME="${EVIDENCE_DIR}/p2-install.time"
HOME="${P2_HOME}" /usr/bin/time -p npm install -g --foreground-scripts \
  --prefix="${P2_PREF}" --cache="${P2_CACH}" "${TGZ}" \
  > "${INSTALL_OUT}" 2> "${INSTALL_TIME}.raw" || INSTALL_EXIT=$?
INSTALL_EXIT="${INSTALL_EXIT:-0}"
awk '/^real |^user |^sys /{print; next}' "${INSTALL_TIME}.raw" > "${INSTALL_TIME}"
INSTALL_WALL=$(awk '/^real /{print $2}' "${INSTALL_TIME}" | head -1)
echo "  exit=${INSTALL_EXIT}  wall=${INSTALL_WALL}s"

# Stop fs_usage now that install is done (skip if spawn failed).
[ -n "${FSUSAGE_PID:-}" ] && ${SUDO} kill "${FSUSAGE_PID}" 2>/dev/null || true
sleep 1
echo "  fs_usage stopped"

# Channel #8: negative existence (post-install snapshot).
echo ""
echo "── Channel #8: negative existence ──────────────────────────"
if ! RUN_ID="${RUN_ID}" PREFIX="${P2_PREF}" HOMEDIR="${P2_HOME}" \
     bash scripts/verify-negative-existence.sh; then
  echo "  ✗ verify-negative-existence.sh failed (mandatory channel #8)" >&2
  CHANNEL_FAILURES+=("8:negative-existence")
fi
for f in neg-no-xenova neg-no-onnx neg-no-state; do
  if [ -f "${EVIDENCE_DIR}/${f}" ]; then
    printf "  %-15s %s\n" "${f}:" "$(cat "${EVIDENCE_DIR}/${f}")"
  fi
done

# Make installed teamagent callable.
export PATH="${P2_PREF}/bin:${PATH}"
TEAMAGENT_BIN="${P2_PREF}/bin/teamagent"
if [ ! -x "${TEAMAGENT_BIN}" ]; then
  echo "FATAL: teamagent not found at ${TEAMAGENT_BIN}" >&2
  exit 3
fi
echo "  teamagent bin: ${TEAMAGENT_BIN}"

# Seed a project package.json so claudefast's Read tool has a target.
cat > "${P2_PROJ}/package.json" <<'JSON_EOF'
{
  "name": "verify-all-channels-target",
  "version": "0.0.0",
  "description": "Test project for runtime hook + statusline verification."
}
JSON_EOF

# teamagent init — let the natural ADR 0001 gate decide whether to skip warmup.
# We intentionally do NOT pass TEAMAGENT_SKIP_WARMUP=1 or --skip-warmup here
# so that Channel #8 (neg-no-state) actually tests the haveVectorOptionals gate:
# vector deps are absent in the default install → haveVectorOptionals returns
# false → warmup is skipped → no .warmup-state.json is written.  Using the
# bypass flags would make the assertion trivially pass even if the gate regressed.
echo ""
echo "── teamagent init (post-install) ───────────────────────────"
( cd "${P2_PROJ}" && HOME="${P2_HOME}" \
    "${TEAMAGENT_BIN}" init 2>&1 ) > "${EVIDENCE_DIR}/teamagent-init.out" \
  || echo "  ⚠ teamagent init had non-zero exit; continuing for evidence collection"

# Channel #6: DB + state-file content.
echo ""
echo "── Channel #6: DB + state-file content ─────────────────────"
if ! RUN_ID="${RUN_ID}" HOMEDIR="${P2_HOME}" bash scripts/verify-db-content.sh; then
  echo "  ✗ verify-db-content.sh failed (mandatory channel #6)" >&2
  CHANNEL_FAILURES+=("6:db-content")
fi
for f in db-tables.txt db-rule-count.txt warmup-state.kv; do
  if [ -f "${EVIDENCE_DIR}/${f}" ]; then
    printf "  %-25s %s\n" "${f}:" "$(head -3 "${EVIDENCE_DIR}/${f}" | tr '\n' '|')"
  fi
done

# Channel #3: runtime hooks. All mandatory channels use the CHANNEL_FAILURES
# accumulator (initialized before Phase 1) so failures accumulate to exit 4
# and evidence collection continues for the remaining channels.
echo ""
echo "── Channel #3: runtime hooks (claudefast --debug hooks) ────"
if ! RUN_ID="${RUN_ID}" HOMEDIR="${P2_HOME}" PROJECT_DIR="${P2_PROJ}" \
       bash scripts/verify-runtime-hooks.sh; then
  echo "  ✗ verify-runtime-hooks.sh failed (mandatory channel #3)" >&2
  CHANNEL_FAILURES+=("3:runtime-hooks")
fi

# Channel #4: tmux statusline.
echo ""
echo "── Channel #4: tmux statusline ─────────────────────────────"
if ! RUN_ID="${RUN_ID}" HOMEDIR="${P2_HOME}" PROJECT_DIR="${P2_PROJ}" \
       bash scripts/verify-statusline.sh; then
  echo "  ✗ verify-statusline.sh failed (mandatory channel #4)" >&2
  CHANNEL_FAILURES+=("4:statusline")
fi

# ─── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  evidence collected at .judge/${RUN_ID}/"
echo "════════════════════════════════════════════════════════════════"
ls -la "${EVIDENCE_DIR}" | head -40

echo ""
cat <<EOF
Next: dispatch 8 parallel LLM judge probes per
  docs/plans/2026-05-07-fix-install/judge.md

Quick template (run from worktree root):

  for label in A B C D E F G H; do
    claudefast -p \\
      --output-format stream-json \\
      --include-partial-messages \\
      --verbose \\
      "<paste Probe \$label prompt body from judge.md>" \\
      > .judge/${RUN_ID}/probe-\$label.out &
  done
  wait
  # then synthesize per judge.md Step 3.

EOF

# Build a JSON-safe fragment for wallclock_s (bare null, not quoted "null").
if [ -n "${INSTALL_WALL:-}" ]; then
  INSTALL_WALL_JSON="\"${INSTALL_WALL}\""
else
  INSTALL_WALL_JSON="null"
fi

# Write a manifest for the orchestrator phase.
cat > "${JUDGE_DIR}/master-manifest.json" <<JSON_EOF
{
  "run_id": "${RUN_ID}",
  "tarball": "${TGZ}",
  "phase2": {
    "prefix": "${P2_PREF}",
    "cache": "${P2_CACH}",
    "home": "${P2_HOME}",
    "project": "${P2_PROJ}",
    "kept": "${KEEP_DIRS:-0}"
  },
  "install_default": {
    "exit_code": ${INSTALL_EXIT},
    "wallclock_s": ${INSTALL_WALL_JSON},
    "stdout_path": "${INSTALL_OUT}",
    "timing_path": "${INSTALL_TIME}"
  },
  "channels": {
    "1_file_create":    "phase1 .judge/${RUN_ID}/evidence/*.fswatch.log",
    "2_file_read":      "phase2 .judge/${RUN_ID}/evidence/fs_usage.log",
    "3_hook_called":    "phase2 .judge/${RUN_ID}/evidence/{streamjson.log,hooks.debug.log,hooks-exit-code.txt}",
    "4_statusline":     "phase2 .judge/${RUN_ID}/evidence/tmux-statusline.snapshot",
    "5_lifecycle":      "phase1 .judge/${RUN_ID}/{01-skip,02-detached}.json",
    "6_db_content":     "phase2 .judge/${RUN_ID}/evidence/{db-tables.txt,db-rule-count.txt,warmup-state.kv}",
    "7_network":        "phase1 .judge/${RUN_ID}/evidence/*.{cache-pre,cache-post}.size",
    "8_negative":       "phase2 .judge/${RUN_ID}/evidence/{neg-no-xenova,neg-no-onnx,neg-no-state}"
  }
}
JSON_EOF

echo "manifest: ${JUDGE_DIR}/master-manifest.json"
echo ""

# Codex P2 fix: 8/8 mandatory means a non-zero collector exit → non-zero
# orchestrator exit. CI / parent automation can now key off `bash
# scripts/verify-all-channels.sh; echo $?` instead of being misled by
# silent warnings.
if [ "${#CHANNEL_FAILURES[@]}" -gt 0 ]; then
  echo "FATAL: mandatory channel(s) failed: ${CHANNEL_FAILURES[*]}" >&2
  echo "  See evidence dir for partial output. Re-run after fixing." >&2
  exit 4
fi
