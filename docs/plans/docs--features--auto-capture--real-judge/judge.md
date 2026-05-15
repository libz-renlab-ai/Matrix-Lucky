# Judge Playbook: auto-capture / real-judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/auto-capture/real-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/auto-capture/real-judge.sh`
- Original purpose: Measure recall and precision of `ruleBasedCorrectionDetector` against manually labeled real JSONL session fixtures; assert recall >= 0.85 AND precision >= 0.90.
- Status: **ACTIVE**

## §V1 RUN

Concrete commands extracted from source:

- Step 0: Set run ID and evidence paths.
  ```
  RUN_ID="$(date +%s)"
  EVIDENCE_DIR="$REPO_ROOT/.judge/capture-real/$RUN_ID"
  PER_ROW_DIR="$EVIDENCE_DIR/per-row"
  mkdir -p "$EVIDENCE_DIR" "$PER_ROW_DIR"
  ```

- Step 1: Resolve `tsx` binary.
  ```
  TSX_BIN="$(command -v tsx 2>/dev/null \
    || echo "$REPO_ROOT/node_modules/.bin/tsx" \
    || find "$REPO_ROOT/node_modules/.pnpm" -name tsx -path "*/bin/tsx" | head -1)"
  ```

- Step 2: Write inline runner script to `scripts/real-judge-runner.ts`.
  The runner imports `ruleBasedCorrectionDetector` from `packages/core/src/index.js`, loads all `*.jsonl` fixture files from `docs/features/auto-capture/real-fixture/`, builds 2-turn sessions per labeled row, calls `detect()`, and computes TP/FP/TN/FN counts.

- Step 3: Execute runner against `real-fixture/` directory.
  ```
  RUN_ID="$RUN_ID" JUDGE_JSON_PATH="$EVIDENCE_DIR/judge.json" \
    "$TSX_BIN" --tsconfig tsconfig.base.json \
    scripts/real-judge-runner.ts \
    "docs/features/auto-capture/real-fixture" \
    "$PER_ROW_DIR" \
    2>>"$EVIDENCE_DIR/stderr.txt" | tee -a "$EVIDENCE_DIR/stdout.txt"
  ```

- Step 4: Cleanup temp runner.
  ```
  rm -f scripts/real-judge-runner.ts
  ```

- Step 5: Print summary metrics from `judge.json` using python3.
  ```
  python3 -c "import json,sys; d=json.load(open(sys.argv[1])); \
    print(f'recall={d[\"recall_real\"]} precision={d[\"precision_real\"]} f1={d[\"f1_real\"]} pass={d[\"pass\"]}')" \
    "$EVIDENCE_DIR/judge.json"
  ```

Capture to `evidence_dir = .judge/capture-real/<run_id>/`.

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "recall_real": ">= 0.85",
    "precision_real": ">= 0.90",
    "f1_real": "informational",
    "pass": true,
    "labeled_turns": ">= 1",
    "true_positives": "informational",
    "false_positives": "informational",
    "true_negatives": "informational",
    "false_negatives": "informational",
    "thresholds": { "recall_min": 0.85, "precision_min": 0.90 }
  },
  "evidence_dir": ".judge/capture-real/<run_id>/per-row/",
  "stdout_path": ".judge/capture-real/<run_id>/stdout.txt",
  "stderr_path": ".judge/capture-real/<run_id>/stderr.txt",
  "feature_status": "active"
}
```

Thresholds are hardcoded in the runner: `pass = recall >= 0.85 && precision >= 0.90`. Per-row results written to `per-row/<session_id>.json` for inspection of individual FN/FP cases.

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS if all metrics meet thresholds documented in §V2:
>   recall_real >= 0.85 AND precision_real >= 0.90 AND pass == true.
> FAIL if either threshold is missed (recall or precision below threshold).
> SKIP if tsx toolchain is unavailable, or real-fixture/ directory is empty or missing.

## Notes

- Original logic summary: The harness dynamically generates a TypeScript runner (`scripts/real-judge-runner.ts`) that imports `ruleBasedCorrectionDetector` from `packages/core` at source (not compiled JS). It loads all `*.jsonl` files from `docs/features/auto-capture/real-fixture/`, where each row contains a `session_id`, `transcript`, `is_correction` boolean, and optional `signal_type`. For each row it builds a minimal 2-turn `ParsedSession` (a dummy prior assistant turn plus the labeled user message as turn 1), calls `ruleBasedCorrectionDetector.detect()`, and classifies each result as TP/FP/TN/FN. Final `recall = TP/(TP+FN)` and `precision = TP/(TP+FP)` are computed; `pass = recall >= 0.85 && precision >= 0.90`. The runner is cleaned up after execution. False negative and false positive session IDs plus transcript snippets are embedded in `judge.json` for forensics.
- Dependencies: `tsx` available in repo or on PATH; `packages/core/src/index.js` exports `ruleBasedCorrectionDetector`; `docs/features/auto-capture/real-fixture/*.jsonl` labeled fixture files present; `tsconfig.base.json` in repo root.
- Limitations: Recall/precision computed only on the labeled fixture set — quality depends entirely on fixture coverage and label correctness. The dummy prior assistant turn text is fixed ("I'll proceed with implementing this using axios and webpack..."), which may influence detection.
