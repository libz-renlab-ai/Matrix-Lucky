# Judge Playbook: L0 Mechanical Verification (verify-l0)

> Replaces archived script `scripts/verify-l0.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/scripts/verify-l0.sh`
- Original purpose: Run five mechanical checks (tests, typecheck, hook bundle existence, end-to-end hook invocation, stats) without requiring a Claude Code session; designed to complete in ~10 seconds.
- Status: ACTIVE — all five checks address real infrastructure that still exists in the project.

## §V1 RUN

Commands the MAIN agent dispatches (via subagent or `claudefast -p` probe).
Capture stdout/stderr to `evidence_dir = .judge/<run_id>/`.

- Step 1: `pnpm test > .judge/<run_id>/tests.txt 2>&1; echo $? > .judge/<run_id>/tests.exit`
- Step 2: `pnpm typecheck > .judge/<run_id>/typecheck.txt 2>&1; echo $? > .judge/<run_id>/typecheck.exit`
- Step 3: `ls -la packages/cli/dist/bin-pre-tool-use.cjs > .judge/<run_id>/bundle.txt 2>&1; echo $? > .judge/<run_id>/bundle.exit`
- Step 4: Construct PreToolUse JSON payload for a `wget` Bash command and pipe it through `node packages/cli/dist/bin-pre-tool-use.cjs`; capture output to `.judge/<run_id>/hook-invocation.txt` and exit code to `.judge/<run_id>/hook-invocation.exit`.
- Step 5: `pnpm teamagent stats > .judge/<run_id>/stats.txt 2>&1; echo $? > .judge/<run_id>/stats.exit`

## §V2 DUMP

Canonical JSON written to `.judge/<run_id>/judge.json`:

```json
{
  "exit_code": 0,
  "metrics": {
    "tests_pass": true,
    "typecheck_pass": true,
    "hook_bundle_present": true,
    "hook_invocation_pass": true,
    "hook_response_contains_expected_keyword": true,
    "stats_exit_code": 0
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/hook-invocation.txt",
  "stderr_path": ".judge/<run_id>/typecheck.txt",
  "feature_status": "active"
}
```

## §V3 READ

LLM judge prompt (run via `claudefast -p`):

> Read `.judge/<run_id>/judge.json` and supporting evidence in
> `evidence_dir`. Emit verdict `PASS` / `FAIL` / `SKIP`. Criteria:
>
> - PASS if: `tests_pass == true` AND `typecheck_pass == true` AND `hook_bundle_present == true` AND `hook_invocation_pass == true`. Note: `hook_response_contains_expected_keyword` is now always `false` (see DEPRECATED note below); exclude it from the PASS gate.
> - FAIL if: `tests_pass`, `typecheck_pass`, `hook_bundle_present`, or `hook_invocation_pass` is false, or their exit code files contain non-zero.
> - SKIP if: required infrastructure is unavailable in this environment.

## Notes

- Original logic summary: The script ran five sequential checks: (1) `pnpm test` tail; (2) `pnpm typecheck` tail; (3) existence check for `packages/cli/dist/bin-pre-tool-use.cjs`; (4) constructed a PreToolUse JSON payload via `node -e` for a `wget` command and piped through the hook binary, asserting the response contained the Chinese phrase "先检查下载目录"; (5) `teamagent stats`. Exit 0 if all pass.
- Known limitations / dependencies:
  - Step 4 requires the hook bundle to have been built via `pnpm --filter @teamagent/cli build:hook`.
  - `teamagent stats` must be on PATH or available via `pnpm teamagent`.

### DEPRECATED: download-directory keyword check (Step 4 keyword assertion)

The assertion `hook_response_contains_expected_keyword == true` (expecting "先检查下载目录") is **DEPRECATED** and must NOT be included in the PASS gate.

**Root cause (investigated 2026-05-08):** The download-directory rule (`先检查下载目录`) existed as a learned rule at one point, but is currently in `status=dormant` / `tier=dormant` in the knowledge store (visible in `docs/teamagent-rules.html` rank #317). The rule was **never seeded** in `packages/teamagent/seed/rules.jsonl` or `packages/teamagent/seed/packs/universal.jsonl`. The keyword matcher (`packages/core/src/matcher/legacy/keyword-matcher.ts`) only processes `status=active` rules via `store.findActive()` (SQL: `WHERE status = 'active'`). Therefore, a synthetic `wget` PreToolUse payload correctly returns `decision: allow` without emitting the Chinese anchor — this is expected behavior, not a regression. The original test was asserting behavior that only existed when the rule was active in someone's local knowledge DB.

**Fix:** Remove the keyword assertion from the PASS gate. The hook invocation returning `exit 0` with a valid JSON response (`permissionDecision: allow`) is sufficient to confirm the hook pipeline works end-to-end.

## Phase 2 fix log

Resolved 2026-05-08: PLAYBOOK-FIX — download-directory rule is dormant/not-seeded; keyword assertion deprecated from PASS gate. The hook pipeline itself (bundle present, invocation returns JSON) is unbroken.
