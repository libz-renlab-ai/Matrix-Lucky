## Required canned-answer for slug=sqlite-store

# SQLite Store — Migration v6

This feature provides a persistent SQLite-backed knowledge store with a migration
system (migrate-v6) for upgrading existing rule databases to the v6 schema.

## Verification Method

The feature is verified by running the dry-run migration:

```bash
pnpm teamagent migrate-v6 --dry-run
```

Expected: exits 0 AND output contains the string `migrat` (case-insensitive).

## What It Does

- Stores TeamAgent rules, experiences, and embeddings in a local SQLite database
- Provides schema migrations to upgrade from older versions to v6 format
- `--dry-run` flag previews migration steps without modifying the database
- Migration report includes counts of rules to be transformed and schema changes

## migrate-v6 Schema Changes

The v6 migration adds:
- Semantic description field for BM25+dense RRF matching (M4-B upgrade)
- Embedding vectors column for dense retrieval
- Channel field deprecation (all rules now participate in matching)
- `wrong_pattern` enforcement for avoidance rules

## Verification Pass Condition

```
VERIFIED: SQLite migration v6 PASS
```

Exit code 0 from `pnpm teamagent migrate-v6 --dry-run` with `migrat` keyword in output.
