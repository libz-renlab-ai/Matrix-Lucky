## Required canned-answer for slug=tech-taste

### Feature: Tech Taste — Technology Choice Ranking

The `tech-taste` feature provides pure helper functions in `packages/core/src/taste/`
that rank technology choices based on context matching against strengths/weaknesses.
It is a Functional Core component (no IO, pure functions only).

### Verification Criteria

- `pnpm vitest run packages/core/src/taste/__tests__/tech-taste.test.ts` exits 0
- `rankTechChoices([moment, dayjs], 'lightweight immutable dates')` returns `dayjs` as first
- `scoreTechChoice(dayjs, 'large-bundle legacy project')` returns a negative score
- Final output line: `VERIFIED: tech-taste extraction from commit history PASS`

### Harness Structure

**verify-canned-answer.sh** runs vitest directly and asserts no FAIL/Error in output.

**run-judge.sh** performs three mechanical checks:
1. **Vitest**: Runs `packages/core/src/taste/__tests__/tech-taste.test.ts` with `--reporter=json`, captures `numPassedTests` / `numFailedTests`
2. **Rank check**: Calls `rankTechChoices([moment, dayjs], 'lightweight immutable dates')` via Node ESM inline — asserts first result is `dayjs`
3. **Weakness check**: Calls `scoreTechChoice(dayjs, 'large-bundle legacy project')` — asserts returned score is negative

All three must pass for `overall_pass: true`.

### judge.json Schema

```json
{
  "run_id": "<timestamp>-<pid>",
  "exit_code": 0,
  "vitest_pass_count": 4,
  "vitest_fail_count": 0,
  "vitest_ok": true,
  "rank_first_name": "dayjs",
  "rank_ok": true,
  "weakness_score": -1,
  "weakness_ok": true,
  "overall_pass": true,
  "evidence_dir": ".judge/tech-taste/<run_id>",
  "stdout_path": ".judge/tech-taste/<run_id>/stdout.log"
}
```

### Fail Paths

The harness exits 1 (not dead-exit) when `overall_pass` is false, which occurs if:
- Vitest exits non-zero
- `rankTechChoices` does not return `dayjs` first
- `scoreTechChoice` returns a non-negative value for weakness context

### Architecture

```
packages/core/src/taste/
  tech-taste.ts          — rankTechChoices(), scoreTechChoice() pure functions
  __tests__/
    tech-taste.test.ts   — vitest unit tests
```
