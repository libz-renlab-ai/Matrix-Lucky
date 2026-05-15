#!/usr/bin/env bash
# Third-party judge harness: doctor install-diagnostic full e2e
#
# Tests THREE isolated installation scenarios against `teamagent doctor`:
#
#   fresh      - no hooks, no plugins, no knowledge.db
#                expected: knowledge-db=fail, hook-registered!=pass
#
#   configured - hooks registered + plugins present + knowledge.db
#                expected: knowledge-db=pass, hook-registered=pass,
#                          plugin-sync=pass, settings-json-scope=pass
#
#   broken     - hooks registered but script file deleted (missing path)
#                expected: hook-registered=pass, hook-script=fail
#
# Each scenario runs in its own isolated HOME + project dir.
# All output is captured; final judge.json has per-scenario per-probe results.
#
# Output:
#   tmp/.judge/doctor-e2e/<run_id>/judge.json
#   tmp/.judge/doctor-e2e/<run_id>/stdout.log
#
# Usage:
#   bash docs/features/doctor-install/run-judge.sh
#
# Prerequisites:
#   pnpm install
#   pnpm --filter @teamagent/cli build:hook  (for configured scenario hook-script)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/tmp/.judge/doctor-e2e/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== doctor install-diagnostic e2e harness run_id=${RUN_ID} ==="
echo "evidence_dir: ${EVIDENCE_DIR}"

TSX="${REPO_ROOT}/node_modules/.bin/tsx"
BIN="${REPO_ROOT}/packages/cli/src/bin.ts"
HOOK_BUNDLE="${REPO_ROOT}/packages/cli/dist/bin-pre-tool-use.cjs"

# ── Helper: seed a minimal knowledge.db in an isolated project dir ──────────────
# Uses the same openDb adapter that doctor uses — avoids slow LLM init command.
seed_knowledge_db() {
  local project_dir="$1"
  local home_dir="$2"
  local db_path="${project_dir}/.teamagent/knowledge.db"
  mkdir -p "$(dirname "${db_path}")"
  node --no-warnings -e "
    const { openDb } = require('${REPO_ROOT}/packages/adapters/dist/index.cjs');
    const db = openDb('${db_path}');
    db.close();
    process.stdout.write('ok');
  " 2>/dev/null || \
    "${TSX}" -e "
      import { openDb } from '${REPO_ROOT}/packages/adapters/src/index.ts';
      const db = openDb('${db_path}');
      db.close();
    " 2>/dev/null || true
  if [ -f "${db_path}" ]; then
    echo "seeded knowledge.db at ${db_path}"
  else
    echo "WARNING: knowledge.db not seeded at ${db_path}" >&2
  fi
}

# ── Build hook bundle if not present (needed for hook-script=pass) ──────────────
if [ ! -f "${HOOK_BUNDLE}" ]; then
  echo "[build] dist/bin-pre-tool-use.cjs not found — building..."
  (cd "${REPO_ROOT}" && pnpm --filter @teamagent/cli build:hook) \
    > "${EVIDENCE_DIR}/build.stdout.txt" 2> "${EVIDENCE_DIR}/build.stderr.txt" || true
  echo "[build] done"
else
  echo "[build] bundle already exists"
fi

# ── Helper: extract a single probe status from a doctor JSON output file ────────
probe_status() {
  local json_file="$1"
  local probe_name="$2"
  node --no-warnings -e "
    try {
      const d = JSON.parse(require('fs').readFileSync('${json_file}','utf-8'));
      const c = (d.checks||[]).find(c=>c.name==='${probe_name}');
      process.stdout.write(c ? c.status : 'missing');
    } catch(e) { process.stdout.write('parse-error'); }
  " 2>/dev/null || echo "error"
}

