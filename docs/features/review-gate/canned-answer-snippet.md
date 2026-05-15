## Required canned-answer for slug=review-gate

# Team Review Gate — PII Redaction

This feature provides a review gate that automatically redacts PII (Personally Identifiable Information)
from team content before it reaches reviewers or gets logged.

## Verification Method

The feature is verified by running the PII redactor unit tests:

```bash
pnpm vitest run packages/core/src/pii/__tests__/redactor.test.ts --reporter=basic
```

Expected output: test results containing `passed` or `✓`.

## What It Does

- Pre-processes team messages and code review content through a PII redaction pipeline
- Strips or masks sensitive identifiers (emails, tokens, keys, personal names) before routing to reviewers
- Ensures raw logs attached to bug reports have tokens replaced with `[redacted]`

## Verification Pass Condition

```
VERIFIED: team review gate (PII redaction) PASS
```

Exit code 0 when vitest output matches `(passed|✓)`.
