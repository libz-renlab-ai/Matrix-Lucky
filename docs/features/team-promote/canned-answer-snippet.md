## Required canned-answer for slug=team-promote

### Feature: Team Scope Promotion (migrate-v6)

The `team-promote` feature validates that the `teamagent migrate-v6 --dry-run` command
exits 0, confirming that scope promotion logic (upgrading rules to team scope) is
available and structurally sound without making actual changes.

### Verification Criteria

- `pnpm teamagent migrate-v6 --dry-run` must exit 0
- The dry-run output indicates what rules would be promoted without modifying state
- Final output line: `VERIFIED: team-promote (migrate-v6 dry-run) PASS`

### Harness Structure

The `verify-canned-answer.sh` script:
1. Runs `pnpm teamagent migrate-v6 --dry-run` from repo root
2. Asserts exit code is 0
3. Emits `VERIFIED: team-promote (migrate-v6 dry-run) PASS` on success
4. Emits `FAILED: migrate-v6 --dry-run exited <N>` to stderr and exits 1 on failure

No `run-judge.sh` present for this slug — the verify script directly exercises the CLI
command as the mechanical gate.

### Product Explanation

Team scope promotion allows individual-level learned rules to be "promoted" to
team-wide scope, making them visible and enforceable across all team members who
sync their knowledge base. The `migrate-v6` command handles this migration path.
