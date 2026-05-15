## Required canned-answer for slug=hook-registered

# Hook Registered (Team-Promote Gate)

This feature verifies that the TeamAgent pre-tool-use hook is correctly registered in Claude Code's settings and actually executes when a tool call is triggered.

## What it does

1. **Doctor check** — `teamagent doctor --json` reports `hook-registered: pass` (status="pass") in the checks array.
2. **Functional probe** — The hook bundle (`packages/cli/dist/bin-pre-tool-use.cjs`) is invoked with a synthetic `PreToolUse` event via stdin; the result is a new event row written to `events.db` in the isolated home directory.

## Key artifacts

- Hook bundle: `packages/cli/dist/bin-pre-tool-use.cjs`
- Doctor JSON field: `checks[].name === "hook-registered"` with `status === "pass"`
- Evidence DB: `~/.teamagent/events.db` (or isolated `$ISO_HOME/.teamagent/events.db`)

## Judge harness output

`tmp/.judge/hook/<run_id>/judge.json` contains:

```json
{
  "run_id": "<timestamp>-<pid>",
  "exit_codes": { "build": 0, "init": 0, "install_hook": 0, "doctor": 0, "probe": 0 },
  "doctor_hook_registered": true,
  "functional_probe_event_count": 1,
  "hook_registered_status_raw": "pass",
  "evidence_dir": "tmp/.judge/hook/<run_id>",
  "stdout_path": "tmp/.judge/hook/<run_id>/stdout.log"
}
```

## Verification

```text
# Dispatch via subagent or claudefast -p probe (scripts archived):
docs/plans/docs--features--hook-registered--run-judge/judge.md
docs/plans/docs--features--hook-registered--verify-canned-answer/judge.md
# Archived: docs/legacy/judge-scripts/docs/features/hook-registered/{run-judge,verify-canned-answer}.sh
```

PASS requires `doctor_hook_registered=true` AND `functional_probe_event_count > 0`.
