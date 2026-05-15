#!/usr/bin/env bash
# real-judge.sh — Third-party judge harness for real-session prod e2e auto-capture.
# Measures recall/precision of correction-detector against manually labeled real JSONL sessions.
# Usage: bash real-judge.sh
# Exit code 0 = harness ran; check judge.json for pass/fail (recall>=0.85 && precision>=0.90).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$SCRIPT_DIR/real-fixture"

GIT_COMMON_DIR="$(git -C "$SCRIPT_DIR" rev-parse --git-common-dir 2>/dev/null || true)"
if [ -n "$GIT_COMMON_DIR" ]; then
  REPO_ROOT="$(cd "$GIT_COMMON_DIR/.." && pwd)"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
fi

RUN_ID="$(date +%s)"
EVIDENCE_DIR="$REPO_ROOT/.judge/capture-real/$RUN_ID"
JUDGE_JSON="$EVIDENCE_DIR/judge.json"
PER_ROW_DIR="$EVIDENCE_DIR/per-row"
STDOUT_PATH="$EVIDENCE_DIR/stdout.txt"
STDERR_PATH="$EVIDENCE_DIR/stderr.txt"

mkdir -p "$EVIDENCE_DIR" "$PER_ROW_DIR"

echo "[real-judge] run_id=$RUN_ID fixture_dir=$FIXTURE_DIR evidence=$EVIDENCE_DIR" | tee -a "$STDOUT_PATH"

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
  echo "[real-judge] ERROR: tsx not found. Run: pnpm install" | tee -a "$STDERR_PATH"
  exit 1
fi

WORKTREE_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/../../../..")"
RUNNER_TS="$WORKTREE_ROOT/scripts/real-judge-runner.ts"

cat > "$RUNNER_TS" <<'RUNNER_EOF'
import { ruleBasedCorrectionDetector } from "../packages/core/src/index.js";
import type { ParsedSession, SessionTurn } from "../packages/core/src/index.js";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

interface FixtureRow {
  session_id: string;
  turn_index: number;
  transcript: string;
  is_correction: boolean;
  signal_type?: string;
  note?: string;
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
  signal_type?: string;
  transcript_snippet: string;
}

const fixtureDir = process.argv[2]!;
const perRowDir = process.argv[3]!;

