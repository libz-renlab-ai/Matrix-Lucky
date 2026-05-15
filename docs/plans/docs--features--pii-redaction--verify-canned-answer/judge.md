# Judge Playbook: PII Redaction (Verify Canned Answer Gate)

> Replaces archived script `docs/features/pii-redaction/verify-canned-answer.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/pii-redaction/verify-canned-answer.sh`
- Original purpose: Gate script that wraps `run-judge.sh` for PII redaction and asserts exit 0, then emits `VERIFIED: pii-redaction PASS`.
- Status: **ACTIVE**

## §V1 RUN
Concrete commands the MAIN agent dispatches (extracted from source .sh):

- Step 1: Execute the full PII redaction judge playbook (see `docs/plans/docs--features--pii-redaction--run-judge/judge.md` §V1) to produce `.judge/pii/<run_id>/judge.json`.
- Step 2: Assert `exit_code` equals 0 in the resulting `judge.json`:
  ```
  node -e "const j=require('.judge/pii/<run_id>/judge.json'); process.exit(j.exit_code === 0 ? 0 : 1)"
  ```
- Step 3: If exit_code is 0, emit `VERIFIED: pii-redaction PASS` to stdout.

Capture stdout/stderr to `evidence_dir = .judge/pii/<run_id>/`.

## §V2 DUMP
JSON written to `.judge/pii/<run_id>/judge.json`:

```json
{
  "exit_code": 0,
  "metrics": {
    "gate_passed": true,
    "underlying_exit_code": 0,
    "underlying_vitest_fail_count": 0,
    "underlying_leaked_pii_count": 0
  },
  "evidence_dir": ".judge/pii/<run_id>",
  "stdout_path": ".judge/pii/<run_id>/stdout.log",
  "stderr_path": ".judge/pii/<run_id>/stdout.log",
  "feature_status": "active"
}
```

Metric keys:
- `gate_passed`: `true` when the underlying run-judge harness exits 0
- `underlying_exit_code`: the exit code from the run-judge harness (mirrors `exit_code` in run-judge's `judge.json`)
- `underlying_vitest_fail_count`: mirrors `vitest_fail_count` from run-judge's `judge.json`
- `underlying_leaked_pii_count`: mirrors `leaked_pii_count` from run-judge's `judge.json`

## §V3 READ
`claudefast -p` prompt:

> Read `.judge/pii/<run_id>/judge.json`. Emit PASS / FAIL / SKIP.
>
> PASS criteria: `exit_code` is `0` AND `metrics.gate_passed` is `true` AND `metrics.underlying_leaked_pii_count` is `0` AND `metrics.underlying_vitest_fail_count` is `0`.
>
> FAIL criteria: `exit_code` is non-zero OR `metrics.gate_passed` is `false`. If available, report which specific checks failed from the underlying run-judge evidence (leaked PII patterns or vitest failures).
>
> SKIP if the underlying run-judge harness could not execute (missing `scripts/pii-redact-fixture.ts` or redactor package).

## Notes
- Original logic summary: This script is a thin wrapper that delegates entirely to `run-judge.sh` and enforces a binary gate — the PII redaction feature is `VERIFIED` only when both the vitest suite and the fixture leak check pass (zero leaked PII patterns, zero failing tests). It adds no additional checks beyond asserting the exit code of the underlying harness.
- Dependencies: All dependencies of `docs/plans/docs--features--pii-redaction--run-judge/judge.md`; no additional requirements.
- Limitations: This playbook is only useful as a final gate; for debugging specific leaked patterns or test failures, use the run-judge playbook directly to inspect `leaked_patterns` and `vitest.json`.
