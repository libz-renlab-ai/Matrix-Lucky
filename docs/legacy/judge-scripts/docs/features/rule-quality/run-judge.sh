#!/usr/bin/env bash
# Rule-Quality Validator — Prod E2E Judge Harness
# 5 defect categories × 2 = 10 defective rules + 10 clean rules.
# Asserts: recall ≥ 0.8 (≥8/10 defects caught), false_positives = 0 (0/10 clean flagged).
# Emits: .judge/<run_id>/judge.json with per-category recall + overall metrics.
#
# Usage:  bash docs/features/rule-quality/run-judge.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUN_ID="rule-quality-$(date +%Y%m%dT%H%M%S)-$$"
EVIDENCE_DIR="$REPO_ROOT/.judge/$RUN_ID"
JUDGE_FILE="$EVIDENCE_DIR/judge.json"
STDOUT_FILE="$EVIDENCE_DIR/stdout.log"
RUNNER="$EVIDENCE_DIR/runner.mjs"
TSX="$REPO_ROOT/node_modules/.bin/tsx"

mkdir -p "$EVIDENCE_DIR"
exec > >(tee "$STDOUT_FILE") 2>&1

echo "=== rule-quality-validator e2e judge harness ==="
echo "run_id=$RUN_ID"
echo "evidence_dir=$EVIDENCE_DIR"

# Write the TypeScript evaluator as plain .mjs (tsx handles it as ESM TS)
python3 - "$REPO_ROOT" "$RUNNER" << 'GENEOF'
import sys, textwrap
repo, runner = sys.argv[1], sys.argv[2]