# ── Helper: run doctor --json for a scenario ────────────────────────────────────
run_doctor() {
  local scenario="$1"
  local project_dir="$2"
  local home_dir="$3"
  local out="${EVIDENCE_DIR}/${scenario}.doctor.json"
  local err="${EVIDENCE_DIR}/${scenario}.doctor.stderr.txt"

  echo "[${scenario}] running doctor --json..."
  HOME="${home_dir}" \
    "${TSX}" "${BIN}" doctor --json --cwd "${project_dir}" \
    > "${out}" 2> "${err}" || true
  echo "[${scenario}] doctor output: $(wc -c < "${out}" 2>/dev/null || echo 0) bytes"
}

# ════════════════════════════════════════════════════════════════════════════════
# SCENARIO 1: fresh — no hooks, no plugins, no knowledge.db
# ════════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━ SCENARIO: fresh ━━"

FRESH_HOME="${EVIDENCE_DIR}/fresh/home"
FRESH_PROJECT="${EVIDENCE_DIR}/fresh/project"
mkdir -p "${FRESH_HOME}/.teamagent" "${FRESH_PROJECT}/.teamagent" "${FRESH_PROJECT}/.claude"

# No init, no install-hook, no plugins — bare project
run_doctor "fresh" "${FRESH_PROJECT}" "${FRESH_HOME}"
FRESH_OUT="${EVIDENCE_DIR}/fresh.doctor.json"

FRESH_KNOWLEDGE_DB="$(probe_status "${FRESH_OUT}" knowledge-db)"
FRESH_HOOK_REGISTERED="$(probe_status "${FRESH_OUT}" hook-registered)"
FRESH_PLUGIN_SYNC="$(probe_status "${FRESH_OUT}" plugin-sync)"
FRESH_SETTINGS_SCOPE="$(probe_status "${FRESH_OUT}" settings-json-scope)"

echo "[fresh] knowledge-db=${FRESH_KNOWLEDGE_DB} hook-registered=${FRESH_HOOK_REGISTERED}"
echo "[fresh] plugin-sync=${FRESH_PLUGIN_SYNC} settings-json-scope=${FRESH_SETTINGS_SCOPE}"

# Assert: knowledge-db must fail; hook-registered must not be pass (either fail or skip)
FRESH_PASS=false
if [ "${FRESH_KNOWLEDGE_DB}" = "fail" ] && [ "${FRESH_HOOK_REGISTERED}" != "pass" ]; then
  FRESH_PASS=true
  echo "[fresh] PASS"
else
  echo "[fresh] FAIL: expected knowledge-db=fail hook-registered!=pass"
fi

# ════════════════════════════════════════════════════════════════════════════════
# SCENARIO 2: configured — hooks + plugins + knowledge.db present
# ════════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━ SCENARIO: configured ━━"

CONF_HOME="${EVIDENCE_DIR}/configured/home"
CONF_PROJECT="${EVIDENCE_DIR}/configured/project"
mkdir -p "${CONF_HOME}/.teamagent" "${CONF_PROJECT}/.teamagent" "${CONF_PROJECT}/.claude"

# Seed knowledge.db directly (avoids slow LLM init; doctor only checks file existence)
seed_knowledge_db "${CONF_PROJECT}" "${CONF_HOME}"
echo "[configured] knowledge.db seeded"

# Write settings.local.json directly with the real bundle path.
# Note: `teamagent install-hook` CLI ignores --cwd (always uses process.cwd),
# so we craft the settings file manually to point at the real built bundle.
cat > "${CONF_PROJECT}/.claude/settings.local.json" << ENDJSON
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit|WebFetch",
        "_teamagentTag": "teamagent-pre-tool-use",
        "hooks": [
          { "type": "command", "command": "node ${HOOK_BUNDLE}", "timeout": 30 }
        ]
      }
    ]
  }
}
ENDJSON
echo "[configured] wrote settings.local.json → ${HOOK_BUNDLE}"

# Seed plugins directory with one stub plugin subdir
mkdir -p "${CONF_PROJECT}/.claude/plugins/teamagent-stub"
echo '{"name":"teamagent-stub","version":"0.0.1"}' \
  > "${CONF_PROJECT}/.claude/plugins/teamagent-stub/package.json"
echo "[configured] plugins seeded"

run_doctor "configured" "${CONF_PROJECT}" "${CONF_HOME}"
CONF_OUT="${EVIDENCE_DIR}/configured.doctor.json"

