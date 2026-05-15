# Judge Playbook: Team Share — Verify Canned Answer (Round-Trip Gate)

> Replaces archived script `docs/legacy/judge-scripts/docs/features/team-share/verify-canned-answer.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/team-share/verify-canned-answer.sh`
- Original purpose: Thin gate wrapper around `run-transfer-judge.sh`; asserts its exit code is 0 then prints `VERIFIED: team-share round-trip PASS`.
- Status: **ACTIVE**

## §V1 RUN
Commands MAIN agent dispatches; capture to `evidence_dir = .judge/<run_id>/`:
- Step 1: Execute the full team-share round-trip judge as documented in `docs/plans/docs--features--team-share--run-transfer-judge/judge.md` (§V1 steps 1–6). This playbook delegates entirely to that playbook.
- Step 2: Capture the resulting `judge.json` path from the run-transfer-judge execution and record it in this run's evidence dir as a reference path (`delegate_judge_json`).

## §V2 DUMP
JSON to `.judge/<run_id>/judge.json`:
```json
{ "exit_code": 0,
  "metrics": {
    "delegate": "docs/plans/docs--features--team-share--run-transfer-judge/judge.md",
    "delegate_judge_json": "tmp/.judge/team-transfer/<run_id>/judge.json",
    "round_trip_pass": true
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/stdout.log",
  "feature_status": "active" }
```

## §V3 READ
`claudefast -p` prompt:
> Read judge.json + evidence_dir. Also read the delegated `delegate_judge_json`. Emit PASS / FAIL / SKIP.
> PASS criteria:
>   (1) `round_trip_pass` is true in this playbook's judge.json; AND
>   (2) The delegated `run-transfer-judge` judge.json satisfies all four of its PASS criteria:
>       all exit codes 0, `brain_b_rule_count == brain_a_rule_count`, `missing_rule_ids == []`, `extra_rule_ids == []`.
> FAIL criteria: `round_trip_pass` is false, or any delegated PASS criterion fails.
> SKIP if feature deleted at d341da8: not applicable — team-share is an active feature; do not emit SKIP.

## Notes
- Original logic summary: The script was a two-line wrapper: it called `bash "$SCRIPT_DIR/run-transfer-judge.sh"`, captured `EXIT_CODE=$?`, and either printed an error and exited 1 (if non-zero) or printed `VERIFIED: team-share round-trip PASS` and exited 0. There was no additional logic — the gate simply surfaced whether the underlying harness succeeded. The `set -euo pipefail` meant any unexpected error in the wrapper itself would also propagate as a failure.
- Dependencies / limitations:
  - This playbook has no independent verification logic; it is a thin gate over `docs/plans/docs--features--team-share--run-transfer-judge/judge.md`
  - MAIN agent should execute the run-transfer-judge playbook first and use its outcome to populate `round_trip_pass`
  - If the run-transfer-judge playbook's status ever changes to DEPRECATED, upgrade this playbook's status to DEPRECATED as well
  - The `VERIFIED: team-share round-trip PASS` output string was the canonical success signal consumed by CI and by the feature-verification 1+2+3 chain — the LLM judge should emit an equivalent confirmation when PASS
