# Judge Playbook: calibrator-v2 / prod-judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/calibrator-v2/prod-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/calibrator-v2/prod-judge.sh`
- Original purpose: True prod e2e — seed isolated SQLite stores, run the real `pnpm teamagent calibrate` CLI binary (not just tsx imports), assert rules_demoted >= 1 AND rules_promoted >= 1.
- Status: **ACTIVE**

## §V1 RUN

Concrete commands extracted from source:

- Step 0: Set run ID and isolated paths.
  ```
  RUN_ID="calib-prod-$(date +%s)-$$"
  CWD_DIR="$REPO_ROOT/tmp/.judge/calib-prod/$RUN_ID/cwd"
  HOME_DIR="$REPO_ROOT/tmp/.judge/calib-prod/$RUN_ID/home"
  EVIDENCE_DIR="$REPO_ROOT/.judge/calib-prod/$RUN_ID"
  mkdir -p "$CWD_DIR/.teamagent" "$HOME_DIR/.teamagent" "$EVIDENCE_DIR"
  ```

- Step 1: Seed isolated SQLite stores.
  ```
  (cd packages/cli && env PROJECT_DB="$CWD_DIR/.teamagent/knowledge.db" \
    GLOBAL_DB="$HOME_DIR/.teamagent/global.db" \
    EVENTS_DB="$HOME_DIR/.teamagent/events.db" \
    pnpm exec tsx --tsconfig packages/cli/tsconfig.json \
    docs/features/calibrator-v2/_prod-seed.ts)
  ```

- Step 2: Pre-calibrate snapshot.
  ```
  (cd packages/cli && env PROJECT_DB=... GLOBAL_DB=... \
    SNAP_OUT="$EVIDENCE_DIR/pre.json" \
    pnpm exec tsx --tsconfig packages/cli/tsconfig.json \
    docs/features/calibrator-v2/_snap.ts)
  ```

- Step 3: Capture structured calibrate result via `_calibrate.ts` (JSON output).
  ```
  (cd packages/cli && env PROJECT_DB=... GLOBAL_DB=... EVENTS_DB=... \
    CAL_OUT="$EVIDENCE_DIR/calibrate-cli.json" \
    pnpm exec tsx --tsconfig packages/cli/tsconfig.json \
    docs/features/calibrator-v2/_calibrate.ts)
  ```

- Step 3b: Smoke-test — run the real CLI binary (idempotent re-run expected).
  ```
  (cd "$CWD_DIR" && HOME="$HOME_DIR" TEAMAGENT_VISIBILITY=silent \
    node_modules/.bin/tsx --tsconfig packages/cli/tsconfig.json \
    packages/cli/src/bin.ts calibrate \
    > "$EVIDENCE_DIR/calibrate-cli.stdout" 2>&1) || true
  ```

- Step 4: Post-calibrate snapshot.
  ```
  (cd packages/cli && env PROJECT_DB=... GLOBAL_DB=... \
    SNAP_OUT="$EVIDENCE_DIR/post.json" \
    pnpm exec tsx --tsconfig packages/cli/tsconfig.json \
    docs/features/calibrator-v2/_snap.ts)
  ```

- Step 5: Mechanical assertions — emit `judge.json`.
  ```
  (cd packages/cli && env PRE_JSON=... POST_JSON=... CAL_JSON=... \
    JUDGE_JSON="$EVIDENCE_DIR/judge.json" EVIDENCE_DIR=... RUN_ID=... \
    pnpm exec tsx --tsconfig packages/cli/tsconfig.json \
    docs/features/calibrator-v2/_prod-judge.ts)
  ```

Capture to `evidence_dir = .judge/calib-prod/<run_id>/`.

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "rules_demoted": ">= 1",
    "rules_promoted": ">= 1",
    "adjustments_total": ">= 1",
    "pass": true
  },
  "evidence_dir": ".judge/calib-prod/<run_id>/",
  "stdout_path": ".judge/calib-prod/<run_id>/calibrate-cli.stdout",
  "stderr_path": ".judge/calib-prod/<run_id>/stderr.txt",
  "feature_status": "active"
}
```

`rules_demoted >= 1` means at least one rule's confidence score DECREASED after calibration. `rules_promoted >= 1` means at least one rule's confidence score INCREASED. Both must hold for `pass: true`.

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS if all metrics meet thresholds documented in §V2:
>   rules_demoted >= 1 AND rules_promoted >= 1 AND pass == true.
> FAIL if either rules_demoted or rules_promoted is 0.
> SKIP if SQLite seed fixture, tsx toolchain, or CLI binary (packages/cli/src/bin.ts) are unavailable.

## Notes

- Original logic summary: This harness differs from `run-judge` in that it uses `_prod-seed.ts` (a separate production-oriented seed fixture) and, after capturing the structured JSON result via `_calibrate.ts`, also performs a smoke-test run of the actual compiled CLI binary (`packages/cli/src/bin.ts` via tsx) with full HOME isolation (`HOME=$HOME_DIR`, `cd $CWD_DIR`). Since calibration is idempotent on a fully-calibrated store, the CLI smoke-test re-run is expected to produce 0 adjustments — this is tolerated. Assertions are handled by `_prod-judge.ts`, which emits a `judge.json` with `rules_demoted`, `rules_promoted`, `adjustments_total`, and `pass`.
- Dependencies: `packages/cli` pnpm workspace; `tsx` at `node_modules/.bin/tsx`; CLI binary at `packages/cli/src/bin.ts`; TypeScript helpers `_prod-seed.ts`, `_snap.ts`, `_calibrate.ts`, `_prod-judge.ts` in `docs/features/calibrator-v2/`.
- Limitations: CLI smoke-test is idempotent re-run (0 adjustments expected); the primary pass/fail judgment comes from `_calibrate.ts` structured output, not the CLI stdout.
