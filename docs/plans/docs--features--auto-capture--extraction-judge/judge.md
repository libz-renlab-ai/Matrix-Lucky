# Judge Playbook: auto-capture / extraction-judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/auto-capture/extraction-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/auto-capture/extraction-judge.sh`
- Original purpose: Run `ruleBasedCorrectionDetector` against a labeled fixture JSONL (and optionally a prod fixture), compute recall/precision, assert thresholds (recall >= 0.85, precision >= 0.90) on the prod fixture, emit a combined `judge.json`.
- Status: **ACTIVE**

## §V1 RUN

Concrete commands extracted from source:

- Step 0: Set paths.
  ```
  FIXTURE="docs/features/auto-capture/labeled-fixture.jsonl"
  PROD_FIXTURE="docs/features/auto-capture/prod-fixture.jsonl"
  SESSION_DIR="${PROD_SESSION_DIR:-$HOME/.claude/projects/-Users-m1-projects-TeamBrain}"
  RUN_ID="$(date +%s)"
  EVIDENCE_DIR="$REPO_ROOT/.judge/capture/$RUN_ID"
  mkdir -p "$EVIDENCE_DIR/per-row" "$EVIDENCE_DIR/per-row-prod"
  ```

- Step 1: Install dependencies if needed.
  ```
  [[ -f "$REPO_ROOT/node_modules/.bin/tsx" ]] \
    || (cd "$REPO_ROOT" && pnpm install --frozen-lockfile)
  ```

- Step 2: Generate prod fixture if absent.
  ```
  [[ -f "$PROD_FIXTURE" ]] \
    || PROD_SESSION_DIR="$SESSION_DIR" node scripts/gen-prod-fixture.cjs "$PROD_FIXTURE"
  ```

- Step 3: Write inline runner to `scripts/extraction-judge-runner.ts`.
  Imports `ruleBasedCorrectionDetector` from `packages/core/src/index.js`; reads fixture JSONL rows (`session_id`, `transcript`, `expected_correction`, optional `expected_rule_keyword`); builds 2-turn sessions; calls `detect()`; writes per-row JSON; emits `judge.json`.

- Step 4: Pass 1 — run against labeled fixture.
  ```
  RUN_ID="$RUN_ID" JUDGE_JSON_PATH="$EVIDENCE_DIR/judge-labeled.json" \
    "$TSX_BIN" --tsconfig tsconfig.base.json \
    scripts/extraction-judge-runner.ts \
    "$FIXTURE" "$EVIDENCE_DIR/per-row" "labeled" \
    2>>"$EVIDENCE_DIR/stderr.txt" | tee -a "$EVIDENCE_DIR/stdout.txt"
  ```

- Step 5: Pass 2 — run against prod fixture (if present).
  ```
  RUN_ID="$RUN_ID" JUDGE_JSON_PATH="$EVIDENCE_DIR/judge-prod.json" \
    "$TSX_BIN" --tsconfig tsconfig.base.json \
    scripts/extraction-judge-runner.ts \
    "$PROD_FIXTURE" "$EVIDENCE_DIR/per-row-prod" "prod" \
    2>>"$EVIDENCE_DIR/stderr.txt" | tee -a "$EVIDENCE_DIR/stdout.txt"
  ```

- Step 6: Cleanup runner.
  ```
  rm -f scripts/extraction-judge-runner.ts
  ```

- Step 7: Merge labeled + prod into combined `judge.json` via `node -e`.
  The combined JSON includes `labeled` section, `prod` section (if present), `prod_mode` bool, `evidence_dir`, `stdout_path`, `stderr_path`.

- Step 8: Assert prod thresholds (exit 1 if prod fixture exists but thresholds not met).
  ```
  node -e "const d=require('.../judge-prod.json'); process.exit(d.recall>=0.85&&d.precision>=0.90?0:1)"
  ```

Capture to `evidence_dir = .judge/capture/<run_id>/`.

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "labeled": {
      "recall": "informational",
      "precision": "informational",
      "f1": "informational"
    },
    "prod": {
      "recall": ">= 0.85",
      "precision": ">= 0.90",
      "recall_pass": true,
      "precision_pass": true,
      "thresholds_pass": true
    },
    "prod_mode": true
  },
  "evidence_dir": ".judge/capture/<run_id>/",
  "stdout_path": ".judge/capture/<run_id>/stdout.txt",
  "stderr_path": ".judge/capture/<run_id>/stderr.txt",
  "feature_status": "active"
}
```

Thresholds apply to the prod fixture: `prod.recall >= 0.85 AND prod.precision >= 0.90`. The labeled fixture run is informational only. The harness exits non-zero only when `prod-fixture.jsonl` exists and thresholds fail; if the prod fixture is absent, the harness exits 0 with `prod_mode: false`.

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS if:
>   (a) prod_mode == true AND prod.recall >= 0.85 AND prod.precision >= 0.90 AND prod.thresholds_pass == true, OR
>   (b) prod_mode == false (prod fixture absent) — labeled pass is informational only.
> FAIL if prod_mode == true and either prod.recall < 0.85 or prod.precision < 0.90.
> SKIP if tsx toolchain is unavailable or labeled-fixture.jsonl is missing.

## Notes

- Original logic summary: The harness runs in two passes. Pass 1 evaluates `ruleBasedCorrectionDetector` against a curated `labeled-fixture.jsonl` (manually written test cases) — this is informational. Pass 2 evaluates against a dynamically generated `prod-fixture.jsonl` built from real session JSONL in `~/.claude/projects/-Users-m1-projects-TeamBrain` via `scripts/gen-prod-fixture.cjs`. Only the prod pass has hard thresholds (recall >= 0.85, precision >= 0.90); the labeled pass is for visibility. Both passes use the same inline TypeScript runner (`extraction-judge-runner.ts`) which builds 2-turn `ParsedSession` objects from each labeled row and calls `ruleBasedCorrectionDetector.detect()`. A combined `judge.json` merges both passes and includes per-row evidence paths.
- Dependencies: `tsx` in repo or on PATH; `packages/core/src/index.js` exports `ruleBasedCorrectionDetector`; `docs/features/auto-capture/labeled-fixture.jsonl` present; `scripts/gen-prod-fixture.cjs` present for prod fixture generation; real session JSONL at `PROD_SESSION_DIR` for prod fixture.
- Limitations: Prod fixture generation (`gen-prod-fixture.cjs`) requires access to real session data at `PROD_SESSION_DIR`; if absent, prod pass is skipped and harness exits 0. Threshold enforcement applies only to prod fixture.