CONF_KNOWLEDGE_DB="$(probe_status "${CONF_OUT}" knowledge-db)"
CONF_HOOK_REGISTERED="$(probe_status "${CONF_OUT}" hook-registered)"
CONF_HOOK_SCRIPT="$(probe_status "${CONF_OUT}" hook-script)"
CONF_PLUGIN_SYNC="$(probe_status "${CONF_OUT}" plugin-sync)"
CONF_SETTINGS_SCOPE="$(probe_status "${CONF_OUT}" settings-json-scope)"
CONF_CODEX_BIN="$(probe_status "${CONF_OUT}" codex-bin)"
CONF_MCP="$(probe_status "${CONF_OUT}" mcp-reachability)"

echo "[configured] knowledge-db=${CONF_KNOWLEDGE_DB} hook-registered=${CONF_HOOK_REGISTERED}"
echo "[configured] hook-script=${CONF_HOOK_SCRIPT} plugin-sync=${CONF_PLUGIN_SYNC}"
echo "[configured] settings-json-scope=${CONF_SETTINGS_SCOPE} codex-bin=${CONF_CODEX_BIN} mcp=${CONF_MCP}"

# Assert: core install probes must pass; codex-bin presence ok as pass or fail (binary may be absent in CI)
CONF_PASS=false
CONF_CODEX_PRESENT=false
[ "${CONF_CODEX_BIN}" != "missing" ] && CONF_CODEX_PRESENT=true

if [ "${CONF_KNOWLEDGE_DB}" = "pass" ] && \
   [ "${CONF_HOOK_REGISTERED}" = "pass" ] && \
   [ "${CONF_PLUGIN_SYNC}" = "pass" ] && \
   [ "${CONF_SETTINGS_SCOPE}" = "pass" ] && \
   [ "${CONF_CODEX_PRESENT}" = "true" ] && \
   [ "${CONF_MCP}" = "skip" ]; then
  CONF_PASS=true
  echo "[configured] PASS"
else
  echo "[configured] FAIL"
  echo "  expected: knowledge-db=pass hook-registered=pass plugin-sync=pass settings-json-scope=pass codex-bin=present mcp=skip"
  echo "  got:      knowledge-db=${CONF_KNOWLEDGE_DB} hook-registered=${CONF_HOOK_REGISTERED} plugin-sync=${CONF_PLUGIN_SYNC} settings-json-scope=${CONF_SETTINGS_SCOPE} codex-bin=${CONF_CODEX_BIN}(present=${CONF_CODEX_PRESENT}) mcp=${CONF_MCP}"
fi

# ════════════════════════════════════════════════════════════════════════════════
# SCENARIO 3: broken — hook registered but script path missing
# ════════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━ SCENARIO: broken ━━"

BROKEN_HOME="${EVIDENCE_DIR}/broken/home"
BROKEN_PROJECT="${EVIDENCE_DIR}/broken/project"
mkdir -p "${BROKEN_HOME}/.teamagent" "${BROKEN_PROJECT}/.teamagent" "${BROKEN_PROJECT}/.claude"

# Seed knowledge.db directly (same approach as configured scenario)
seed_knowledge_db "${BROKEN_PROJECT}" "${BROKEN_HOME}"
echo "[broken] knowledge.db seeded"

# Write settings.local.json with hook pointing to a nonexistent file
BROKEN_FAKE_SCRIPT="/nonexistent/deleted/bin-pre-tool-use.cjs"
cat > "${BROKEN_PROJECT}/.claude/settings.local.json" << ENDJSON
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit|WebFetch",
        "_teamagentTag": "teamagent-pre-tool-use",
        "hooks": [
          { "type": "command", "command": "node ${BROKEN_FAKE_SCRIPT}", "timeout": 30 }
        ]
      }
    ]
  }
}
ENDJSON
echo "[broken] wrote settings.local.json with broken hook → ${BROKEN_FAKE_SCRIPT}"

