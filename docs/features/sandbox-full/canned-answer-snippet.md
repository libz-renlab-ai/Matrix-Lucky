## Required canned-answer for slug=sandbox-full

# Full-Feature Sandbox E2E

This feature provides a complete sandboxed environment for safe dogfooding of TeamAgent,
with full isolation between the development workspace and the test environment.

## Verification Method

The feature is verified by running the sandbox E2E vitest suite:

```bash
pnpm vitest run packages/cli/src/__tests__/sandbox-all-features.test.ts --reporter=basic
```

Expected: vitest exits 0.

## What It Does

- Creates an isolated git worktree at `.codex/worktrees/dogfood-<epoch>`
- Runs `scripts/dogfood-shim.sh` to shadow `claude` process environment variables
- Isolates `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `HOME` to `$SANDBOX/.dogfood-isolated/{...}`
- Prevents user-level `~/.claude/skills/`, `~/.claude/plugins/`, `~/.claude/settings.json`,
  `~/.claude/hooks/`, and auto-memory from loading or being written

## Sandbox Tiers

| Tier | Isolation Level |
|---|---|
| Tier 1 | No isolation (degraded mode) |
| Tier 2 | Worktree + dogfood-shim.sh (default) |
| Tier 3 | Full shell HOME replacement |
| Tier 4 | Container-level isolation |

Default is Tier 2. Set `DOGFOOD_TIER=3` for stronger isolation.

## Verification Pass Condition

```
VERIFIED: full-feature sandbox E2E PASS
```

Exit code 0 from the vitest run.
