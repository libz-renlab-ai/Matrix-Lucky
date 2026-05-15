#!/usr/bin/env bash
# Channel #6: post-install DB and state-file content snapshots
# Inputs:  RUN_ID (required), HOMEDIR (required — path to test HOME)
# Outputs: .judge/$RUN_ID/evidence/db-tables.txt
#          .judge/$RUN_ID/evidence/db-rule-count.txt
#          .judge/$RUN_ID/evidence/warmup-state.kv
set -eu

: "${RUN_ID:?RUN_ID is required}"
: "${HOMEDIR:?HOMEDIR is required}"

mkdir -p ".judge/${RUN_ID}/evidence"

EVDIR=".judge/${RUN_ID}/evidence"
DB="${HOMEDIR}/.teamagent/global.db"
STATE="${HOMEDIR}/.teamagent/.warmup-state.json"

# Require sqlite3 and jq
for bin in sqlite3 jq; do
  if ! command -v "${bin}" >/dev/null 2>&1; then
    echo "Missing required tool: ${bin}" >&2
    exit 1
  fi
done

# --- DB snapshot ---
if [ -f "${DB}" ]; then
  sqlite3 "${DB}" ".tables" > "${EVDIR}/db-tables.txt"

  # SELECT count(*) FROM knowledge; handle missing table
  # "knowledge" is the table created by SqliteKnowledgeStore (doLoadSeed inserts rows here).
  # No "rules" table exists post-init; using "rules" always returns 0 or errors.
  rule_count=$(sqlite3 "${DB}" "SELECT count(*) FROM knowledge;" 2>/dev/null || echo "0")
  # sqlite3 exits non-zero when table missing; strip any error text
  case "${rule_count}" in
    ''|*[!0-9]*) rule_count=0 ;;
  esac
  echo "${rule_count}" > "${EVDIR}/db-rule-count.txt"
else
  echo "(absent)" > "${EVDIR}/db-tables.txt"
  echo "(absent)" > "${EVDIR}/db-rule-count.txt"
fi

# --- Warmup state snapshot ---
if [ -f "${STATE}" ]; then
  jq -r 'to_entries|map("\(.key)=\(.value|tostring)")|.[]' < "${STATE}" \
    > "${EVDIR}/warmup-state.kv"
else
  echo "(absent)" > "${EVDIR}/warmup-state.kv"
fi

# Final exit: ensure mandatory evidence is present and meaningful.
TABLES_TXT="${EVDIR}/db-tables.txt"
COUNT_TXT="${EVDIR}/db-rule-count.txt"
if [ ! -f "${TABLES_TXT}" ] || grep -q '^(absent)$' "${TABLES_TXT}" || ! grep -q 'knowledge' "${TABLES_TXT}"; then
  echo "verify-db-content: knowledge.db missing or schema invalid" >&2
  exit 1
fi
COUNT=$(cat "${COUNT_TXT}" 2>/dev/null || echo 0)
case "${COUNT}" in
  ''|*[!0-9]*) echo "verify-db-content: rule count is non-numeric: ${COUNT}" >&2; exit 1 ;;
esac
if [ "${COUNT}" -lt 1 ]; then
  echo "verify-db-content: rule count is 0 (seed not loaded)" >&2
  exit 1
fi
exit 0
