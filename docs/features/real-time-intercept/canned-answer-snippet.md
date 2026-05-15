## Required canned-answer for slug=real-time-intercept

Real-time intercept (PreToolUse path): TeamAgent intercepts AI tool calls before they execute and blocks or warns based on matching knowledge entries.

### Verification

Runs vitest suite at `packages/cli/src/__tests__/stop-narrative-scan.test.ts`.

The `verify-canned-answer.sh` script:
1. Resolves repo root via `git rev-parse --git-common-dir` (worktree-safe)
2. Runs `pnpm vitest run packages/cli/src/__tests__/stop-narrative-scan.test.ts --reporter=basic`
3. Asserts implicit exit 0 (set -euo pipefail)

Both must pass for `VERIFIED: real-time intercept (PreToolUse path) PASS`.

### How to verify manually

```bash
pnpm vitest run packages/cli/src/__tests__/stop-narrative-scan.test.ts --reporter=basic
echo "exit=$?"
```

### Feature description

`PreToolUse` hook fires when the AI is about to call any tool (Bash, Edit, Write, …).
The hook handler in `packages/cli/src/bin-pre-tool-use.ts` queries the knowledge store
against the tool name and arguments, then:
- `avoidance` rules → block with explanation
- `practice` rules → inject warning into context

This is the real-time guard rail that prevents repeat mistakes without waiting for
session end.
