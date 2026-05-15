#!/usr/bin/env bash
# Calibrator v2 judge harness.
# Verifies that confidence/demerit actually moves for rules with negative signals.
# Mechanical only — no LLM in assertions.
# Usage: bash docs/features/calibrator-v2/run-judge.sh [run-id]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../" && pwd)"
cd "$REPO_ROOT"

RUN_ID="${1:-calib-$(date +%s)}"
ISOLATED_HOME="$REPO_ROOT/tmp/.judge/calib/$RUN_ID/home"
ISOLATED_CWD="$REPO_ROOT/tmp/.judge/calib/$RUN_ID/cwd"
EVIDENCE_DIR="$REPO_ROOT/.judge/calib/$RUN_ID"

mkdir -p "$ISOLATED_HOME/.teamagent" "$ISOLATED_CWD/.teamagent" "$EVIDENCE_DIR"

PROJECT_DB="$ISOLATED_CWD/.teamagent/knowledge.db"
GLOBAL_DB="$ISOLATED_HOME/.teamagent/global.db"
EVENTS_DB="$ISOLATED_HOME/.teamagent/events.db"
PRE_JSON="$EVIDENCE_DIR/pre.json"
POST_JSON="$EVIDENCE_DIR/post.json"
CAL_JSON="$EVIDENCE_DIR/calibrate.json"
JUDGE_JSON="$EVIDENCE_DIR/judge.json"

# TypeScript helper files live next to this script so imports resolve from repo root
SCRIPT_DIR="$REPO_ROOT/docs/features/calibrator-v2"
TSCONFIG="$REPO_ROOT/packages/cli/tsconfig.json"
CLI_DIR="$REPO_ROOT/packages/cli"

echo "run_id: $RUN_ID"
echo "evidence_dir: $EVIDENCE_DIR"

# Helper: run tsx from CLI_DIR so pnpm workspace @teamagent/* packages resolve
tsx_run() {
  local script="$1"; shift
  (cd "$CLI_DIR" && env "$@" pnpm exec tsx --tsconfig "$TSCONFIG" "$script")
}

# ── Step 1: Seed ─────────────────────────────────────────────────────────────
echo "--- seeding fixtures ---"
tsx_run "$SCRIPT_DIR/_seed.ts" \
  PROJECT_DB="$PROJECT_DB" GLOBAL_DB="$GLOBAL_DB" EVENTS_DB="$EVENTS_DB"

# ── Step 2: Pre snapshot ──────────────────────────────────────────────────────
echo "--- pre-calibrate snapshot ---"
tsx_run "$SCRIPT_DIR/_snap.ts" \
  PROJECT_DB="$PROJECT_DB" GLOBAL_DB="$GLOBAL_DB" SNAP_OUT="$PRE_JSON"

# ── Step 3: Calibrate ────────────────────────────────────────────────────────
echo "--- calibrate ---"
tsx_run "$SCRIPT_DIR/_calibrate.ts" \
  PROJECT_DB="$PROJECT_DB" GLOBAL_DB="$GLOBAL_DB" EVENTS_DB="$EVENTS_DB" CAL_OUT="$CAL_JSON"

# ── Step 4: Post snapshot ─────────────────────────────────────────────────────
echo "--- post-calibrate snapshot ---"
tsx_run "$SCRIPT_DIR/_snap.ts" \
  PROJECT_DB="$PROJECT_DB" GLOBAL_DB="$GLOBAL_DB" SNAP_OUT="$POST_JSON"

# ── Step 5: Mechanical assertions ────────────────────────────────────────────
echo "--- mechanical assertions ---"
EXIT_CODE=0
tsx_run "$SCRIPT_DIR/_assert.ts" \
  PRE_JSON="$PRE_JSON" POST_JSON="$POST_JSON" CAL_JSON="$CAL_JSON" \
  JUDGE_JSON="$JUDGE_JSON" EVIDENCE_DIR="$EVIDENCE_DIR" \
  PRE_STATS_PATH="$PRE_JSON" POST_STATS_PATH="$POST_JSON" RUN_ID="$RUN_ID" \
  || EXIT_CODE=$?

echo ""
echo "judge.json: $JUDGE_JSON"
cat "$JUDGE_JSON"
exit $EXIT_CODE
