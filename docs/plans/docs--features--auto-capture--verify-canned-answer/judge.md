# Judge Playbook: auto-capture / verify-canned-answer

> Replaces archived script `docs/legacy/judge-scripts/docs/features/auto-capture/verify-canned-answer.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/auto-capture/verify-canned-answer.sh`
- Original purpose: Gate script that runs `extraction-judge.sh` + `real-judge.sh` if both are present, or falls back to vitest if the judge harnesses are absent; exit 0 = VERIFIED.
- Status: **ACTIVE**

## §V1 RUN

Primary path: dispatch the two sub-playbooks via subagent or `claudefast -p` probe.
The historical `.sh` files (`docs/features/auto-capture/extraction-judge.sh`,
`real-judge.sh`) are archived to `docs/legacy/judge-scripts/...` and MUST NOT be
the conditional gate — checking their on-disk presence in the worktree always
returns false post-migration, which silently dropped the harness to a vitest
fallback that does not exercise recall/precision thresholds. Codex P1 review on
PR #148 commit dc87a19 surfaced this.

- Step 0: Resolve repo root (handles git worktrees).
  ```
  GIT_COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  REPO_ROOT="$(cd "$GIT_COMMON_DIR/.." && pwd)"
  ```

- Step 1 (REQUIRED — extraction judge): Dispatch the extraction-judge playbook.
  Invoke the MAIN agent path via subagent or claudefast probe:
  ```text
  Follow the playbook at docs/plans/docs--features--auto-capture--extraction-judge/judge.md
  Write evidence to .judge/capture/<run_id>/ and emit verdict per §V3.
  ```
  Evidence captured under `.judge/capture/<run_id>/`.

- Step 2 (REQUIRED — real judge): Dispatch the real-judge playbook.
  ```text
  Follow the playbook at docs/plans/docs--features--auto-capture--real-judge/judge.md
  Write evidence to .judge/capture-real/<run_id>/ and emit verdict per §V3.
  ```
  Evidence captured under `.judge/capture-real/<run_id>/`.

- Step 3 (vitest unit-test sanity, NOT a fallback): always run vitest as an
  additional cross-check on the correction detector module.
  ```
  (cd "$REPO_ROOT" && pnpm vitest run packages/core/src/correction-detector \
    --reporter=basic 2>&1 | tail -20)
  ```
  Vitest result is recorded as `vitest_unit_passed` but does NOT substitute for
  the recall/precision gate from Steps 1+2.

- Step 4: Emit final VERIFIED line if all three (`extraction_judge_passed`,
  `real_judge_passed`, `vitest_unit_passed`) are true.
  ```text
  echo "VERIFIED: auto-capture extraction + real-session detection PASS"
  ```

Capture to `evidence_dir` as delegated to the sub-playbooks (`.judge/capture/`
and `.judge/capture-real/`).

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "extraction_judge_passed": true,
    "real_judge_passed": true,
    "vitest_unit_passed": true,
    "extraction_judge": {
      "prod_recall": ">= 0.85",
      "prod_precision": ">= 0.90",
      "thresholds_pass": true
    },
    "real_judge": {
      "recall_real": ">= 0.85",
      "precision_real": ">= 0.90",
      "pass": true
    }
  },
  "evidence_dir": ".judge/capture/<run_id>/ and .judge/capture-real/<run_id>/",
  "stdout_path": "delegated to sub-playbooks",
  "stderr_path": "delegated to sub-playbooks",
  "feature_status": "active"
}
```

There is no `fallback_mode` field. Vitest is an additional cross-check, not a
substitute. All three signals must be true for the playbook to PASS.

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS iff ALL THREE of the following are true:
>   - extraction_judge_passed == true (which requires prod_recall >= 0.85 AND prod_precision >= 0.90)
>   - real_judge_passed == true (which requires recall_real >= 0.85 AND precision_real >= 0.90)
>   - vitest_unit_passed == true
> FAIL if any of the three is false.
> SKIP only if dispatch infrastructure (subagent / claudefast) is unavailable AND vitest cannot run — record reason explicitly. SKIP is NOT a fallback for missing recall/precision gates.

## Notes

- Original logic summary: archived `verify-canned-answer.sh` ran the two sub-judges if their `.sh` files were on disk, else fell back to vitest. Post-migration the `.sh` files moved under `docs/legacy/judge-scripts/`, so the on-disk gate became permanent-false and the harness silently fell back to vitest, hiding the recall/precision contract. This playbook removes the conditional and dispatches the two sub-playbooks unconditionally.
- Dependencies: subagent / `claudefast -p` to dispatch the two sub-playbooks; `pnpm vitest` for the unit cross-check.
- Limitations: vitest alone is **not a sufficient gate** — it covers detector logic but not recall/precision measurement against labeled fixtures. Both sub-playbooks must run.

## Phase 2 fix log

- Resolved 2026-05-08 (Codex P1 on PR #148 commit `dc87a19b2a`): replaced the on-disk `.sh`-gate-with-vitest-fallback with unconditional dispatch of the `extraction-judge` and `real-judge` md playbooks plus vitest as an additional cross-check. PASS now requires all three signals; no silent fallback to vitest-only.
