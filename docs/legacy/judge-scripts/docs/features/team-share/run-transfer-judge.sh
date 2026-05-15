#!/usr/bin/env bash
# Third-party judge harness: proves team-export -> team-import round-trips knowledge.
# Mechanical only — writes judge.json; caller reads it for PASS/FAIL verdict.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FIXTURE="$REPO_ROOT/docs/features/team-share/fixture-rules.json"
RUN_ID="$(date +%Y%m%dT%H%M%S)-$$"
EVIDENCE_DIR="$REPO_ROOT/tmp/.judge/team-transfer/$RUN_ID"
BRAIN_A="$EVIDENCE_DIR/brain-A"
BRAIN_B="$EVIDENCE_DIR/brain-B"
EXPORT_FILE="$EVIDENCE_DIR/export.json"
JUDGE_FILE="$EVIDENCE_DIR/judge.json"
STDOUT_FILE="$EVIDENCE_DIR/stdout.log"

# tsx binary from repo node_modules (keeps correct cwd when invoked directly)
TSX="$REPO_ROOT/node_modules/.bin/tsx"
BIN="$REPO_ROOT/packages/cli/src/bin.ts"

mkdir -p "$BRAIN_A/.teamagent" "$BRAIN_B/.teamagent"

# Tee stdout+stderr to log file from here on
exec > >(tee "$STDOUT_FILE") 2>&1

echo "=== team-transfer judge harness run_id=$RUN_ID ==="
echo "repo=$REPO_ROOT"
echo "fixture=$FIXTURE"

# --- step 1: import fixture bundle into brain-A ---
# Run tsx directly from BRAIN_A so process.cwd() == BRAIN_A (not repo root)
echo ""
echo "--- step 1: import fixture into brain-A (cwd=$BRAIN_A) ---"
IMPORT_A_EXIT=0
(
  cd "$BRAIN_A"
  exec "$TSX" "$BIN" team-import --file "$FIXTURE"
) || IMPORT_A_EXIT=$?
echo "import_a_exit=$IMPORT_A_EXIT"

# --- step 2: export from brain-A ---
echo ""
echo "--- step 2: team-export from brain-A (cwd=$BRAIN_A) ---"
EXPORT_EXIT=0
(
  cd "$BRAIN_A"
  exec "$TSX" "$BIN" team-export --out "$EXPORT_FILE"
) || EXPORT_EXIT=$?
echo "export_exit=$EXPORT_EXIT"

if [ -f "$EXPORT_FILE" ]; then
  echo "export file size: $(wc -c < "$EXPORT_FILE") bytes"
else
  echo "WARNING: export file not created"
fi

# --- step 3: import exported bundle into brain-B ---
echo ""
echo "--- step 3: team-import into brain-B (cwd=$BRAIN_B) ---"
IMPORT_B_EXIT=0
(
  cd "$BRAIN_B"
  exec "$TSX" "$BIN" team-import --file "$EXPORT_FILE"
) || IMPORT_B_EXIT=$?
echo "import_b_exit=$IMPORT_B_EXIT"

# --- step 4: count active team-scope rules in each brain ---
# Table name is 'knowledge', not 'knowledge_entries' (per schema.ts)
echo ""
echo "--- step 4: rule counts ---"
DB_A="$BRAIN_A/.teamagent/knowledge.db"
DB_B="$BRAIN_B/.teamagent/knowledge.db"

count_team_rules() {
  local db="$1"
  if [ ! -f "$db" ]; then echo "0"; return; fi
  node -e "
const Database = require('node:sqlite');
const db = new Database.DatabaseSync('$db');
try {
  const row = db.prepare(\"SELECT COUNT(*) as cnt FROM knowledge WHERE scope_level='team' AND status='active'\").get();
  console.log(row.cnt);
} catch(e) { console.log(0); }
db.close();
" 2>/dev/null || echo "0"
}

BRAIN_A_COUNT=$(count_team_rules "$DB_A")
BRAIN_B_COUNT=$(count_team_rules "$DB_B")
echo "brain_a_team_rules=$BRAIN_A_COUNT"
echo "brain_b_team_rules=$BRAIN_B_COUNT"

# --- step 5: compute missing/extra IDs (A->B diff) ---
get_ids() {
  local db="$1"
  if [ ! -f "$db" ]; then echo ""; return; fi
  node -e "
const Database = require('node:sqlite');
const db = new Database.DatabaseSync('$db');
try {
  const rows = db.prepare(\"SELECT id FROM knowledge WHERE scope_level='team' AND status='active' ORDER BY id\").all();
  rows.forEach(r => console.log(r.id));
} catch(e) {}
db.close();
" 2>/dev/null || echo ""
}

IDS_A_RAW=$(get_ids "$DB_A")
IDS_B_RAW=$(get_ids "$DB_B")

# Use node to compute diff JSON
DIFF_JSON=$(node --input-type=module << 'NODEOF'
import { readFileSync } from 'fs';
const raw = readFileSync('/dev/stdin', 'utf8').trim();
const [blockA, blockB] = raw.split('\n---SPLIT---\n');
const a = blockA ? blockA.split('\n').filter(Boolean) : [];
const b = blockB ? blockB.split('\n').filter(Boolean) : [];
const setB = new Set(b);
const setA = new Set(a);
const missing = a.filter(id => !setB.has(id));
const extra = b.filter(id => !setA.has(id));
console.log(JSON.stringify({ missing_rule_ids: missing, extra_rule_ids: extra }));
NODEOF
<<< "${IDS_A_RAW}
---SPLIT---
${IDS_B_RAW}")

MISSING=$(echo "$DIFF_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d['missing_rule_ids']))" 2>/dev/null || echo "[]")
EXTRA=$(echo "$DIFF_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d['extra_rule_ids']))" 2>/dev/null || echo "[]")

echo "missing_rule_ids=$MISSING"
echo "extra_rule_ids=$EXTRA"

# --- step 6: write judge.json ---
cat > "$JUDGE_FILE" << ENDJSON
{
  "run_id": "$RUN_ID",
  "exit_codes": {
    "import_fixture_to_a": $IMPORT_A_EXIT,
    "export": $EXPORT_EXIT,
    "import_to_b": $IMPORT_B_EXIT
  },
  "brain_a_rule_count": $BRAIN_A_COUNT,
  "brain_b_rule_count": $BRAIN_B_COUNT,
  "missing_rule_ids": $MISSING,
  "extra_rule_ids": $EXTRA,
  "evidence_dir": "$EVIDENCE_DIR",
  "stdout_path": "$STDOUT_FILE"
}
ENDJSON

echo ""
echo "=== judge.json ==="
cat "$JUDGE_FILE"
echo ""
echo "=== harness complete: $JUDGE_FILE ==="
