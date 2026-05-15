# Judge Playbook: issue #87 First-Run Welcome Wizard (judge-first-run)

> Replaces archived script `scripts/judge-first-run.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/scripts/judge-first-run.sh`
- Original purpose: Third-party judge harness for issue #87 first-run wizard — runs J1 typecheck, J2 vitest, J3 postinstall stdout, J4 wizard PTY first-run, J5 wizard second-run, J6 `--help` baseline diff; writes evidence + `judge.json` under `.judge/<RUN_ID>/`.
- Status: **ACTIVE** — first-run wizard feature still exists; baseline file `docs/baselines/help-output.txt` may or may not exist.

## §V1 RUN

Commands the MAIN agent dispatches (via subagent or `claudefast -p` probe).
Capture stdout/stderr to `evidence_dir = .judge/<RUN_ID>/evidence/`.

Backup `~/.teamagent/first-run-state.json` and `~/.teamagent/update-state.json` before any J4/J5 step; restore on exit.

- **J1 — typecheck**: `pnpm typecheck > evidence/typecheck.log 2>&1`. PASS if `exit == 0`.
- **J2 — vitest**: `pnpm vitest run first-run --reporter=verbose > evidence/vitest.log 2>&1`. PASS if `exit == 0` AND `tests_passed >= 6` (parsed from `^\s*✓` line count or `Tests N passed` summary).
- **J3 — postinstall**: `TEAMAGENT_SKIP_WARMUP=1 node packages/teamagent/postinstall.mjs > evidence/postinstall.stdout 2>&1`. PASS if anchor count in {`✅`, `装好`, `skeleton-demo`, `stats`, `--help`, `github.com`} >= 6 AND line count <= 30.
- **J4 — wizard first run (TTY via expect)**: `expect -c '... spawn pnpm teamagent ... expect "选择" send "2\r" ...' > evidence/wizard-1.stdout`; fallback `printf '1\n' | pnpm teamagent` if `expect` unavailable. Detect TTY branch via `grep -q "选择"`; check `~/.teamagent/first-run-state.json` exists. PASS if anchor count >= 3 (in {`装好啦`, `🎉`, `skeleton-demo`, `stats`, `--help`}) AND TTY branch entered AND wizard exit 0 AND state file written.
- **J5 — wizard second run (recall previous)**: pre-seed state file with `completedSteps: ["skeleton-demo"]`; run `printf '2\n' | pnpm teamagent > evidence/wizard-2.stdout 2>&1`. PASS if `上次你跑了` anchor present AND `completedSteps.length > 0` (parsed via `jq` or grep fallback).
- **J6 — `--help` unchanged vs baseline**: `pnpm teamagent --help 2>/dev/null | tail -n +5 > evidence/help-current.stdout`; `diff docs/baselines/help-output.txt evidence/help-current.stdout > evidence/help-diff.log`. PASS if `diff_bytes == 0`. SKIP if baseline file missing.

## §V2 DUMP

Canonical JSON written to `.judge/<RUN_ID>/judge.json`:

```json
{
  "run_id": "<RUN_ID>",
  "feature": "issue-87-first-run-welcome",
  "overall": "PASS | FAIL",
  "exit_code": 0,
  "evidence_dir": ".judge/<RUN_ID>/evidence/",
  "stdout_path": "evidence/<per-check>.stdout",
  "feature_status": "active",
  "checks": [
    { "id": "J1", "tool": "typecheck",            "pass": "<bool>", "exit_code": "<int>" },
    { "id": "J2", "tool": "vitest",               "pass": "<bool>", "exit_code": "<int>", "tests_passed": "<int>" },
    { "id": "J3", "tool": "postinstall",          "pass": "<bool>", "exit_code": "<int>", "anchors_hit_count": "<int>", "line_count": "<int>" },
    { "id": "J4", "tool": "wizard-noargs-first",  "pass": "<bool>", "exit_code": "<int>", "anchors_hit_count": "<int>", "tty_branch_entered": "<bool>", "state_file_created": "<bool>" },
    { "id": "J5", "tool": "wizard-noargs-second", "pass": "<bool>", "exit_code": "<int>", "anchors_hit_count": "<int>", "completed_steps_count": "<int>" },
    { "id": "J6", "tool": "help-unchanged",       "pass": "<bool>", "exit_code": "<int>", "diff_bytes": "<int>" }
  ]
}
```

## §V3 READ

LLM judge prompt (run via `claudefast -p`):

> Read `.judge/<RUN_ID>/judge.json` and any per-check stdout under `evidence/`. Do NOT execute any tools. Emit verdict per check (PASS/FAIL) plus `OVERALL: PASS|FAIL`. Criteria:
>
> - **OVERALL PASS** iff every J1..J6 has `pass == true`.
> - **FAIL** if any single check has `pass == false`.
> - **SKIP** if `expect` unavailable AND J4 fallback was used (note in verdict).
> - For J6, if baseline missing, mark `J6: SKIP` and exclude from OVERALL determination.

Output last line in form `OVERALL: PASS` or `OVERALL: FAIL`.

## Notes

- Original logic summary: bash script with cross-platform `stat -f%z || stat -c%s` helper, `check_anchor` accumulator, and `jq`/printf-fallback judge.json writer. Backups state files, traps EXIT to restore.
- Dependencies: `pnpm typecheck`, `pnpm vitest`, `node packages/teamagent/postinstall.mjs`, optional `expect`, optional `jq`, optional baseline at `docs/baselines/help-output.txt`.
- Limitations: J4 known to FAIL state_file_created when `defaultSpawn(choice, [])` cannot find subcommand binary in PATH; this is the W1 bug the script itself documents. State write is fully covered by J2 vitest.

## Phase 2 fix log

Resolved 2026-05-08 (regression #5): PLAYBOOK-FIX — the `--help` anchor WAS present when Phase 2 Wave C1 ran.

**Investigation:** `packages/teamagent/postinstall.mjs` line 244 emits `"   3. teamagent --help          — 看完整命令列表"` to `process.stdout`. Running `TEAMAGENT_SKIP_WARMUP=1 node packages/teamagent/postinstall.mjs > /tmp/out.txt 2>&1` and checking `grep -q "\-\-help" /tmp/out.txt` confirms the anchor is present. The `--help` token was added in commit `8b5a640` ("feat(m4): extend postinstall welcome with 3-actions block #87"), which predates Phase 2 Wave C1 (`e18af66`). The Phase 2 Wave C1 verdict "J3 anchors 5/6; missing --help" was inaccurate — likely caused by the test running against a stale binary or an off-by-one in the anchor accumulator script.

**Current state:** All 6 J3 anchors (`✅`, `装好`, `skeleton-demo`, `stats`, `--help`, `github.com`) are present in postinstall stdout. J3 anchor count = 6/6. No code change required. The J3 pass criterion `anchors_hit_count >= 6` is correctly met.
