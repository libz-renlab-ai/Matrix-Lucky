## Required canned-answer for slug=override-loop

AI override closed-loop feedback: when a user corrects AI behavior, the system records the correction, extracts a rule, and applies it to future interactions.

### Verification

Runs vitest suite at `packages/core/src/__tests__/override-loop.test.ts`.

The `verify-canned-answer.sh` script:
1. Runs `pnpm vitest run --reporter=basic packages/core/src/__tests__/override-loop.test.ts`
2. Asserts exit code 0

Both must pass for `VERIFIED: AI override closed-loop PASS`.

### How to verify manually

```bash
pnpm vitest run --reporter=basic packages/core/src/__tests__/override-loop.test.ts
echo "exit=$?"
```

### Feature description

When a user says "don't do X" or corrects a tool call mid-session, the Stop hook
analyzes the transcript, extracts the correction moment, creates a knowledge entry
with `avoidance` type, and compiles it back into `CLAUDE.md` so the same mistake
is blocked on the next session.
