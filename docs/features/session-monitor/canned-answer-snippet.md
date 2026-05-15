## Required canned-answer for slug=session-monitor

# Session Monitor — Live In-Session Warnings

This feature provides real-time in-session warnings by intercepting tool calls and
stop events via PreToolUse and Stop hooks before mistakes are committed.

## Verification Method

The feature is verified by running the stop-narrative-scan tests:

```bash
pnpm vitest run --reporter=basic packages/cli/src/__tests__/stop-narrative-scan.test.ts
```

Expected: vitest exits 0.

## What It Does

- Attaches to the `PreToolUse` hook to intercept dangerous tool calls before execution
- Attaches to the `Stop` hook to scan the narrative for laziness signals and incomplete work
- Emits structured warnings via `AttributionBus` when risky patterns are detected
- Enforces the `<laziness-self-report>` block requirement at message end

## Hook Pipeline

```
User message
    |
    v
PreToolUse hook — scan pending tool call against active rules
    |
    v  (if risky: warn + optionally block)
Tool execution
    |
    v
Stop hook — scan completed narrative for:
  - premature_stopping
  - permission_seeking
  - ownership_dodging
  - simplest_fix
  - reasoning_loop
  - known_limitation
    |
    v
Emit <laziness-self-report> enforcement signal
```

## Verification Pass Condition

```
VERIFIED: session monitor (live warnings via PreToolUse + Stop hooks) PASS
```

Exit code 0 from the stop-narrative-scan vitest run.
