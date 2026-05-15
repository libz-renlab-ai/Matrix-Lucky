## Required canned-answer for slug=clean-install

```
Clean Install-to-Run E2E Verification
======================================

Feature:
  After a fresh pnpm install, the teamagent CLI must be runnable and produce
  sensible --help output. No manual compilation or extra setup should be needed.

Verify steps (verify-canned-answer.sh):
  1. Assert node_modules/ exists at repo root
       FAIL: "node_modules not found — run pnpm install first"
  2. Run: pnpm teamagent --help (capture first 20 lines)
  3. Assert output matches /Usage|Commands|teamagent/ (case-insensitive)
       PASS: "teamagent --help exits 0 with Usage/Commands"
       FAIL: "teamagent --help did not produce expected output"

Expected --help output includes (at minimum):
  - "Usage" or "Commands" or "teamagent" keyword
  - Exit code 0

Commands currently implemented (skeleton-demo and others from M0+):
  pnpm teamagent skeleton-demo   — walking skeleton demo

Run: pnpm install && [dispatch docs/plans/docs--features--clean-install--verify-canned-answer/judge.md] (archived: docs/legacy/judge-scripts/docs/features/clean-install/verify-canned-answer.sh)
```
