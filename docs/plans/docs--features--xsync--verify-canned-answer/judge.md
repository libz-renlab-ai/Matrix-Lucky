# Judge Playbook: xsync/verify-canned-answer

> Replaces archived script `docs/legacy/judge-scripts/docs/features/xsync/verify-canned-answer.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/xsync/verify-canned-answer.sh`
- Original purpose: Thin gate wrapper that invokes the xsync run-judge harness and asserts exit 0, then emits `VERIFIED: xsync cross-machine sync PASS`.
- Status: **ACTIVE**

## §V1 RUN
Concrete commands from source:

- Step 1: Dispatch the xsync run-judge playbook (see
  `docs/plans/docs--features--xsync--run-judge/judge.md` §V1) to completion.
  All steps from that playbook apply verbatim, including bare-remote init, seed,
  push, pull, and metadata comparison.

- Step 2: Capture the exit code from the run-judge harness:
  ```bash
  EXIT_CODE=$?
  ```

- Step 3: Gate on exit code:
  - If `EXIT_CODE != 0`: emit `FAILED: cross-machine git-sync (xsync) judge exited $EXIT_CODE`
    to stderr and exit 1.
  - If `EXIT_CODE == 0`: emit blank line then `VERIFIED: xsync cross-machine sync PASS`.

Capture to `evidence_dir = tmp/.judge/xsync/<run_id>/` (same run_id as the run-judge harness).

## §V2 DUMP
```json
{
  "exit_code": 0,
  "metrics": {
    "rules_present_in_B": ">= 5",
    "metadata_match": "exact",
    "gate": "VERIFIED"
  },
  "evidence_dir": "tmp/.judge/xsync/<run_id>",
  "stdout_path": "tmp/.judge/xsync/<run_id>/stdout.log",
  "feature_status": "active"
}
```

Document EXACT thresholds from source:
- Passes only if the underlying `run-judge` harness exits 0.
- No additional thresholds; all acceptance criteria delegate to the run-judge playbook.

## §V3 READ
`claudefast -p`:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
>
> PASS criteria:
> - `exit_code == 0`
> - `metrics.gate == "VERIFIED"`
> - Underlying run-judge `judge.json` shows `pass == true`,
>   `rules_b count == 5`, `metadata_match == true`
>
> FAIL criteria:
> - `exit_code != 0`
> - Run-judge harness itself failed (any of its FAIL criteria triggered:
>   seed failure, push/pull non-zero exit, rules_b count < 5, metadata mismatch)
> - `VERIFIED` string absent from stdout
>
> SKIP if infra missing: same conditions as xsync run-judge playbook (`tsx`,
> `DualLayerStore`, `packages/cli/src/bin.ts`, Python 3, or Git absent).

## Notes
- Original logic summary: Two-line wrapper identical in structure to the rule-quality
  verify-canned-answer: calls `run-judge.sh` and checks its exit code. On non-zero it
  writes `FAILED: cross-machine git-sync (xsync) judge exited $EXIT_CODE` to stderr and
  exits 1. On zero it prints a blank line followed by `VERIFIED: xsync cross-machine sync
  PASS` and exits 0. No logic of its own beyond the exit-code gate.
- Dependencies:
  - `docs/plans/docs--features--xsync--run-judge/judge.md` (run-judge playbook)
  - All xsync run-judge dependencies: `pnpm install`, `DualLayerStore`, CLI bin, Python 3, Git

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
