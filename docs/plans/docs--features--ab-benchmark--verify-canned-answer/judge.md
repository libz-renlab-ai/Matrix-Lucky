# Judge Playbook: ab-benchmark / verify-canned-answer

> Replaces archived script `docs/legacy/judge-scripts/docs/features/ab-benchmark/verify-canned-answer.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/ab-benchmark/verify-canned-answer.sh`
- Original purpose: Gate wrapper that invokes the A/B benchmark run-judge harness and asserts a zero exit code, emitting `VERIFIED: A/B benchmark PASS` on success.
- Status: **ACTIVE**

## §V1 RUN

Concrete commands (extracted from source):

- Step 1: Execute the ab-benchmark run-judge playbook — follow all steps in `docs/plans/docs--features--ab-benchmark--run-judge/judge.md` §V1 RUN in full, capturing `evidence_dir`, `judge.json`, and exit code.
- Step 2: Assert exit code — read `assertion.result` from the generated `judge.json`. If result is not `"PASS"`, emit `FAIL: A/B benchmark run-judge — reduction_pct below 0.50 or null` and set `exit_code = 1`.
- Step 3: If `assertion.result` == `"PASS"`, emit `VERIFIED: A/B benchmark PASS` and set `exit_code = 0`.

Capture to `evidence_dir` inherited from the inner run-judge invocation (`/tmp/.judge/ab/<timestamp>/` or `$JUDGE_DIR`).

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "inner_run_judge_result": "PASS",
    "reduction_pct": 0.7143,
    "mistake_repeated_a": 7,
    "mistake_repeated_b": 2,
    "avoided_count": 5
  },
  "evidence_dir": "/tmp/.judge/ab/<timestamp>",
  "stdout_path": "/tmp/.judge/ab/<timestamp>/stdout.log",
  "stderr_path": "/tmp/.judge/ab/<timestamp>/stdout.log",
  "feature_status": "active"
}
```

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS criteria: `inner_run_judge_result` == `"PASS"`, meaning `metrics.reduction_pct` >= 0.50 across the 10 probe scenarios.
> FAIL criteria: `inner_run_judge_result` == `"FAIL"` — the inner run-judge reported `reduction_pct` below threshold or null. Inspect `evidence_dir/judge.json` `per_probe` for per-probe breakdown.
> SKIP if infra for the inner run-judge harness is missing (`claudefast`, `python3`, `probes.json`, or `arm-b-rules.json` absent).

## Notes

- Original logic summary: The verify-canned-answer script is a minimal gate wrapper: it executes `run-judge.sh` and checks the process exit code. On zero exit (PASS), it emits `VERIFIED: A/B benchmark PASS`. The playbook equivalent delegates all substantive benchmark logic to the run-judge playbook and this playbook only adds the gate assertion. The naming `verify-canned-answer` reflects that this is used as a canned-answer verification gate — confirming the A/B benchmark capability claim is verifiably true before it is reported as a shipped feature.
- Dependencies / limitations:
  - All dependencies from the inner ab-benchmark run-judge playbook apply here (claudefast, python3, probes.json, arm-b-rules.json).
  - This playbook adds no new infra requirements.
  - A full A/B benchmark run (20 claudefast calls) may take several minutes; plan accordingly when using this as a gate in CI or a POSTPR loop.
  - The canonical `docs/features/ab-benchmark/judge.json` written by the inner harness can serve as persistent evidence without re-running if the benchmark result has not changed.

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
