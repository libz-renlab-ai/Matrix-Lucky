# Judge Playbook: PII Redaction (Vitest + Fixture Leak Check)

> Replaces archived script `docs/features/pii-redaction/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/pii-redaction/run-judge.sh`
- Original purpose: Run vitest for the PII redactor, pipe a 6-pattern fixture through the redactor, and assert that none of the original PII strings survive in the output.
- Status: **ACTIVE**

## §V1 RUN
Concrete commands the MAIN agent dispatches (extracted from source .sh):

- Step 1: Run vitest for the redactor test file:
  ```
  pnpm vitest run packages/core/src/pii/__tests__/redactor.test.ts \
    --reporter=json --outputFile=.judge/pii/<run_id>/vitest.json 2>>.judge/pii/<run_id>/stdout.log
  ```

- Step 2: Write a fixture file containing 6 PII patterns (email, AWS access key `AKIA...`, JWT, US phone `+1-415-555-0172`, credit card `4532015112830366`, UUID `550e8400-...`) to `.judge/pii/<run_id>/fixture.txt`.

- Step 3: Pipe the fixture through the redactor script:
  ```
  npx tsx scripts/pii-redact-fixture.ts < .judge/pii/<run_id>/fixture.txt \
    > .judge/pii/<run_id>/redacted.txt 2>>.judge/pii/<run_id>/stdout.log
  ```

- Step 4: Grep the redacted output for each of the 6 original PII strings (using `grep -qF`) and record any that still appear:
  ```
  grep -qF "alice.devops@acme-corp.com" .judge/pii/<run_id>/redacted.txt && echo "LEAK: email"
  grep -qF "AKIAIOSFODNN7EXAMPLE" .judge/pii/<run_id>/redacted.txt && echo "LEAK: aws_key"
  grep -qF "eyJhbGci..." .judge/pii/<run_id>/redacted.txt && echo "LEAK: jwt"
  grep -qF "+1-415-555-0172" .judge/pii/<run_id>/redacted.txt && echo "LEAK: phone"
  grep -qF "4532015112830366" .judge/pii/<run_id>/redacted.txt && echo "LEAK: credit_card"
  grep -qF "550e8400-e29b-41d4-a716-446655440000" .judge/pii/<run_id>/redacted.txt && echo "LEAK: uuid"
  ```

Capture all stdout/stderr to `evidence_dir = .judge/pii/<run_id>/`.

## §V2 DUMP
JSON written to `.judge/pii/<run_id>/judge.json`:

```json
{
  "run_id": "<YYYYMMDD-HHMMSS>-<pid>",
  "exit_code": 0,
  "vitest_pass_count": 8,
  "vitest_fail_count": 0,
  "fixture_pii_count": 6,
  "leaked_pii_count": 0,
  "leaked_patterns": [],
  "evidence_dir": ".judge/pii/<run_id>",
  "stdout_path": ".judge/pii/<run_id>/stdout.log",
  "metrics": {
    "vitest_all_pass": true,
    "no_pii_leaked": true,
    "fixture_patterns_checked": 6,
    "leaked_labels": []
  },
  "feature_status": "active"
}
```

Metric keys derived from source:
- `vitest_pass_count`: must be > 0 (tests exist and pass)
- `vitest_fail_count`: must equal 0
- `fixture_pii_count`: always 6 (the harness always writes 6 patterns)
- `leaked_pii_count`: must equal 0 for PASS; each entry in `leaked_patterns` is `"<label>:<value>"`
- `leaked_patterns`: array of label:value strings for any PII that survived redaction (email, aws_key, jwt, phone, credit_card, uuid)
- `exit_code`: 0 only when `leaked_pii_count=0` AND `vitest_fail_count=0`

## §V3 READ
`claudefast -p` prompt:

> Read `.judge/pii/<run_id>/judge.json` and optionally diff `fixture.txt` vs `redacted.txt` in `evidence_dir`. Emit PASS / FAIL / SKIP.
>
> PASS criteria: `exit_code` is `0`; specifically — `vitest_fail_count=0` (all unit tests pass) AND `leaked_pii_count=0` (none of the 6 PII patterns survived redaction in the fixture output).
>
> FAIL criteria: `vitest_fail_count > 0` (unit test regressions) OR `leaked_pii_count > 0` (at least one PII pattern was not redacted; `leaked_patterns` names which ones).
>
> SKIP if `scripts/pii-redact-fixture.ts` is not present, or `packages/core/src/pii/__tests__/redactor.test.ts` does not exist.

## Notes
- Original logic summary: The harness has two complementary verification layers that must both pass. The vitest layer catches regressions in unit-test coverage of the `redactor` module. The fixture layer is an independent integration check: it embeds 6 realistic PII patterns (email, AWS key, JWT, US phone, credit card, UUID) in plausible team-knowledge prose, pipes the text through the actual redactor CLI script, and uses `grep -F` (literal string matching, no regex) to confirm each pattern is gone from the output. The distinction between unit tests and fixture checks matters because unit tests may mock internals while the fixture exercises the real end-to-end redaction pipeline.
- Dependencies: `pnpm install`, `pnpm vitest` (via workspace), `npx tsx`, `scripts/pii-redact-fixture.ts`, `packages/core/src/pii/__tests__/redactor.test.ts`
- Limitations: The fixture PII values are hardcoded constants (e.g., `AKIAIOSFODNN7EXAMPLE`, `4532015112830366`); any redactor that replaces only dynamically-detected patterns might miss edge cases not represented. The `grep -F` check is a necessary-condition test — passing it does not guarantee full PII coverage for all possible inputs.
