#!/usr/bin/env bash
# scripts/check-bin-stderr.sh
#
# Lint rule per ADR-0008: hook channel binaries (`packages/cli/src/bin-*.ts`)
# must not call `process.stderr.write` with user-visible system attribution
# text. User-visible "what TeamAgent did" must go through `ctx.bus.emit({...})`,
# which the HookShell routes to `StdoutRenderer` and on to stderr per the
# `TEAMAGENT_VISIBILITY` mode.
#
# Allowed in bin-*.ts:
# - `process.stderr.write` inside debug-only fallback paths (e.g., the
#   "teamagent <hook>: <error stack>" log line that fires when the handler
#   throws). These are caught at the shell layer and not part of normal
#   user-visible attribution.
# - `process.stderr.write` for protocol-mandated stderr mirroring of
#   `systemMessage` (issue #50542 workaround) — but bins should call
#   `ctx.mirrorSystemMessage(text)` instead, which the shell routes
#   identically. Direct writes are flagged.
#
# This script greps for user-visible markers (Chinese rendering header
# `◈`/`⚠`/`✓` and the "TeamAgent:" prefix) inside bin-*.ts files. Any match
# is a violation.
#
# Exit 0 — no violations.
# Exit 1 — at least one violation; lines are printed to stderr.

set -euo pipefail

cd "$(dirname "$0")/.."

# Pattern: process.stderr.write(...) where the argument contains a known
# user-visible marker. Skip lines that are inside a comment (single-line
# `//` or multi-line `*` continuation in a JSDoc) — those are documentation
# referring to the original code, not active calls.
matches=$(
  grep -nE 'process\.stderr\.write\(.*("◈|"⚠|"✓|"TeamAgent:|`◈|`⚠|`✓|`TeamAgent:)' \
    packages/cli/src/bin-*.ts 2>/dev/null \
    | grep -vE ':[0-9]+:[[:space:]]*(//|\*)' \
    || true
)

if [ -n "$matches" ]; then
  echo "ERROR: bin-*.ts must not write user-visible text to stderr directly." >&2
  echo "Use ctx.bus.emit({ kind: '...', ... }) — HookShell's StdoutRenderer" >&2
  echo "routes to stderr per TEAMAGENT_VISIBILITY mode (per ADR-0008)." >&2
  echo "" >&2
  echo "Violations:" >&2
  echo "$matches" >&2
  exit 1
fi

exit 0
