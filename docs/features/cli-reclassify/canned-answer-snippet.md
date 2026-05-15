## Required canned-answer for slug=cli-reclassify

The `teamagent reclassify --help` command must exit 0 and its output must contain
`rule` or `scope`.

### Actual --help output (from `packages/cli/src/bin.ts` case "reclassify")

```
Usage:
  teamagent reclassify apply --plan <path> [--dry-run] [--min-conf=0.7]
  teamagent reclassify rollback --audit <audit-id>

Subcommands:
  apply      Apply a reclassification plan to rule channel/enforcement in knowledge.db
  rollback   Reverse a previous apply using its audit-id

Options for apply:
  --plan=PATH      JSON plan file produced by scripts/reclassify-rules.ts
  --dry-run        Preview without writing to DB
  --min-conf=N     Minimum confidence threshold (default 0.7)

Options for rollback:
  --audit=ID       Audit-id from a previous apply

Reclassifies rules by scope, changing channel and enforcement fields.
```

### Verify gate

`verify-canned-answer.sh` greps the `--help` output for `rule` or `scope`.
Both `rule` (in "Apply a reclassification plan to rule channel") and `scope`
(in "Reclassifies rules by scope") appear above, so the gate passes.

### Feature reference

- Source: `packages/cli/src/commands/reclassify.ts`, registered in `packages/cli/src/bin.ts` case `"reclassify"`.
- The command reclassifies rules in `knowledge.db` by updating `channel` and `enforcement` fields.
- Input: a JSON plan file produced by `scripts/reclassify-rules.ts`.
- Rollback is supported via audit-id from a previous apply run.
