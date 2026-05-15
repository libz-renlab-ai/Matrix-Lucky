# Judge Playbook: Doctor Install-Diagnostic (Full E2E)

> Replaces archived script `docs/features/doctor-install/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/doctor-install/run-judge.sh`
- Original purpose: Run three isolated installation scenarios (fresh / configured / broken) against `teamagent doctor --json` and assert per-probe expected outcomes.
- Status: **ACTIVE**

## §V1 RUN
Concrete commands the MAIN agent dispatches (extracted from source .sh):

- Step 1: `pnpm --filter @teamagent/cli build:hook` — build `packages/cli/dist/bin-pre-tool-use.cjs` if not present; capture stdout to `.judge/doctor-e2e/<run_id>/build.stdout.txt`.
- Step 2 (fresh scenario): Create isolated `$HOME` + project dir with no hooks/plugins/knowledge.db, then run:
  ```
  HOME=<fresh_home> npx tsx packages/cli/src/bin.ts doctor --json --cwd <fresh_project> \
    > .judge/doctor-e2e/<run_id>/fresh.doctor.json 2> .judge/doctor-e2e/<run_id>/fresh.doctor.stderr.txt
  ```
- Step 3 (configured scenario): Seed `knowledge.db` via `openDb`, write `settings.local.json` with real hook bundle path, seed stub plugin dir, then:
  ```
  HOME=<conf_home> npx tsx packages/cli/src/bin.ts doctor --json --cwd <conf_project> \
    > .judge/doctor-e2e/<run_id>/configured.doctor.json 2> .judge/doctor-e2e/<run_id>/configured.doctor.stderr.txt
  ```
- Step 4 (broken scenario): Seed `knowledge.db`, write `settings.local.json` with hook pointing to `/nonexistent/deleted/bin-pre-tool-use.cjs`, then:
  ```
  HOME=<broken_home> npx tsx packages/cli/src/bin.ts doctor --json --cwd <broken_project> \
    > .judge/doctor-e2e/<run_id>/broken.doctor.json 2> .judge/doctor-e2e/<run_id>/broken.doctor.stderr.txt
  ```

Capture all stdout/stderr to `evidence_dir = .judge/doctor-e2e/<run_id>/`.

## §V2 DUMP
JSON written to `.judge/doctor-e2e/<run_id>/judge.json`:

```json
{
  "run_id": "<ISO timestamp>-<pid>",
  "evidence_dir": ".judge/doctor-e2e/<run_id>",
  "stdout_path": ".judge/doctor-e2e/<run_id>/stdout.log",
  "scenarios": {
    "fresh": {
      "passed": false,
      "probes": {
        "knowledge_db": "fail",
        "hook_registered": "fail",
        "plugin_sync": "fail",
        "settings_json_scope": "fail"
      }
    },
    "configured": {
      "passed": true,
      "probes": {
        "knowledge_db": "pass",
        "hook_registered": "pass",
        "hook_script": "pass",
        "plugin_sync": "pass",
        "settings_json_scope": "pass",
        "codex_bin": "pass|fail",
        "mcp_reachability": "skip"
      }
    },
    "broken": {
      "passed": true,
      "probes": {
        "hook_registered": "pass",
        "hook_script": "fail",
        "settings_json_scope": "pass"
      }
    }
  },
  "all_passed": true,
  "exit_code": 0,
  "metrics": {
    "fresh_passed": false,
    "configured_passed": true,
    "broken_passed": true
  },
  "feature_status": "active"
}
```

Metric keys derived from source:
- `fresh.probes.knowledge_db` must equal `"fail"` (no db present)
- `fresh.probes.hook_registered` must not equal `"pass"` (no hook installed)
- `configured.probes.knowledge_db` must equal `"pass"`
- `configured.probes.hook_registered` must equal `"pass"`
- `configured.probes.plugin_sync` must equal `"pass"`
- `configured.probes.settings_json_scope` must equal `"pass"`
- `configured.probes.codex_bin` must not equal `"missing"` (binary presence acceptable as pass or fail in CI)
- `configured.probes.mcp_reachability` must equal `"skip"`
- `broken.probes.hook_registered` must equal `"pass"` (tag still present)
- `broken.probes.hook_script` must equal `"fail"` (script file deleted)

## §V3 READ
`claudefast -p` prompt:

> Read `.judge/doctor-e2e/<run_id>/judge.json` and all per-scenario `.doctor.json` files in `evidence_dir`. Emit PASS / FAIL / SKIP.
>
> PASS criteria: `all_passed` is `true`; specifically — `scenarios.fresh.passed=true` (knowledge_db=fail AND hook_registered!=pass); `scenarios.configured.passed=true` (knowledge_db=pass, hook_registered=pass, plugin_sync=pass, settings_json_scope=pass, codex_bin!=missing, mcp_reachability=skip); `scenarios.broken.passed=true` (hook_registered=pass AND hook_script=fail).
>
> FAIL criteria: any scenario's `passed` field is `false`, or `all_passed` is `false`.
>
> SKIP if `packages/cli/src/bin.ts` is not present, or the adapter package (`packages/adapters/dist/index.cjs`) has not been built.

## Notes
- Original logic summary: The harness constructs three mutually isolated `$HOME` + project directory pairs so that each scenario cannot contaminate the others. The `fresh` scenario verifies that a bare project with no install is correctly flagged as unhealthy. The `configured` scenario manually crafts `settings.local.json` (because `install-hook` ignores `--cwd`) and seeds the knowledge DB directly via `openDb` to avoid slow LLM init. The `broken` scenario writes a hook pointing at a nonexistent path and asserts that `doctor` distinguishes between "tag registered" and "script file present" — two separate probes (`hook-registered` vs `hook-script`).
- Dependencies: `pnpm install`, `pnpm --filter @teamagent/cli build:hook`, Node.js (`node --no-warnings`), `npx tsx`, `packages/adapters/dist/index.cjs`
- Limitations: `codex_bin` probe is accepted as either pass or fail (binary may be absent in CI); `mcp_reachability` is always `skip` in isolated environments; knowledge DB seeding falls back to TSX if the CJS adapter is not built.
