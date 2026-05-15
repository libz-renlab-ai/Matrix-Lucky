# Judge Playbook: hook-registered / verify-canned-answer

> Replaces archived script `docs/legacy/judge-scripts/docs/features/hook-registered/verify-canned-answer.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/hook-registered/verify-canned-answer.sh`
- Original purpose: Gate wrapper that invokes the hook-registered run-judge harness and asserts a zero exit code, emitting `VERIFIED: hook-registered PASS` on success.
- Status: **ACTIVE**

## §V1 RUN

Concrete commands (extracted from source):

- Step 1: Execute the hook-registered run-judge playbook — follow all steps in `docs/plans/docs--features--hook-registered--run-judge/judge.md` §V1 RUN in full, capturing `evidence_dir` and exit code.
- Step 2: Assert exit code — if the run-judge result's `assertion.result` is not `PASS`, emit `FAILED: hook-registered (team-promote gate) judge — <reason>` and set `exit_code = 1`.
- Step 3: If `assertion.result` is `PASS`, emit `VERIFIED: hook-registered PASS` and set `exit_code = 0`.

Capture to `evidence_dir = .judge/hook/<run_id>/` (inherited from the inner run-judge invocation).

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "inner_run_judge_result": "PASS",
    "doctor_hook_registered": true,
    "functional_probe_event_count": 1
  },
  "evidence_dir": "tmp/.judge/hook/<run_id>",
  "stdout_path": "tmp/.judge/hook/<run_id>/stdout.log",
  "stderr_path": "tmp/.judge/hook/<run_id>/verdict.stderr.txt",
  "feature_status": "active"
}
```

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS criteria: `inner_run_judge_result` == `"PASS"` (i.e., `doctor_hook_registered` is true AND `functional_probe_event_count` > 0 per the inner harness).
> FAIL criteria: `inner_run_judge_result` is `"FAIL"` — the hook was not registered or the functional probe produced no events.
> SKIP if infra for the inner run-judge harness is missing (hook bundle not built, `pnpm` unavailable, or `node:sqlite` not available).

## Notes

- Original logic summary: The verify-canned-answer script is a thin gate wrapper: it calls `run-judge.sh` and simply checks the subprocess exit code. Zero exit means PASS (doctor check passed and functional probe wrote an event); non-zero means FAIL. The playbook equivalent delegates to the run-judge playbook for all substantive verification logic, and this playbook only adds the gate assertion layer.
- Dependencies / limitations:
  - All dependencies from the inner run-judge playbook apply here.
  - This playbook adds no new infra requirements beyond the inner playbook.
  - The "team-promote gate" label in the original script's FAIL message indicates this is used as a quality gate before promoting to team-shared knowledge — SKIP is preferable to a false FAIL if infra is absent.

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
