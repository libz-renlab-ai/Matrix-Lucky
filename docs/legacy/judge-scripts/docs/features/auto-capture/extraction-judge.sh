#!/usr/bin/env bash
# extraction-judge.sh — Third-party judge harness for auto-capture correction extraction.
# Mechanical only: runs the detector, compares vs labels, writes judge.json.
# Usage: bash extraction-judge.sh [FIXTURE_PATH] [MODULE_OVERRIDE]
#   FIXTURE_PATH defaults to labeled-fixture.jsonl next to this script.
#   MODULE_OVERRIDE: path to compiled JS entrypoint that exports ruleBasedCorrectionDetector.
#   Set PROD_SESSION_DIR env to override real session JSONL directory.
# Exit code 0 = harness ran; check judge.json for pass/fail.
# Thresholds: recall >= 0.85, precision >= 0.90 on prod fixture.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Worktrees share node_modules with the main repo. Resolve via git common dir.
GIT_COMMON_DIR="$(git -C "$SCRIPT_DIR" rev-parse --git-common-dir 2>/dev/null || true)"
if [ -n "$GIT_COMMON_DIR" ]; then
  REPO_ROOT="$(cd "$GIT_COMMON_DIR/.." && pwd)"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
fi

FIXTURE="${1:-$SCRIPT_DIR/labeled-fixture.jsonl}"
PROD_FIXTURE="$SCRIPT_DIR/prod-fixture.jsonl"
SESSION_DIR="${PROD_SESSION_DIR:-$HOME/.claude/projects/-Users-m1-projects-TeamBrain}"
GEN_SCRIPT="$REPO_ROOT/scripts/gen-prod-fixture.cjs"

RUN_ID="$(date +%s)"
EVIDENCE_DIR="$REPO_ROOT/.judge/capture/$RUN_ID"
JUDGE_JSON="$EVIDENCE_DIR/judge.json"
PER_ROW_DIR="$EVIDENCE_DIR/per-row"
PER_ROW_PROD_DIR="$EVIDENCE_DIR/per-row-prod"
STDOUT_PATH="$EVIDENCE_DIR/stdout.txt"
STDERR_PATH="$EVIDENCE_DIR/stderr.txt"

mkdir -p "$EVIDENCE_DIR" "$PER_ROW_DIR" "$PER_ROW_PROD_DIR"

echo "[judge] run_id=$RUN_ID fixture=$FIXTURE evidence=$EVIDENCE_DIR" | tee -a "$STDOUT_PATH"

# ---------------------------------------------------------------------------
# Build the repo if needed
# ---------------------------------------------------------------------------
if [ ! -f "$REPO_ROOT/node_modules/.bin/tsx" ] && [ ! -f "$REPO_ROOT/node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs" ]; then
  echo "[judge] Running pnpm install..." | tee -a "$STDOUT_PATH"
  (cd "$REPO_ROOT" && pnpm install --frozen-lockfile 2>>"$STDERR_PATH") || true
fi

# Resolve tsx
TSX_BIN=""
if command -v tsx &>/dev/null; then
  TSX_BIN="tsx"
elif [ -f "$REPO_ROOT/node_modules/.bin/tsx" ]; then
  TSX_BIN="$REPO_ROOT/node_modules/.bin/tsx"
else
  TSX_BIN="$(find "$REPO_ROOT/node_modules/.pnpm" -name "tsx" -path "*/bin/tsx" 2>/dev/null | head -1 || true)"
fi

if [ -z "$TSX_BIN" ]; then
  echo "[judge] ERROR: tsx not found. Run: pnpm install" | tee -a "$STDERR_PATH"
  exit 1
fi

