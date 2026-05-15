#!/usr/bin/env bash
# Judge harness: MCP server feature verification
#
# Tests three JSON-RPC 2.0 handshakes over stdio against the MCP server:
#   1. initialize  — result has protocolVersion + serverInfo
#   2. tools/list  — result.tools[].name includes check_pitfall
#   3. tools/call  — check_pitfall("test query for fixture rule") returns non-empty content
#
# Output:
#   .judge/mcp/<run_id>/judge.json
#   .judge/mcp/<run_id>/verdict.txt
#
# Usage:
#   bash docs/features/mcp-server/run-judge.sh [<mcp-server-cmd>]
#
# The optional first argument overrides the server command.
# Default: npx tsx packages/mcp-server/src/server.ts  (run from repo root)
# Once CLI wires `mcp-server` subcommand, also works as:
#   bash run-judge.sh "npx tsx packages/cli/src/bin.ts mcp-server"

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
EVIDENCE_DIR="${REPO_ROOT}/.judge/mcp/${RUN_ID}"
mkdir -p "${EVIDENCE_DIR}"

STDOUT_LOG="${EVIDENCE_DIR}/stdout.log"
exec > >(tee -a "${STDOUT_LOG}") 2>&1

echo "=== mcp-server judge harness run_id=${RUN_ID} ==="

# ── Server command ─────────────────────────────────────────────────────────────
if [ $# -ge 1 ] && [ -n "$1" ]; then
  MCP_CMD="$1"
else
  # Call tsx directly on the server entrypoint; run from repo root
  MCP_CMD="npx tsx ${REPO_ROOT}/packages/mcp-server/src/server.ts"
fi
echo "[config] MCP server command: ${MCP_CMD}"

# ── JSON-RPC messages ──────────────────────────────────────────────────────────
MSG_INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}'
MSG_LIST='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
MSG_CALL='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_pitfall","arguments":{"query":"test query for fixture rule"}}}'

REQUESTS_FILE="${EVIDENCE_DIR}/requests.jsonl"
printf '%s\n%s\n%s\n' "${MSG_INIT}" "${MSG_LIST}" "${MSG_CALL}" > "${REQUESTS_FILE}"

RAW_RESPONSES="${EVIDENCE_DIR}/raw_responses.jsonl"
SERVER_STDERR="${EVIDENCE_DIR}/server.stderr.txt"

echo "[probe] sending 3 JSON-RPC messages to server via stdio..."
SERVER_EXIT=0
cd "${REPO_ROOT}" && timeout 30s bash -c "${MCP_CMD}" \
  < "${REQUESTS_FILE}" \
  > "${RAW_RESPONSES}" \
  2> "${SERVER_STDERR}" || SERVER_EXIT=$?

echo "[probe] server exited with: ${SERVER_EXIT}"
echo "[probe] raw response lines: $(wc -l < "${RAW_RESPONSES}" 2>/dev/null || echo 0)"

# ── Parse responses ────────────────────────────────────────────────────────────
PARSE_RESULT="${EVIDENCE_DIR}/parse_result.json"

node --no-warnings -e "
const fs = require('fs');
const raw = fs.readFileSync('${RAW_RESPONSES}', 'utf-8').trim();
const lines = raw.length ? raw.split('\n').filter(l => l.trim().startsWith('{')) : [];

let resp1 = null, resp2 = null, resp3 = null;
for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    if (obj && typeof obj === 'object' && 'id' in obj) {
      if (obj.id === 1) resp1 = obj;
      else if (obj.id === 2) resp2 = obj;
      else if (obj.id === 3) resp3 = obj;
    }
  } catch (e) { /* skip non-JSON lines */ }
}

// Check 1: initialize — result.protocolVersion and result.serverInfo exist
const init_ok = !!(
  resp1 && resp1.result &&
  typeof resp1.result.protocolVersion === 'string' &&
  resp1.result.serverInfo && typeof resp1.result.serverInfo === 'object'
);

// Check 2: tools/list — result.tools is array containing check_pitfall
const tools = (resp2 && resp2.result && Array.isArray(resp2.result.tools))
  ? resp2.result.tools : [];
const tools_list_has_check_pitfall = tools.some(t => t && t.name === 'check_pitfall');

// Check 3: tools/call — result.content is non-empty array with text items
const content = (resp3 && resp3.result && Array.isArray(resp3.result.content))
  ? resp3.result.content : [];
const tools_call_returned_content = content.length > 0 &&
  content.some(c => c && (c.type === 'text' || typeof c.text === 'string'));

const result = {
  init_ok,
  tools_list_has_check_pitfall,
  tools_call_returned_content,
  raw_resp1: resp1,
  raw_resp2: resp2,
  raw_resp3: resp3
};
fs.writeFileSync('${PARSE_RESULT}', JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify({ init_ok, tools_list_has_check_pitfall, tools_call_returned_content }) + '\n');
"

INIT_OK="$(node --no-warnings -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('${PARSE_RESULT}')).init_ok));")"
TOOLS_LIST_HAS="$(node --no-warnings -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('${PARSE_RESULT}')).tools_list_has_check_pitfall));")"
TOOLS_CALL_CONTENT="$(node --no-warnings -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('${PARSE_RESULT}')).tools_call_returned_content));")"

echo "[check] init_ok=${INIT_OK}"
echo "[check] tools_list_has_check_pitfall=${TOOLS_LIST_HAS}"
echo "[check] tools_call_returned_content=${TOOLS_CALL_CONTENT}"

# ── Write judge.json ───────────────────────────────────────────────────────────
JUDGE_JSON="${EVIDENCE_DIR}/judge.json"
node --no-warnings -e "
const j = {
  run_id: '${RUN_ID}',
  exit_code: ${SERVER_EXIT},
  init_ok: ${INIT_OK},
  tools_list_has_check_pitfall: ${TOOLS_LIST_HAS},
  tools_call_returned_content: ${TOOLS_CALL_CONTENT},
  evidence_dir: '${EVIDENCE_DIR}',
  raw_responses_path: '${RAW_RESPONSES}',
  stdout_path: '${STDOUT_LOG}',
  server_stderr_path: '${SERVER_STDERR}'
};
require('fs').writeFileSync('${JUDGE_JSON}', JSON.stringify(j, null, 2) + '\n');
console.log(JSON.stringify(j, null, 2));
"
echo ""
echo "=== judge.json written to ${JUDGE_JSON} ==="

# ── LLM verdict via claudefast ─────────────────────────────────────────────────
VERDICT_FILE="${EVIDENCE_DIR}/verdict.txt"
JUDGE_PROMPT="Read this judge.json and respond PASS only if all three bools (init_ok, tools_list_has_check_pitfall, tools_call_returned_content) are true; else FAIL with a short reason naming which check(s) failed. Output only PASS or FAIL:<reason>.

$(cat "${JUDGE_JSON}")"

echo "[verdict] calling claudefast for LLM verdict..."
printf '%s' "${JUDGE_PROMPT}" \
  | claudefast -p - \
  > "${VERDICT_FILE}" 2>"${EVIDENCE_DIR}/verdict.stderr.txt" || true

echo "[verdict] $(cat "${VERDICT_FILE}")"
echo ""
echo "=== DONE ==="
echo "evidence_dir : ${EVIDENCE_DIR}"
echo "judge.json   : ${JUDGE_JSON}"
echo "verdict.txt  : ${VERDICT_FILE}"
