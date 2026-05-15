# Judge Playbook: calibrator-v2 / run-judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/calibrator-v2/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/calibrator-v2/run-judge.sh`
- Original purpose: Seed isolated SQLite stores, run calibration pipeline via tsx helpers, assert that at least one rule confidence DECREASED and at least one INCREASED.
- Status: **ACTIVE**

## §V1 RUN

Concrete commands extracted from source:

- Step 0: Set run ID and paths.
  ```
  RUN_ID="calib-$(date +%s)"
  ISOLATED_HOME="$REPO_ROOT/tmp/.judge/calib/$RUN_ID/home"
  ISOLATED_CWD="$REPO_ROOT/tmp/.judge/calib/$RUN_ID/cwd"
  EVIDENCE_DIR="$REPO_ROOT/.judge/calib/$RUN_ID"
  mkdir -p "$ISOLATED_HOME/.teamagent" "$ISOLATED_CWD/.teamagent" "$EVIDENCE_DIR"
  ```

- Step 1: Seed fixtures into isolated SQLite stores.
  ```
  (cd packages/cli && env PROJECT_DB=... GLOBAL_DB=... EVENTS_DB=... \
    pnpm exec tsx --tsconfig packages/cli/tsconfig.json \
    docs/features/calibrator-v2/_seed.ts)
  ```

- Step 2: Pre-calibrate snapshot.
  ```
  (cd packages/cli && env PROJECT_DB=... GLOBAL_DB=... SNAP_OUT="$EVIDENCE_DIR/pre.json" \
    pnpm exec tsx --tsconfig packages/cli/tsconfig.json \
    docs/features/calibrator-v2/_snap.ts)
  ```

- Step 3: Run calibration.
  ```
  (cd packages/cli && env PROJECT_DB=... GLOBAL_DB=... EVENTS_DB=... CAL_OUT="$EVIDENCE_DIR/calibrate.json" \
    pnpm exec tsx --tsconfig packages/cli/tsconfig.json \
    docs/features/calibrator-v2/_calibrate.ts)
  ```

- Step 4: Post-calibrate snapshot.
  ```
  (cd packages/cli && env PROJECT_DB=... GLOBAL_DB=... SNAP_OUT="$EVIDENCE_DIR/post.json" \
    pnpm exec tsx --tsconfig packages/cli/tsconfig.json \
    docs/features/calibrator-v2/_snap.ts)
  ```

- Step 5: Mechanical assertions — emit `judge.json`.
  ```
  (cd packages/cli && env PRE_JSON=... POST_JSON=... CAL_JSON=... \
    JUDGE_JSON="$EVIDENCE_DIR/judge.json" EVIDENCE_DIR=... RUN_ID=... \
    pnpm exec tsx --tsconfig packages/cli/tsconfig.json \
    docs/features/calibrator-v2/_assert.ts)
  ```

Capture to `evidence_dir = .judge/calib/<run_id>/`.

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "confidence_decreased_count": ">= 1",
    "confidence_increased_count": ">= 1"
  },
  "evidence_dir": ".judge/calib/<run_id>/",
  "stdout_path": ".judge/calib/<run_id>/stdout.txt",
  "stderr_path": ".judge/calib/<run_id>/stderr.txt",
  "feature_status": "active"
}
```

The `_assert.ts` helper reads `pre.json` and `post.json` snapshots and verifies that, compared to the pre-calibration state, at least one rule had its confidence DECREASED (demoted) and at least one rule had its confidence INCREASED (promoted). Both conditions must hold for `pass: true`.

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS if all metrics meet thresholds documented in §V2:
>   confidence_decreased_count >= 1 AND confidence_increased_count >= 1.
> FAIL if either threshold is missed (no demotions or no promotions detected).
> SKIP if SQLite seed fixtures or tsx toolchain are unavailable.

## Notes

- Original logic summary: The harness creates fully isolated SQLite stores (`knowledge.db`, `global.db`, `events.db`) under `tmp/.judge/calib/<run_id>/`, seeds them with known fixtures via `_seed.ts`, takes a pre-snapshot of all rule confidence values, runs the calibration pipeline (`_calibrate.ts`), takes a post-snapshot, then runs `_assert.ts` which mechanically checks that at least one rule's confidence decreased and at least one increased — proving the calibration pipeline actually adjusts rule scores based on event signals. No LLM is involved in the assertions.
- Dependencies: `packages/cli` built with pnpm workspace; `tsx` available via `pnpm exec tsx`; TypeScript helpers `_seed.ts`, `_snap.ts`, `_calibrate.ts`, `_assert.ts` present in `docs/features/calibrator-v2/`.
- Limitations: Assertions are purely mechanical (confidence delta direction only); does not verify correctness of individual calibration values or check against production data.
