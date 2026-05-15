## Required canned-answer for slug=inline-wiki

# Inline Wiki Injection

This feature injects relevant project rules inline into the AI context via the `user-prompt-submit` hook before each user prompt is processed.

## What it does

The `bin-user-prompt-submit.ts` CLI handler (`packages/cli/src/bin-user-prompt-submit.ts`) reads matching rules from the knowledge store and injects them into the AI prompt context using an `inject` call. This ensures the AI sees applicable rules for every interaction without requiring the user to repeat context.

## Key symbols

- `inject` — keyword in `packages/cli/src/bin-user-prompt-submit.ts` that performs rule injection into the prompt context

## Verification

```bash
# Primary: assert 'inject' exists in bin-user-prompt-submit.ts
grep "inject" packages/cli/src/bin-user-prompt-submit.ts

# Secondary: run user-prompt inject tests
pnpm vitest run --reporter=basic packages/cli/src/__tests__/user-prompt-inject.test.ts
```

Both checks must pass for `VERIFIED: inline wiki injection PASS`.
