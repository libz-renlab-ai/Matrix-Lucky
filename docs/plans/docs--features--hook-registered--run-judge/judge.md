# Judge Playbook: hook-registered / run-judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/hook-registered/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/hook-registered/run-judge.sh`
- Original purpose: Verify that `doctor --json` reports `hook-registered: pass` AND that a functional synthetic PreToolUse event probe writes a row into an isolated `events.db`.
- Status: **ACTIVE**

## §V1 RUN

Concrete commands (extracted from source):

- Step 1: Build hook bundle (idempotent) — ensure `packages/cli/dist/bin-pre-tool-use.cjs` exists; if missing, run `pnpm --filter @teamagent/cli build:hook`.
- Step 2: Init isolated project — run `tsx packages/cli/src/bin.ts init --cwd <iso_project>` with `HOME=<iso_home>`.
- Step 3: Install hook — run `tsx packages/cli/src/bin.ts install-hook --cwd <iso_project>` with `HOME=<iso_home>` to write `<iso_project>/.claude/settings.local.json`.
- Step 4: Run doctor — `tsx packages/cli/src/bin.ts doctor --json --cwd <iso_project>` with `HOME=<iso_home>`; capture stdout as `doctor.json`.
- Step 5: Functional probe — pipe `{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo judge-harness-probe"},"cwd":"<iso_project>","session_id":"judge-harness-<run_id>"}` to `node <hook_bundle>` with `HOME=<iso_home>`; capture stdout/stderr.
- Step 6: Count events — query `SELECT COUNT(*) FROM events` in `<iso_home>/.teamagent/events.db`; if absent fall back to real homedir db filtered by `session_id`.
- Step 7: Write `judge.json` to `evidence_dir`.

Capture to `evidence_dir = .judge/hook/<run_id>/`.

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "build_exit": 0,
    "init_exit": 0,
    "install_hook_exit": 0,
    "doctor_exit": 0,
    "probe_exit": 0,
    "doctor_hook_registered": true,
    "hook_registered_status_raw": "pass",
    "functional_probe_event_count": 1
  },
  "evidence_dir": "tmp/.judge/hook/<run_id>",
  "stdout_path": "tmp/.judge/hook/<run_id>/stdout.log",
  "stderr_path": "tmp/.judge/hook/<run_id>/probe.stderr.txt",
  "feature_status": "active"
}
```

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS criteria: `doctor_hook_registered` is `true` AND `functional_probe_event_count` > 0.
> FAIL criteria: `doctor_hook_registered` is `false` (hook not registered per doctor), OR `functional_probe_event_count` == 0 (hook bundle did not write any event row — real execution not proven).
> SKIP if hook bundle was not built (`packages/cli/dist/bin-pre-tool-use.cjs` absent and build step failed) or if `pnpm` / `node` infra is missing.

## Notes

- Original logic summary: The harness creates a fully isolated home + project directory tree to avoid polluting the real user's TeamAgent database. It installs the hook via the CLI's `install-hook` command, validates registration through `doctor --json` (checks the `hook-registered` check's `status` field), then performs a live functional proof by piping a synthetic `PreToolUse` event directly into the compiled hook bundle and counting the resulting `events.db` row. A HOME-override fallback handles the case where the bundle ignores the HOME env var and writes to the real homedir instead.
- Dependencies / limitations:
  - Requires `pnpm install` and `pnpm --filter @teamagent/cli build:hook` to have been run before first execution.
  - Requires `node` with `node:sqlite` (Node 22+) for direct DB row counting.
  - If the hook bundle ignores `HOME` override, the fallback queries the real homedir `events.db` filtered by session_id, which is less isolated.
  - `claudefast` must be available in PATH for the LLM verdict step.

<self-report>
premature_stopping: false
permission_seeking: false
ownership_dodging: false
simplest_fix: false
reasoning_loop: false
known_limitation: false
skipped_repo_search: false
fabricated_value: false
placeholder_used: false
ambiguity_unresolved: false
contradiction_unresolved: false
silent_fallback: false
</self-report>