code = textwrap.dedent(f"""
import {{ validateLevel0 }} from "{repo}/packages/core/src/validator/l0.js";
import {{ writeFileSync }} from "node:fs";

// ── base helpers ──────────────────────────────────────────────────────────
const CLEAN_SCOPE = {{ level: "team", paths: ["src/**"], file_types: ["ts"] }};
const PROJECT_STACK = ["ts", "tsx"];
// sourceText that makes wrong_pattern lookup pass for non-conflict defects
const SOURCE_SAFE = "avoidance-anchor-token-wxyz present here for pattern matching purposes";

function base(id, ov) {{
  return Object.assign({{
    id,
    scope: CLEAN_SCOPE,
    type: "avoidance",
    trigger: "trigger-" + id,
    wrong_pattern: "avoidance-anchor-token-wxyz",
    correct_pattern: "preferred-alternative-" + id,
    confidence: 0.8,
  }}, ov || {{}});
}}

// ── 10 DEFECTIVE rules (2 per category) ──────────────────────────────────
// Each entry carries a `defect_category` tag for per-category recall reporting.

const EXISTING_FOR_CONFLICT = [
  {{ id: "ex-r1", trigger: "fetch-vs-axios", wrong_pattern: "axios fetch alternative import library" }},
];

const defective = [
  // (a) empty_wrong_pattern: avoidance rule with no wrong_pattern
  Object.assign(base("d-ewp-1", {{ wrong_pattern: "" }}),         {{ defect_category: "empty_wrong_pattern" }}),
  Object.assign(base("d-ewp-2", {{ wrong_pattern: undefined }}),  {{ defect_category: "empty_wrong_pattern" }}),

  // (b) identical_patterns: wrong_pattern === correct_pattern
  Object.assign(base("d-ip-1", {{ wrong_pattern: "avoidance-anchor-token-wxyz", correct_pattern: "avoidance-anchor-token-wxyz" }}), {{ defect_category: "identical_patterns" }}),
  Object.assign(base("d-ip-2", {{ wrong_pattern: "shared-token-both", correct_pattern: "shared-token-both" }}),                     {{ defect_category: "identical_patterns" }}),

  // (c) confidence_range: outside [0,1]
  Object.assign(base("d-cr-1", {{ confidence: 1.5 }}),            {{ defect_category: "confidence_range" }}),
  Object.assign(base("d-cr-2", {{ confidence: -0.1 }}),           {{ defect_category: "confidence_range" }}),

  // (d) missing_fields: required field empty/absent
  Object.assign(base("d-mf-1", {{ trigger: "" }}),                 {{ defect_category: "missing_fields" }}),
  Object.assign(base("d-mf-2", {{ correct_pattern: "" }}),         {{ defect_category: "missing_fields" }}),

  // (e) embedding_conflict: Jaccard ≥ 0.85 against existing rule
  Object.assign(base("d-ec-1", {{
    trigger: "fetch-vs-axios",
    wrong_pattern: "axios fetch alternative import library",
  }}), {{ defect_category: "embedding_conflict" }}),
  Object.assign(base("d-ec-2", {{
    trigger: "axios-fetch-vs",
    wrong_pattern: "fetch library alternative axios import",
  }}), {{ defect_category: "embedding_conflict" }}),
];

// ── 10 CLEAN rules ────────────────────────────────────────────────────────
const clean = Array.from({{ length: 10 }}, (_, i) => base("c-" + (i+1), {{
  trigger: "clean-uniq-trigger-" + (i+1),
  wrong_pattern: "clean-wrong-uniq-" + (i+1),
  correct_pattern: "clean-correct-pref-" + (i+1),
  confidence: 0.75,
}}));

// ── Run L0 over all 20 entries ─────────────────────────────────────────────
const defResults = [], cleanResults = [];

for (const e of defective) {{
  const sourceText = e.wrong_pattern
    ? SOURCE_SAFE + " " + e.wrong_pattern
    : SOURCE_SAFE;
  const r = validateLevel0({{ entry: e, sourceText, existingRules: EXISTING_FOR_CONFLICT, projectStack: PROJECT_STACK }});
  defResults.push({{ id: e.id, category: e.defect_category, detected: !r.ok, l0_ok: r.ok, failed_checks: r.failed_checks }});
}}

for (const e of clean) {{
  const sourceText = SOURCE_SAFE + " " + e.wrong_pattern;
  const r = validateLevel0({{ entry: e, sourceText, existingRules: [], projectStack: PROJECT_STACK }});
  cleanResults.push({{ id: e.id, false_positive: !r.ok, l0_ok: r.ok, failed_checks: r.failed_checks }});
}}

// ── Compute metrics ───────────────────────────────────────────────────────
const CATEGORIES = ["empty_wrong_pattern","identical_patterns","confidence_range","missing_fields","embedding_conflict"];
const perCategoryRecall = {{}};
for (const cat of CATEGORIES) {{
  const catCases = defResults.filter(r => r.category === cat);
  const caught = catCases.filter(r => r.detected).length;
  perCategoryRecall[cat] = catCases.length > 0 ? caught / catCases.length : 0;
}}

const defectsCaught = defResults.filter(r => r.detected).length;
const falsePositives = cleanResults.filter(r => r.false_positive).length;
const overallRecall = defectsCaught / defResults.length;
const overallPrecision = defectsCaught / (defectsCaught + falsePositives) || 1;
const pass = overallRecall >= 0.8 && falsePositives === 0;

// ── Print detail ──────────────────────────────────────────────────────────
console.log("\\n── Per-rule detail ────────────────────────────────────────────");
for (const r of defResults) {{
  console.log("  [defect] " + r.id.padEnd(12) + (r.detected ? "CAUGHT    " : "MISSED    ") + "cat=" + r.category + " checks=" + JSON.stringify(r.failed_checks));
}}
for (const r of cleanResults) {{
  console.log("  [clean]  " + r.id.padEnd(12) + (r.false_positive ? "FALSE_POS " : "OK        ") + "checks=" + JSON.stringify(r.failed_checks));
}}

console.log("\\n── Per-category recall ────────────────────────────────────────");
for (const cat of CATEGORIES) {{
  console.log("  " + cat.padEnd(25) + " recall=" + perCategoryRecall[cat].toFixed(2));
}}

console.log("\\n── Overall ─────────────────────────────────────────────────────");
console.log("  defects_caught    = " + defectsCaught + "/10");
console.log("  false_positives   = " + falsePositives + "/10");
console.log("  overall_recall    = " + overallRecall.toFixed(4));
console.log("  overall_precision = " + overallPrecision.toFixed(4));
console.log("  VERDICT           = " + (pass ? "PASS" : "FAIL"));

// ── Emit judge.json ───────────────────────────────────────────────────────
const judgeJson = {{
  run_id: process.env.RUN_ID,
  timestamp: new Date().toISOString(),
  exit_code: pass ? 0 : 1,
  verdict: pass ? "PASS" : "FAIL",
  metrics: {{
    defects_caught: defectsCaught,
    total_defects: 10,
    false_positives: falsePositives,
    total_clean: 10,
    overall_recall: parseFloat(overallRecall.toFixed(4)),
    overall_precision: parseFloat(overallPrecision.toFixed(4)),
    recall_threshold: 0.8,
    fp_max: 0,
  }},
  per_category_recall: Object.fromEntries(
    CATEGORIES.map(c => [c, parseFloat(perCategoryRecall[c].toFixed(4))])
  ),
  per_rule_results: {{ defective: defResults, clean: cleanResults }},
  evidence_dir: process.env.EVIDENCE_DIR,
  stdout_path: process.env.STDOUT_FILE,
}};

writeFileSync(process.env.JUDGE_FILE, JSON.stringify(judgeJson, null, 2) + "\\n");
console.log("\\njudge.json written to: " + process.env.JUDGE_FILE);
process.exit(pass ? 0 : 1);
""")
with open(runner, "w") as fh:
    fh.write(code.lstrip())
print("runner written: " + runner)
GENEOF

echo ""
echo "--- running L0 validator against 10 defective + 10 clean rules ---"

JUDGE_FILE="$JUDGE_FILE" \
RUN_ID="$RUN_ID" \
EVIDENCE_DIR="$EVIDENCE_DIR" \
STDOUT_FILE="$STDOUT_FILE" \
"$TSX" "$RUNNER"

EXIT_CODE=$?

echo ""
echo "=== judge.json ==="
cat "$JUDGE_FILE"
echo ""
echo "=== harness complete: $JUDGE_FILE (exit=$EXIT_CODE) ==="