run_doctor "broken" "${BROKEN_PROJECT}" "${BROKEN_HOME}"
BROKEN_OUT="${EVIDENCE_DIR}/broken.doctor.json"

BROKEN_HOOK_REGISTERED="$(probe_status "${BROKEN_OUT}" hook-registered)"
BROKEN_HOOK_SCRIPT="$(probe_status "${BROKEN_OUT}" hook-script)"
BROKEN_SETTINGS_SCOPE="$(probe_status "${BROKEN_OUT}" settings-json-scope)"

echo "[broken] hook-registered=${BROKEN_HOOK_REGISTERED} hook-script=${BROKEN_HOOK_SCRIPT}"
echo "[broken] settings-json-scope=${BROKEN_SETTINGS_SCOPE}"

# Assert: hook tag is present → hook-registered=pass; but script missing → hook-script=fail
BROKEN_PASS=false
if [ "${BROKEN_HOOK_REGISTERED}" = "pass" ] && [ "${BROKEN_HOOK_SCRIPT}" = "fail" ]; then
  BROKEN_PASS=true
  echo "[broken] PASS: correctly distinguished missing script from missing registration"
else
  echo "[broken] FAIL: expected hook-registered=pass hook-script=fail"
  echo "  got: hook-registered=${BROKEN_HOOK_REGISTERED} hook-script=${BROKEN_HOOK_SCRIPT}"
fi

# ════════════════════════════════════════════════════════════════════════════════
# Write judge.json
# ════════════════════════════════════════════════════════════════════════════════
echo ""
echo "━━ Writing judge.json ━━"

ALL_PASSED=false
if [ "${FRESH_PASS}" = "true" ] && [ "${CONF_PASS}" = "true" ] && [ "${BROKEN_PASS}" = "true" ]; then
  ALL_PASSED=true
fi

JUDGE_JSON="${EVIDENCE_DIR}/judge.json"
node --no-warnings -e "
const fs = require('fs');
const j = {
  run_id: '${RUN_ID}',
  evidence_dir: '${EVIDENCE_DIR}',
  stdout_path: '${STDOUT_LOG}',
  scenarios: {
    fresh: {
      passed: ${FRESH_PASS},
      probes: {
        knowledge_db:      '${FRESH_KNOWLEDGE_DB}',
        hook_registered:   '${FRESH_HOOK_REGISTERED}',
        plugin_sync:       '${FRESH_PLUGIN_SYNC}',
        settings_json_scope: '${FRESH_SETTINGS_SCOPE}'
      }
    },
    configured: {
      passed: ${CONF_PASS},
      probes: {
        knowledge_db:      '${CONF_KNOWLEDGE_DB}',
        hook_registered:   '${CONF_HOOK_REGISTERED}',
        hook_script:       '${CONF_HOOK_SCRIPT}',
        plugin_sync:       '${CONF_PLUGIN_SYNC}',
        settings_json_scope: '${CONF_SETTINGS_SCOPE}',
        codex_bin:         '${CONF_CODEX_BIN}',
        mcp_reachability:  '${CONF_MCP}'
      }
    },
    broken: {
      passed: ${BROKEN_PASS},
      probes: {
        hook_registered:   '${BROKEN_HOOK_REGISTERED}',
        hook_script:       '${BROKEN_HOOK_SCRIPT}',
        settings_json_scope: '${BROKEN_SETTINGS_SCOPE}'
      }
    }
  },
  all_passed: ${ALL_PASSED}
};
fs.writeFileSync('${JUDGE_JSON}', JSON.stringify(j, null, 2) + '\n');
console.log(JSON.stringify(j, null, 2));
"

echo ""
echo "=== DONE ==="
echo "evidence_dir : ${EVIDENCE_DIR}"
echo "judge.json   : ${JUDGE_JSON}"
echo "all_passed   : ${ALL_PASSED}"
echo ""

if [ "${ALL_PASSED}" = "true" ]; then
  echo "RESULT: PASS — all 3 scenarios correct"
  exit 0
else
  echo "RESULT: FAIL — one or more scenarios failed (see judge.json)"
  exit 1
fi