# ---------------------------------------------------------------------------
# Generate prod fixture if it doesn't exist or SESSION_DIR changed
# ---------------------------------------------------------------------------
if [ ! -f "$PROD_FIXTURE" ]; then
  echo "[judge] Generating prod fixture from $SESSION_DIR ..." | tee -a "$STDOUT_PATH"
  if [ -f "$GEN_SCRIPT" ]; then
    PROD_SESSION_DIR="$SESSION_DIR" node "$GEN_SCRIPT" "$PROD_FIXTURE" 2>>"$STDERR_PATH" | tee -a "$STDOUT_PATH" || true
  else
    echo "[judge] WARN: gen-prod-fixture.cjs not found; prod fixture will be skipped" | tee -a "$STDOUT_PATH"
  fi
fi

# ---------------------------------------------------------------------------
# Inline runner script. Place it inside the worktree's scripts/ so that
# relative imports to packages/core/src/index.js resolve correctly
# (same pattern used by scripts/evaluate-detectors.ts).
# ---------------------------------------------------------------------------
WORKTREE_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/../../../..")"
RUNNER_TS="$WORKTREE_ROOT/scripts/extraction-judge-runner.ts"
cat > "$RUNNER_TS" <<'RUNNER_EOF'
import { ruleBasedCorrectionDetector } from "../packages/core/src/index.js";
import type { ParsedSession, SessionTurn } from "../packages/core/src/index.js";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

interface FixtureRow {
  session_id: string;
  transcript: string;
  expected_correction: boolean;
  expected_rule_keyword?: string;
  source?: string;
}

interface RowResult {
  session_id: string;
  expected: boolean;
  detected: boolean;
  tp: boolean;
  fp: boolean;
  tn: boolean;
  fn: boolean;
  moments_count: number;
  transcript_snippet: string;
  source?: string;
}

const fixturePath = process.argv[2]!;
const perRowDir = process.argv[3]!;
const label = process.argv[4] ?? "labeled";

function buildSession(row: FixtureRow): ParsedSession {
  // Build a minimal 2-turn session:
  //   turn 0: dummy assistant turn (sets up context)
  //   turn 1: the user correction message we want to detect
  const userTurn: SessionTurn = {
    turnIndex: 1,
    userMessage: row.transcript.replace(/^User:\s*/i, ""),
    assistantText: "",
    toolCalls: [],
    timestamp: new Date().toISOString(),
  };
  const prevTurn: SessionTurn = {
    turnIndex: 0,
    userMessage: "",
    assistantText: "Sure, I can help with that.",
    toolCalls: [],
    timestamp: new Date(Date.now() - 5000).toISOString(),
  };
  return {
    sessionId: row.session_id,
    turns: [prevTurn, userTurn],
    startTime: prevTurn.timestamp,
    endTime: userTurn.timestamp,
  };
}

