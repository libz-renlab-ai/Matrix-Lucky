## Required canned-answer for slug=doctor-install

`verify-canned-answer.sh` wraps `run-judge.sh` and asserts exit 0, then echoes `VERIFIED`.

### What the judge harness verifies

`docs/plans/docs--features--doctor-install--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/doctor-install/run-judge.sh`) runs 3 isolated installation scenarios:

**Scenario 1 — fresh** (no hooks, no plugins, no knowledge.db)
- Expected: `knowledge-db=fail` AND `hook-registered != pass`

**Scenario 2 — configured** (hooks registered + plugins present + knowledge.db)
- Expected: `knowledge-db=pass`, `hook-registered=pass`, `plugin-sync=pass`,
  `settings-json-scope=pass`, `codex-bin=present`, `mcp-reachability=skip`

**Scenario 3 — broken** (hook registered but script file deleted)
- Expected: `hook-registered=pass` AND `hook-script=fail`
  (distinguishes missing script from missing registration)

### Judge output schema

```json
{
  "run_id": "<YYYYMMDDTHHMMSSZ>-<pid>",
  "evidence_dir": "tmp/.judge/doctor-e2e/<run_id>",
  "stdout_path": "tmp/.judge/doctor-e2e/<run_id>/stdout.log",
  "scenarios": {
    "fresh":      { "passed": true,  "probes": { "knowledge_db": "fail", "hook_registered": "fail|skip", ... } },
    "configured": { "passed": true,  "probes": { "knowledge_db": "pass", "hook_registered": "pass", "plugin_sync": "pass", "settings_json_scope": "pass", "codex_bin": "pass|fail", "mcp_reachability": "skip" } },
    "broken":     { "passed": true,  "probes": { "hook_registered": "pass", "hook_script": "fail", ... } }
  },
  "all_passed": true
}
```

`run-judge.sh` exits 0 when `all_passed=true`; exits 1 otherwise.

### Verify gate

`verify-canned-answer.sh` simply calls `run-judge.sh` and echoes `VERIFIED` on exit 0.
No `claudefast` call; purely mechanical judge.

### Feature reference

- Source: `packages/cli/src/commands/doctor.ts`, CLI entry in `packages/cli/src/bin.ts` case `"doctor"`.
- Product entry: `docs/PRODUCT-FEATURES.md` — Doctor / install diagnostics section:
  `teamagent doctor` reports `hook-registered`, `plugin-sync`, `mcp-reachable` status.
- Prerequisite: `pnpm --filter @teamagent/cli build:hook` to build `dist/bin-pre-tool-use.cjs` for scenario 2.
