#!/usr/bin/env bash
# Third-party judge harness for PII redaction feature.
# Runs vitest, applies redactor to fixture, checks for leaked PII strings,
# writes machine-readable judge.json. Never lets LLM grade — purely mechanical.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
JUDGE_DIR="$REPO_ROOT/.judge/pii/$RUN_ID"
mkdir -p "$JUDGE_DIR"

VITEST_JSON="$JUDGE_DIR/vitest.json"
FIXTURE_FILE="$JUDGE_DIR/fixture.txt"
REDACTED_FILE="$JUDGE_DIR/redacted.txt"
JUDGE_JSON="$JUDGE_DIR/judge.json"
STDOUT_LOG="$JUDGE_DIR/stdout.log"

echo "=== PII Redaction Judge Harness (run_id=$RUN_ID) ===" | tee "$STDOUT_LOG"

# ── Step A: run vitest ────────────────────────────────────────────────────────
echo "--- vitest run ---" | tee -a "$STDOUT_LOG"
cd "$REPO_ROOT"
VITEST_PASS=0
VITEST_FAIL=0
VITEST_EXIT=0
pnpm vitest run packages/core/src/pii/__tests__/redactor.test.ts \
  --reporter=json --outputFile="$VITEST_JSON" 2>>"$STDOUT_LOG" || VITEST_EXIT=$?

if [ -f "$VITEST_JSON" ]; then
  VITEST_PASS=$(node -e "const d=JSON.parse(require('fs').readFileSync('$VITEST_JSON','utf8')); console.log(d.numPassedTests ?? 0)")
  VITEST_FAIL=$(node -e "const d=JSON.parse(require('fs').readFileSync('$VITEST_JSON','utf8')); console.log(d.numFailedTests ?? 0)")
fi
echo "vitest: passed=$VITEST_PASS failed=$VITEST_FAIL exit=$VITEST_EXIT" | tee -a "$STDOUT_LOG"

# ── Step B: generate fixture with 6 PII patterns ─────────────────────────────
# Patterns embedded in plausible team-knowledge text:
#   1. email
#   2. AWS access key (AKIA...)
#   3. JWT (header.payload.signature)
#   4. US phone number
#   5. credit card number
#   6. UUID

EMAIL="alice.devops@acme-corp.com"
AWS_KEY="AKIAIOSFODNN7EXAMPLE"
JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
PHONE="+1-415-555-0172"
CC="4532015112830366"
UUID="550e8400-e29b-41d4-a716-446655440000"

cat > "$FIXTURE_FILE" <<EOF
== Team Knowledge Entry: Deployment Runbook v3 ==

Owner: $EMAIL
AWS credentials for staging: ACCESS_KEY=$AWS_KEY
Auth token for internal API: $JWT
On-call contact: $PHONE
Test payment method: $CC
Deploy correlation ID: $UUID

Steps:
1. Run 'pnpm deploy:staging' from the repo root.
2. Verify health endpoint returns 200.
3. Notify $EMAIL when done.
EOF

echo "fixture written to $FIXTURE_FILE (6 PII patterns)" | tee -a "$STDOUT_LOG"
FIXTURE_PII_COUNT=6

# ── Step C: pipe fixture through redactor ────────────────────────────────────
echo "--- running redactor ---" | tee -a "$STDOUT_LOG"
npx tsx "$REPO_ROOT/scripts/pii-redact-fixture.ts" < "$FIXTURE_FILE" > "$REDACTED_FILE" 2>>"$STDOUT_LOG"
echo "redacted output written to $REDACTED_FILE" | tee -a "$STDOUT_LOG"

# ── Step D: grep for original PII strings ────────────────────────────────────
echo "--- checking for leaked PII ---" | tee -a "$STDOUT_LOG"
LEAKED_COUNT=0
LEAKED_PATTERNS=()

check_leak() {
  local label="$1"
  local pattern="$2"
  if grep -qF "$pattern" "$REDACTED_FILE" 2>/dev/null; then
    echo "LEAK [$label]: $pattern" | tee -a "$STDOUT_LOG"
    LEAKED_PATTERNS+=("$label:$pattern")
    LEAKED_COUNT=$((LEAKED_COUNT + 1))
  else
    echo "OK   [$label]: not found in redacted output" | tee -a "$STDOUT_LOG"
  fi
}

check_leak "email"       "$EMAIL"
check_leak "aws_key"     "$AWS_KEY"
check_leak "jwt"         "$JWT"
check_leak "phone"       "$PHONE"
check_leak "credit_card" "$CC"
check_leak "uuid"        "$UUID"

# ── Step E: write judge.json ─────────────────────────────────────────────────
FINAL_EXIT=0
if [ "$LEAKED_COUNT" -gt 0 ] || [ "$VITEST_FAIL" -gt 0 ]; then
  FINAL_EXIT=1
fi

LEAKED_JSON="["
for i in "${!LEAKED_PATTERNS[@]}"; do
  [ $i -gt 0 ] && LEAKED_JSON+=","
  LEAKED_JSON+="\"${LEAKED_PATTERNS[$i]}\""
done
LEAKED_JSON+="]"

cat > "$JUDGE_JSON" <<EOF
{
  "run_id": "$RUN_ID",
  "exit_code": $FINAL_EXIT,
  "vitest_pass_count": $VITEST_PASS,
  "vitest_fail_count": $VITEST_FAIL,
  "fixture_pii_count": $FIXTURE_PII_COUNT,
  "leaked_pii_count": $LEAKED_COUNT,
  "leaked_patterns": $LEAKED_JSON,
  "evidence_dir": "$JUDGE_DIR",
  "stdout_path": "$STDOUT_LOG"
}
EOF

echo "--- judge.json written ---" | tee -a "$STDOUT_LOG"
cat "$JUDGE_JSON" | tee -a "$STDOUT_LOG"

echo "=== harness complete: exit_code=$FINAL_EXIT ===" | tee -a "$STDOUT_LOG"
exit $FINAL_EXIT
