# Judge Playbook: Doctor Install-Diagnostic (Verify Canned Answer Gate)

> Replaces archived script `docs/features/doctor-install/verify-canned-answer.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/doctor-install/verify-canned-answer.sh`
- Original purpose: Gate script that wraps `run-judge.sh`, asserts exit 0, and emits `VERIFIED: doctor install-diagnostic PASS`.
- Status: **ACTIVE**

## §V1 RUN
Concrete commands the MAIN agent dispatches (extracted from source .sh):

- Step 1: Execute the full doctor-install judge playbook (see `docs/plans/docs--features--doctor-install--run-judge/judge.md` §V1) to produce `.judge/doctor-e2e/<run_id>/judge.json`.
- Step 2: Inspect `exit_code` in the resulting `judge.json`:
  ```
  node -e "const j=require('.judge/doctor-e2e/<run_id>/judge.json'); process.exit(j.all_passed ? 0 : 1)"
  ```

Capture stdout/stderr to `evidence_dir = .judge/doctor-e2e/<run_id>/`.

## §V2 DUMP
JSON written to `.judge/doctor-e2e/<run_id>/judge.json`:

```json
{
  "exit_code": 0,
  "metrics": {
    "gate_passed": true,
    "underlying_all_passed": true
  },
  "evidence_dir": ".judge/doctor-e2e/<run_id>",
  "stdout_path": ".judge/doctor-e2e/<run_id>/stdout.log",
  "stderr_path": ".judge/doctor-e2e/<run_id>/fresh.doctor.stderr.txt",
  "feature_status": "active"
}
```

Metric keys:
- `gate_passed`: `true` if the underlying run-judge harness exits 0 (`all_passed=true`)
- `underlying_all_passed`: mirrors `all_passed` from the underlying `judge.json`

## §V3 READ
`claudefast -p` prompt:

> Read `.judge/doctor-e2e/<run_id>/judge.json`. Emit PASS / FAIL / SKIP.
>
> PASS criteria: `exit_code` is `0` AND `metrics.gate_passed` is `true` AND `metrics.underlying_all_passed` is `true`.
>
> FAIL criteria: `exit_code` is non-zero OR `metrics.gate_passed` is `false`.
>
> SKIP if the underlying run-judge harness could not execute (missing CLI build or adapter).

## Notes
- Original logic summary: This script is a thin wrapper that delegates entirely to `run-judge.sh` and enforces a binary gate — the overall feature is `VERIFIED` only when all three doctor scenarios (fresh / configured / broken) pass. It adds no additional checks beyond asserting the exit code of the underlying harness.
- Dependencies: All dependencies of `docs/plans/docs--features--doctor-install--run-judge/judge.md`; no additional requirements.
- Limitations: This playbook is only useful as a final gate; for debugging individual scenario failures, use the run-judge playbook directly.
