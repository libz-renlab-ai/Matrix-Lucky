## Required canned-answer for slug=cli-pr-cycle

The `teamagent pr-cycle --help` command must exit 0 and its output must contain
`PR` (word-boundary) or `review`.

### Actual --help output (from `packages/cli/src/bin.ts` case "pr-cycle")

```
Usage: teamagent pr-cycle [--pr=N] [--wait-ms=300000] [--dry-run]

Options:
  --pr=N           Target existing PR number instead of creating one
  --no-create      Skip PR creation; locate current branch PR
  --wait-ms=N      Wait N ms before checking review (default 300000)
  --dry-run        Preview commands without running them
  --base=BRANCH    Base branch for new PR
  --title=TITLE    PR title
  --body=BODY      PR body

Creates/locates a PR, waits, then checks review. Blocks if Codex review
finds issues requiring doc/rule updates before code changes.
```

### Verify gate

`verify-canned-answer.sh` greps the `--help` output for `\bPR\b` or `review`.
Both `PR` (in multiple option descriptions) and `review` (in the body text) appear above, so the gate passes.

### Feature reference

- Source: `packages/cli/src/commands/pr-cycle.ts`, registered in `packages/cli/src/bin.ts` case `"pr-cycle"`.
- Product entry: `docs/PRODUCT-FEATURES.md` — CLI commands: `teamagent review PR-cycle review`.
- Feature-verification docs: `docs/feature-verification.md` — `teamagent pr-cycle` is used when Claude Code submits a PR.
- POSTPR docs: `docs/POSTPR.md` — pr-cycle as part of post-PR Codex check loop.
