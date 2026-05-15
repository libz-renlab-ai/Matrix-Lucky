# Judge Playbook: rule-quality/verify-canned-answer

> Replaces archived script `docs/legacy/judge-scripts/docs/features/rule-quality/verify-canned-answer.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/rule-quality/verify-canned-answer.sh`
- Original purpose: Thin gate wrapper that invokes the rule-quality run-judge harness and asserts exit 0, then emits `VERIFIED`.
- Status: **ACTIVE**

## §V1 RUN
Concrete commands from source:

- Step 1: Dispatch the rule-quality run-judge playbook (see
  `docs/plans/docs--features--rule-quality--run-judge/judge.md` §V1) to completion.
  All steps from that playbook apply verbatim.

- Step 2: Capture the exit code from the run-judge harness:
  ```bash
  EXIT_CODE=$?
  ```

- Step 3: Gate on exit code:
  - If `EXIT_CODE != 0`: emit failure and stop.
  - If `EXIT_CODE == 0`: emit `VERIFIED: rule-quality validator PASS`.

Capture to `evidence_dir = .judge/<run_id>/` (same run_id as the run-judge harness).

## §V2 DUMP
```json
{
  "exit_code": 0,
  "metrics": {
    "overall_recall": ">= 0.8",
    "false_positives": "= 0",
    "gate": "VERIFIED"
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/stdout.log",
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
> - Underlying run-judge `judge.json` shows `verdict == "PASS"`,
>   `overall_recall >= 0.8`, `false_positives == 0`
>
> FAIL criteria:
> - `exit_code != 0`
> - Run-judge harness itself failed (any of its FAIL criteria triggered)
> - `VERIFIED` string absent from stdout
>
> SKIP if infra missing: same conditions as run-judge playbook (`tsx` or `l0.js` absent).

## Notes
- Original logic summary: The script is a two-line wrapper — it calls `run-judge.sh` from the
  same directory and checks its exit code. If non-zero, it prints a FAILED message to stderr and
  exits 1. If zero, it prints `VERIFIED: rule-quality validator PASS` and exits 0. No additional
  validation logic exists in this script; all substantive checking is delegated to run-judge.
- Dependencies:
  - `docs/plans/docs--features--rule-quality--run-judge/judge.md` (run-judge playbook)
  - All run-judge dependencies: `pnpm install`, `packages/core/src/validator/l0.js`, Python 3

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
