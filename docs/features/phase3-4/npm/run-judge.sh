#!/usr/bin/env bash
# Third-party judge harness: npm bundle / publish config
#
# Mechanical checks:
#   1. Root package.json has a teamagent CLI entry in workspaces
#   2. packages/cli/package.json has a "bin" field referencing teamagent
#   3. packages/cli/package.json has a build script (esbuild or tsc)
#   4. packages/teamagent/ OR packages/cli/ has name field = "teamagent" or "@teamagent/cli"
#   5. pnpm-workspace.yaml includes packages/* glob
#
# Usage: bash docs/features/phase3-4/npm/run-judge.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/tmp/.judge/npm/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"
STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== npm bundle/publish judge run_id=${RUN_ID} ==="

CLI_PKG="${REPO_ROOT}/packages/cli/package.json"
WORKSPACE_YAML="${REPO_ROOT}/pnpm-workspace.yaml"
TEAMAGENT_PKG="${REPO_ROOT}/packages/teamagent/package.json"

# Check 1: CLI package.json has bin field
CHECK_BIN=false
if [ -f "${CLI_PKG}" ]; then
  HAS_BIN="$(node --no-warnings -e "const p=JSON.parse(require('fs').readFileSync('${CLI_PKG}','utf-8')); process.stdout.write(p.bin?'yes':'no');")"
  [ "${HAS_BIN}" = "yes" ] && CHECK_BIN=true
fi
echo "[1] CLI package.json has bin: ${CHECK_BIN}"

# Check 2: bin field references teamagent
CHECK_BIN_NAME=false
if [ -f "${CLI_PKG}" ]; then
  BIN_HAS_TEAMAGENT="$(node --no-warnings -e "
    const p=JSON.parse(require('fs').readFileSync('${CLI_PKG}','utf-8'));
    const b=p.bin||{};
    process.stdout.write(Object.keys(b).includes('teamagent')?'yes':'no');
  ")"
  [ "${BIN_HAS_TEAMAGENT}" = "yes" ] && CHECK_BIN_NAME=true
fi
echo "[2] bin includes teamagent entry: ${CHECK_BIN_NAME}"

# Check 3: build script exists in CLI or root
CHECK_BUILD=false
if [ -f "${CLI_PKG}" ]; then
  HAS_BUILD="$(node --no-warnings -e "const p=JSON.parse(require('fs').readFileSync('${CLI_PKG}','utf-8')); const s=p.scripts||{}; process.stdout.write(Object.keys(s).some(k=>k.startsWith('build'))?'yes':'no');")"
  [ "${HAS_BUILD}" = "yes" ] && CHECK_BUILD=true
fi
echo "[3] build script present: ${CHECK_BUILD}"

# Check 4: packages/cli name is @teamagent/cli or CLI has esbuild dep
CHECK_PKG_NAME=false
if [ -f "${CLI_PKG}" ]; then
  CLI_NAME="$(node --no-warnings -e "process.stdout.write(JSON.parse(require('fs').readFileSync('${CLI_PKG}','utf-8')).name||'');")"
  if [ "${CLI_NAME}" = "@teamagent/cli" ] || [ "${CLI_NAME}" = "teamagent" ]; then
    CHECK_PKG_NAME=true
  fi
  # Also accept if a top-level teamagent package exists
  if [ -f "${TEAMAGENT_PKG}" ]; then
    TA_NAME="$(node --no-warnings -e "process.stdout.write(JSON.parse(require('fs').readFileSync('${TEAMAGENT_PKG}','utf-8')).name||'');")"
    [ "${TA_NAME}" = "teamagent" ] && CHECK_PKG_NAME=true
  fi
fi
echo "[4] package name correct: ${CHECK_PKG_NAME}"

# Check 5: pnpm-workspace includes packages/*
CHECK_WORKSPACE=false
if [ -f "${WORKSPACE_YAML}" ] && grep -q "packages" "${WORKSPACE_YAML}"; then
  CHECK_WORKSPACE=true
fi
echo "[5] pnpm-workspace.yaml includes packages: ${CHECK_WORKSPACE}"

ALL_PASSED=false
if [ "${CHECK_BIN}" = "true" ] && \
   [ "${CHECK_BIN_NAME}" = "true" ] && \
   [ "${CHECK_BUILD}" = "true" ] && \
   [ "${CHECK_PKG_NAME}" = "true" ] && \
   [ "${CHECK_WORKSPACE}" = "true" ]; then
  ALL_PASSED=true
fi

JUDGE_JSON="${EVIDENCE_DIR}/judge.json"
node --no-warnings -e "
const fs = require('fs');
const j = {
  run_id: '${RUN_ID}',
  feature: 'npm-bundle-publish',
  evidence_dir: '${EVIDENCE_DIR}',
  stdout_path: '${STDOUT_LOG}',
  checks: {
    cli_pkg_has_bin: ${CHECK_BIN},
    bin_includes_teamagent_entry: ${CHECK_BIN_NAME},
    build_script_present: ${CHECK_BUILD},
    package_name_correct: ${CHECK_PKG_NAME},
    pnpm_workspace_includes_packages: ${CHECK_WORKSPACE}
  },
  all_passed: ${ALL_PASSED}
};
fs.writeFileSync('${JUDGE_JSON}', JSON.stringify(j, null, 2) + '\n');
console.log(JSON.stringify(j, null, 2));
"
echo "evidence_dir : ${EVIDENCE_DIR}"
echo "all_passed   : ${ALL_PASSED}"
[ "${ALL_PASSED}" = "true" ] && echo "RESULT: PASS" && exit 0 || { echo "RESULT: FAIL"; exit 1; }