function buildSession(row: FixtureRow): ParsedSession {
  // Build a 2-turn session with the real user message as turn 1
  const userTurn: SessionTurn = {
    turnIndex: 1,
    userMessage: row.transcript,
    assistantText: "",
    toolCalls: [],
    timestamp: new Date().toISOString(),
  };
  const prevTurn: SessionTurn = {
    turnIndex: 0,
    userMessage: "",
    assistantText:
      "I'll proceed with implementing this using axios and webpack. Let me set up the configuration files.",
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

async function loadJsonlFile(filePath: string): Promise<FixtureRow[]> {
  const rows: FixtureRow[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) rows.push(JSON.parse(trimmed) as FixtureRow);
  }
  return rows;
}

async function main() {
  // Load all *.jsonl from fixtureDir
  const files = fs.readdirSync(fixtureDir).filter((f) => f.endsWith(".jsonl"));
  console.log(`[real-judge] Loading ${files.length} fixture files from ${fixtureDir}`);

  const allRows: FixtureRow[] = [];
  for (const file of files) {
    const rows = await loadJsonlFile(path.join(fixtureDir, file));
    allRows.push(...rows);
    console.log(`  ${file}: ${rows.length} rows`);
  }

  console.log(`[real-judge] Total labeled turns: ${allRows.length}`);

  const results: RowResult[] = [];

  for (const row of allRows) {
    const session = buildSession(row);
    const moments = ruleBasedCorrectionDetector.detect(session);
    const detected = moments.length > 0;
    const expected = row.is_correction;

    const result: RowResult = {
      session_id: row.session_id,
      expected,
      detected,
      tp: expected && detected,
      fp: !expected && detected,
      tn: !expected && !detected,
      fn: expected && !detected,
      moments_count: moments.length,
      signal_type: row.signal_type,
      transcript_snippet: row.transcript.slice(0, 120),
    };
    results.push(result);

    fs.writeFileSync(
      path.join(perRowDir, `${row.session_id.replace(/[/\\:*?"<>|]/g, "_")}.json`),
      JSON.stringify({ row, moments, result }, null, 2)
    );
  }

  const tp = results.filter((r) => r.tp).length;
  const fp = results.filter((r) => r.fp).length;
  const tn = results.filter((r) => r.tn).length;
  const fn = results.filter((r) => r.fn).length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const pass = recall >= 0.85 && precision >= 0.90;

  // Show missed corrections
  const fnRows = results.filter((r) => r.fn);
  console.log(`\n[real-judge] FALSE NEGATIVES (missed corrections): ${fnRows.length}`);
  for (const r of fnRows) {
    console.log(`  FN: [${r.signal_type ?? "?"}] ${r.transcript_snippet.slice(0, 80)}`);
  }

  // Show false positives
  const fpRows = results.filter((r) => r.fp);
  console.log(`\n[real-judge] FALSE POSITIVES: ${fpRows.length}`);
  for (const r of fpRows) {
    console.log(`  FP: [${r.signal_type ?? "?"}] ${r.transcript_snippet.slice(0, 80)}`);
  }

  const judgeJson = {
    run_id: process.env["RUN_ID"] ?? "unknown",
    exit_code: 0,
    samples_count: files.length,
    labeled_turns: allRows.length,
    true_positives: tp,
    false_positives: fp,
    true_negatives: tn,
    false_negatives: fn,
    recall_real: Math.round(recall * 1000) / 1000,
    precision_real: Math.round(precision * 1000) / 1000,
    f1_real: Math.round(f1 * 1000) / 1000,
    predicted_corrections: tp + fp,
    pass,
    thresholds: { recall_min: 0.85, precision_min: 0.90 },
    evidence_dir: perRowDir,
    fn_signal_types: fnRows.map((r) => r.signal_type ?? "unknown"),
    fp_signal_types: fpRows.map((r) => r.signal_type ?? "unknown"),
    summary: results.map((r) => ({
      session_id: r.session_id,
      expected: r.expected,
      detected: r.detected,
      label: r.tp ? "TP" : r.fp ? "FP" : r.tn ? "TN" : "FN",
      signal_type: r.signal_type,
      transcript: r.transcript_snippet.slice(0, 60),
    })),
  };

  const judgeJsonPath = process.env["JUDGE_JSON_PATH"]!;
  fs.writeFileSync(judgeJsonPath, JSON.stringify(judgeJson, null, 2));
  console.log(JSON.stringify(judgeJson, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
RUNNER_EOF

echo "[real-judge] Running real-session extraction runner..." | tee -a "$STDOUT_PATH"

RUN_ID="$RUN_ID" JUDGE_JSON_PATH="$JUDGE_JSON" \
  "$TSX_BIN" \
    --tsconfig "$WORKTREE_ROOT/tsconfig.base.json" \
    "$RUNNER_TS" \
    "$FIXTURE_DIR" \
    "$PER_ROW_DIR" \
  2>>"$STDERR_PATH" | tee -a "$STDOUT_PATH"

# Cleanup temp runner
rm -f "$RUNNER_TS"

echo "" | tee -a "$STDOUT_PATH"
echo "[real-judge] judge.json written to: $JUDGE_JSON" | tee -a "$STDOUT_PATH"
echo "[real-judge] evidence dir: $EVIDENCE_DIR" | tee -a "$STDOUT_PATH"

if [ -f "$JUDGE_JSON" ]; then
  RECALL="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['recall_real'])" "$JUDGE_JSON" 2>/dev/null || echo "N/A")"
  PRECISION="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['precision_real'])" "$JUDGE_JSON" 2>/dev/null || echo "N/A")"
  F1="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['f1_real'])" "$JUDGE_JSON" 2>/dev/null || echo "N/A")"
  PASS_VAL="$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(d['pass'])" "$JUDGE_JSON" 2>/dev/null || echo "N/A")"
  echo "[real-judge] recall_real=$RECALL precision_real=$PRECISION f1_real=$F1 pass=$PASS_VAL" | tee -a "$STDOUT_PATH"
fi
