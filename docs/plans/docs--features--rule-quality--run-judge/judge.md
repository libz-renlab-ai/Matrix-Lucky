# Judge Playbook: rule-quality/run-judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/rule-quality/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/rule-quality/run-judge.sh`
- Original purpose: E2E validator that runs the L0 rule-quality checker against 10 defective rules (5 categories × 2) and 10 clean rules, asserting recall ≥ 0.8 and false_positives = 0.
- Status: **ACTIVE**

## §V1 RUN
Concrete commands from source:

- Step 1: Set `RUN_ID=rule-quality-$(date +%Y%m%dT%H%M%S)-$$` and `EVIDENCE_DIR=.judge/$RUN_ID/`.
  ```bash
  RUN_ID="rule-quality-$(date +%Y%m%dT%H%M%SZ)-$$"
  EVIDENCE_DIR=".judge/$RUN_ID"
  mkdir -p "$EVIDENCE_DIR"
  ```

- Step 2: Generate a TypeScript evaluator (`runner.mjs`) that imports `validateLevel0` from
  `packages/core/src/validator/l0.js`. The evaluator constructs:
  - 10 defective rules across 5 categories: `empty_wrong_pattern` (2), `identical_patterns` (2),
    `confidence_range` (2), `missing_fields` (2), `embedding_conflict` (2).
  - 10 clean rules with unique triggers, valid patterns, and `confidence: 0.75`.

  **API contract (as of M5)**: each call must use the new signature:
  ```ts
  // INPUT — pass an object with these keys (NOT a bare `rule` key):
  const result = validateLevel0({
    entry,          // Partial<KnowledgeEntry> — the rule under test
    sourceText,     // string — source text containing (or not) the wrong_pattern
    existingRules,  // Pick<KnowledgeEntry, "id"|"trigger"|"wrong_pattern">[]
    projectStack,   // string[] — e.g. ["ts","tsx","js"]
  });

  // OUTPUT — read these keys (NOT `valid` or `errors`):
  result.ok            // boolean — true = passed all checks
  result.failed_checks // string[] — list of failed check names, empty when ok=true
  ```
  Do NOT use the old API shape `validateLevel0({rule})` → `{valid, errors}` — that was
  removed prior to M5 and will cause a TypeScript compile error.

- Step 3: Run the evaluator via `tsx`:
  ```bash
  JUDGE_FILE="$EVIDENCE_DIR/judge.json" \
  RUN_ID="$RUN_ID" \
  EVIDENCE_DIR="$EVIDENCE_DIR" \
  STDOUT_FILE="$EVIDENCE_DIR/stdout.log" \
  node_modules/.bin/tsx "$EVIDENCE_DIR/runner.mjs" 2>&1 | tee "$EVIDENCE_DIR/stdout.log"
  ```

- Step 4: The evaluator writes `judge.json` and exits 0 (PASS) or 1 (FAIL).

Capture to `evidence_dir = .judge/<run_id>/`.

## §V2 DUMP
```json
{
  "exit_code": 0,
  "verdict": "PASS",
  "metrics": {
    "defects_caught": 10,
    "total_defects": 10,
    "false_positives": 0,
    "total_clean": 10,
    "overall_recall": 1.0,
    "overall_precision": 1.0,
    "recall_threshold": 0.8,
    "fp_max": 0
  },
  "per_category_recall": {
    "empty_wrong_pattern": 1.0,
    "identical_patterns": 1.0,
    "confidence_range": 1.0,
    "missing_fields": 1.0,
    "embedding_conflict": 1.0
  },
  "per_rule_results": {
    "defective": "<array of 10 per-rule objects; each has: id, ok (bool), failed_checks (string[]), verdict: 'CAUGHT'|'MISSED'>",
    "clean": "<array of 10 per-rule objects; each has: id, ok (bool), failed_checks (string[]), false_positive (bool)>"
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/stdout.log"
}
```

Document EXACT thresholds from source:
- `overall_recall >= 0.8` (i.e. ≥ 8 of 10 defective rules detected)
- `false_positives = 0` (none of the 10 clean rules flagged)

## §V3 READ
`claudefast -p`:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
>
> PASS criteria:
> - `metrics.overall_recall >= 0.8`
> - `metrics.false_positives == 0`
> - `exit_code == 0` and `verdict == "PASS"`
> - Per-rule `ok` field corresponds correctly to `failed_checks` being empty (ok=true ↔ failed_checks=[])
>
> FAIL criteria:
> - `metrics.overall_recall < 0.8` (fewer than 8 of 10 defects caught)
> - `metrics.false_positives > 0` (any clean rule incorrectly flagged)
> - `exit_code != 0`
> - Missing or malformed `judge.json`
> - Runner used old API (`valid`/`errors` keys) instead of `ok`/`failed_checks` — results
>   will be all-undefined and appear as 10/10 false negatives (clean rules all "caught")
>
> SKIP if infra missing: `tsx` binary not found at `node_modules/.bin/tsx`; or
> `packages/core/src/validator/l0.js` does not exist (run `pnpm install` first).

## Notes
- Original logic summary: The harness uses Python to generate a TypeScript evaluator on-the-fly
  (written to `runner.mjs` inside the evidence dir), then executes it via `tsx`. The evaluator
  imports `validateLevel0` from the core package and calls it for each of the 20 test entries
  (10 defective + 10 clean), feeding each through the L0 validator with appropriate `sourceText`
  and `existingRules` context. It computes per-category recall across the five defect categories
  and overall recall/precision, then writes a structured `judge.json` and exits non-zero on any
  threshold violation.
- Dependencies:
  - `pnpm install` (provides `node_modules/.bin/tsx`)
  - `packages/core/src/validator/l0.js` (L0 validator must be built or importable via tsx)
  - `packages/adapters` is not required for this harness
  - Python 3 (used for codegen and timing)
- The embedding-conflict category (`d-ec-1`, `d-ec-2`) tests Jaccard ≥ 0.85 detection against a
  synthetic existing rule with trigger `fetch-vs-axios`; this requires the L0 validator's
  conflict-detection logic to be implemented.

## Phase 2 fix log
Resolved 2026-05-08: #7 (P1) updated §V1 Step 2 API contract to `validateLevel0({entry, sourceText, existingRules, projectStack})` → `{ok, failed_checks}`; removed old `{rule}` / `{valid, errors}` shape; updated §V2 per-rule schema and §V3 FAIL criteria. Commit 3d4ddbd.

<self-report>
premature_stopping: false
permission_seeking: false
ownership_dodging: false
simplest_fix: false
reasoning_loop: false
known_limitation: false
skipped_repo_search: false
fabricated_value: false
placeholder_used: false
ambiguity_unresolved: false
contradiction_unresolved: false
silent_fallback: false
</self-report>