async function main() {
  const rows: FixtureRow[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(fixturePath) });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) rows.push(JSON.parse(trimmed) as FixtureRow);
  }

  const results: RowResult[] = [];

  for (const row of rows) {
    const session = buildSession(row);
    const moments = ruleBasedCorrectionDetector.detect(session);
    const detected = moments.length > 0;
    const expected = row.expected_correction;

    const result: RowResult = {
      session_id: row.session_id,
      expected,
      detected,
      tp: expected && detected,
      fp: !expected && detected,
      tn: !expected && !detected,
      fn: expected && !detected,
      moments_count: moments.length,
      transcript_snippet: row.transcript.slice(0, 120),
      source: row.source,
    };
    results.push(result);
    fs.writeFileSync(
      path.join(perRowDir, `${row.session_id}.json`),
      JSON.stringify({ row, moments, result }, null, 2)
    );
  }

  const tp = results.filter((r) => r.tp).length;
  const fp = results.filter((r) => r.fp).length;
  const tn = results.filter((r) => r.tn).length;
  const fn = results.filter((r) => r.fn).length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const judgeJson = {
    run_id: process.env["RUN_ID"] ?? "unknown",
    label,
    exit_code: 0,
    true_positives: tp,
    false_positives: fp,
    true_negatives: tn,
    false_negatives: fn,
    recall: Math.round(recall * 1000) / 1000,
    precision: Math.round(precision * 1000) / 1000,
    f1: Math.round(f1 * 1000) / 1000,
    total_rows: results.length,
    evidence_dir: perRowDir,
    per_row_path: perRowDir,
    false_negative_session_ids: results.filter((r) => r.fn).map((r) => r.session_id),
    false_positive_session_ids: results.filter((r) => r.fp).map((r) => r.session_id),
    summary: results.map((r) => ({
      session_id: r.session_id,
      expected: r.expected,
      detected: r.detected,
      label: r.tp ? "TP" : r.fp ? "FP" : r.tn ? "TN" : "FN",
      source: r.source,
    })),
  };

  const judgeJsonPath = process.env["JUDGE_JSON_PATH"]!;
  fs.writeFileSync(judgeJsonPath, JSON.stringify(judgeJson, null, 2));
  console.log(JSON.stringify(judgeJson, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
RUNNER_EOF

# ---------------------------------------------------------------------------
# Pass 1: labeled fixture
# ---------------------------------------------------------------------------
echo "[judge] Running extraction runner (labeled)..." | tee -a "$STDOUT_PATH"

LABELED_JUDGE_JSON="$EVIDENCE_DIR/judge-labeled.json"
RUN_ID="$RUN_ID" JUDGE_JSON_PATH="$LABELED_JUDGE_JSON" \
  "$TSX_BIN" \
    --tsconfig "$WORKTREE_ROOT/tsconfig.base.json" \
    "$RUNNER_TS" \
    "$FIXTURE" \
    "$PER_ROW_DIR" \
    "labeled" \
  2>>"$STDERR_PATH" | tee -a "$STDOUT_PATH"

# ---------------------------------------------------------------------------
# Pass 2: prod fixture (if available)
# ---------------------------------------------------------------------------
PROD_JUDGE_JSON="$EVIDENCE_DIR/judge-prod.json"
PROD_RECALL="N/A"
PROD_PRECISION="N/A"
PROD_F1="N/A"
PROD_PASS="false"

if [ -f "$PROD_FIXTURE" ]; then
  echo "[judge] Running extraction runner (prod)..." | tee -a "$STDOUT_PATH"
  RUN_ID="$RUN_ID" JUDGE_JSON_PATH="$PROD_JUDGE_JSON" \
    "$TSX_BIN" \
      --tsconfig "$WORKTREE_ROOT/tsconfig.base.json" \
      "$RUNNER_TS" \
      "$PROD_FIXTURE" \
      "$PER_ROW_PROD_DIR" \
      "prod" \
    2>>"$STDERR_PATH" | tee -a "$STDOUT_PATH"

  # Read prod metrics
  if [ -f "$PROD_JUDGE_JSON" ]; then
    PROD_RECALL="$(node -e "const d=JSON.parse(require('fs').readFileSync('$PROD_JUDGE_JSON','utf8')); console.log(d.recall);" 2>/dev/null || echo "N/A")"
    PROD_PRECISION="$(node -e "const d=JSON.parse(require('fs').readFileSync('$PROD_JUDGE_JSON','utf8')); console.log(d.precision);" 2>/dev/null || echo "N/A")"
    PROD_F1="$(node -e "const d=JSON.parse(require('fs').readFileSync('$PROD_JUDGE_JSON','utf8')); console.log(d.f1);" 2>/dev/null || echo "N/A")"

    # Assert thresholds: recall >= 0.85 AND precision >= 0.90
    PROD_PASS="$(node -e "
const d=JSON.parse(require('fs').readFileSync('$PROD_JUDGE_JSON','utf8'));
const pass = d.recall >= 0.85 && d.precision >= 0.90;
console.log(pass ? 'true' : 'false');
" 2>/dev/null || echo "false")"
  fi
else
  echo "[judge] WARN: prod fixture not found; skipping prod pass" | tee -a "$STDOUT_PATH"
fi

# Cleanup temp runner
rm -f "$RUNNER_TS"

# ---------------------------------------------------------------------------
# Merge into combined judge.json
# ---------------------------------------------------------------------------
node -e "
const fs = require('fs');
const labeled = JSON.parse(fs.readFileSync('$LABELED_JUDGE_JSON', 'utf8'));
const prodExists = fs.existsSync('$PROD_JUDGE_JSON');
const prod = prodExists ? JSON.parse(fs.readFileSync('$PROD_JUDGE_JSON', 'utf8')) : null;

const combined = {
  run_id: labeled.run_id,
  exit_code: 0,
  labeled: {
    recall: labeled.recall,
    precision: labeled.precision,
    f1: labeled.f1,
    true_positives: labeled.true_positives,
    false_positives: labeled.false_positives,
    true_negatives: labeled.true_negatives,
    false_negatives: labeled.false_negatives,
    total_rows: labeled.total_rows,
    false_negative_session_ids: labeled.false_negative_session_ids,
    false_positive_session_ids: labeled.false_positive_session_ids,
  },
  prod: prod ? {
    recall: prod.recall,
    precision: prod.precision,
    f1: prod.f1,
    true_positives: prod.true_positives,
    false_positives: prod.false_positives,
    true_negatives: prod.true_negatives,
    false_negatives: prod.false_negatives,
    total_rows: prod.total_rows,
    false_negative_session_ids: prod.false_negative_session_ids,
    false_positive_session_ids: prod.false_positive_session_ids,
    recall_pass: prod.recall >= 0.85,
    precision_pass: prod.precision >= 0.90,
    thresholds_pass: prod.recall >= 0.85 && prod.precision >= 0.90,
  } : null,
  prod_mode: prodExists,
  evidence_dir: '$EVIDENCE_DIR',
  stdout_path: '$STDOUT_PATH',
  stderr_path: '$STDERR_PATH',
};
fs.writeFileSync('$JUDGE_JSON', JSON.stringify(combined, null, 2));
console.log(JSON.stringify(combined, null, 2));
" 2>>"$STDERR_PATH" | tee -a "$STDOUT_PATH"

echo "" | tee -a "$STDOUT_PATH"
echo "[judge] judge.json written to: $JUDGE_JSON" | tee -a "$STDOUT_PATH"
echo "[judge] evidence dir: $EVIDENCE_DIR" | tee -a "$STDOUT_PATH"

# Print labeled summary
if [ -f "$LABELED_JUDGE_JSON" ]; then
  RECALL="$(node -e "const d=JSON.parse(require('fs').readFileSync('$LABELED_JUDGE_JSON','utf8')); console.log(d.recall);" 2>/dev/null || echo "N/A")"
  PRECISION="$(node -e "const d=JSON.parse(require('fs').readFileSync('$LABELED_JUDGE_JSON','utf8')); console.log(d.precision);" 2>/dev/null || echo "N/A")"
  F1="$(node -e "const d=JSON.parse(require('fs').readFileSync('$LABELED_JUDGE_JSON','utf8')); console.log(d.f1);" 2>/dev/null || echo "N/A")"
  echo "[judge] labeled: recall=$RECALL precision=$PRECISION f1=$F1" | tee -a "$STDOUT_PATH"
fi

echo "[judge] prod: recall=$PROD_RECALL precision=$PROD_PRECISION f1=$PROD_F1 pass=$PROD_PASS" | tee -a "$STDOUT_PATH"

# Exit non-zero if prod thresholds failed
if [ "$PROD_PASS" = "false" ] && [ -f "$PROD_FIXTURE" ]; then
  echo "[judge] FAIL: prod thresholds not met (need recall>=0.85 AND precision>=0.90)" | tee -a "$STDOUT_PATH"
  exit 1
fi

echo "[judge] PASS" | tee -a "$STDOUT_PATH"
