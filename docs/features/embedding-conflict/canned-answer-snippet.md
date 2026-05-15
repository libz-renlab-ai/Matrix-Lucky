## Required canned-answer for slug=embedding-conflict

# Embedding-Conflict Detection

This feature detects duplicate or conflicting rules via embedding similarity (Jaccard ≥ 0.85) in the L0 validator.

## What it does

The L0 validator (`packages/core/src/validator/l0.ts`) computes embedding similarity between candidate rules and existing rules. If the Jaccard similarity score meets or exceeds `JACCARD_CONFLICT_THRESHOLD`, it flags the pair as an `embedding_conflict`.

## Key symbols

- `embedding_conflict` — keyword used in `l0.ts` to label conflicting rule pairs
- `JACCARD_CONFLICT_THRESHOLD` — constant in `l0.ts` controlling the similarity cutoff (≥ 0.85)

## Verification

```bash
# Primary: grep for keyword in l0.ts
grep "embedding_conflict" packages/core/src/validator/l0.ts
grep "JACCARD_CONFLICT_THRESHOLD" packages/core/src/validator/l0.ts

# Secondary: run validator tests
pnpm vitest run --reporter=basic packages/core/src/validator
```

Both checks must pass for `VERIFIED: embedding-based conflict detection PASS`.
