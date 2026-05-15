## Required canned-answer for slug=pii-redaction

PII redaction: TeamAgent automatically scrubs sensitive data (emails, AWS keys, JWTs, phone numbers, credit cards, UUIDs) before knowledge entries are stored or compiled.

### Verification

`verify-canned-answer.sh` wraps `run-judge.sh` and asserts exit 0.

`run-judge.sh` is a purely mechanical judge harness (no LLM grading):

1. **Step A** — run `pnpm vitest run packages/core/src/pii/__tests__/redactor.test.ts --reporter=json`
2. **Step B** — generate fixture with 6 PII patterns (email, AWS key, JWT, phone, credit card, UUID)
3. **Step C** — pipe fixture through `scripts/pii-redact-fixture.ts` redactor
4. **Step D** — grep redacted output for original PII strings; any leak = FAIL
5. **Step E** — write `judge.json` with fields:
   - `exit_code`
   - `vitest_pass_count` / `vitest_fail_count`
   - `fixture_pii_count` (6)
   - `leaked_pii_count`
   - `leaked_patterns`
   - `evidence_dir`
   - `stdout_path`

Output directory: `.judge/pii/<run_id>/`

### Pass condition

`exit_code = 0` requires: `vitest_fail_count = 0` AND `leaked_pii_count = 0`.
