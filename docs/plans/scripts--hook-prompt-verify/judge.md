# Judge Playbook: Hook Prompt Format and Meta-Command False-Positive (hook-prompt-verify)

> Replaces archived script `scripts/hook-prompt-verify.sh` per project rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin

- Replaced script: `docs/legacy/judge-scripts/scripts/hook-prompt-verify.sh`
- Original purpose: Judge harness for issue #86 tasks 1 and 4 — verifies humane hook prompt format via snapshot tests, and verifies meta-command false-positive reduction via keyword matcher tests; optionally exercises a synthetic PreToolUse fixture.
- Status: ACTIVE — the format snapshot tests and keyword matcher tests still exist in the codebase.

## §V1 RUN

Commands the MAIN agent dispatches (via subagent or `claudefast -p` probe).
Capture stdout/stderr to `evidence_dir = .judge/<run_id>/`.

- **Pre-check (existence guard)**: Before running any test, confirm both test files exist:
  ```bash
  test -f packages/adapters/src/hook/claude-agent-sdk/__tests__/format-snapshot.test.ts || echo "MISSING:format-snapshot"
  test -f packages/core/src/matcher/legacy/__tests__/keyword-matcher-meta-cmd.test.ts || echo "MISSING:keyword-matcher-meta-cmd"
  ```
  If either is missing, record `{"skip_reason": "test_files_absent_pre_m5_merge"}` in `judge.json` and SKIP (do not FAIL). These files were introduced in M5 (commit 485b3a4) and are only present once that branch is merged into the checkout under test.

- Step 1 (format snapshot tests): `pnpm vitest run packages/adapters/src/hook/claude-agent-sdk/__tests__/format-snapshot.test.ts > .judge/<run_id>/format-snapshot.txt 2>&1; echo $? > .judge/<run_id>/format-snapshot.exit`
- Step 2 (matcher false-positive tests): `pnpm vitest run packages/core/src/matcher/legacy/__tests__/keyword-matcher-meta-cmd.test.ts > .judge/<run_id>/matcher-fp.txt 2>&1; echo $? > .judge/<run_id>/matcher-fp.exit`
- Step 3 (fixture simulation — if fixture exists): If `.judge/fixtures/pre-tool-use-meta-cmd.json` and `packages/cli/dist/bin-pre-tool-use.cjs` both exist, pipe the fixture through the hook binary: `node packages/cli/dist/bin-pre-tool-use.cjs < .judge/fixtures/pre-tool-use-meta-cmd.json > .judge/<run_id>/sim-out.json 2> .judge/<run_id>/sim-err.txt`; record first-line char count, presence of `^   細節:` detail line, and absence of `^Error:` literal.

## §V2 DUMP

Canonical JSON written to `.judge/<run_id>/judge.json`:

```json
{
  "exit_code": 0,
  "metrics": {
    "format_snapshot_pass": 1,
    "matcher_fp_pass": 1,
    "first_line_chars": 45,
    "details_line_present": 1,
    "error_literal_present": 0,
    "meta_cmd_skipped": 0,
    "fixture_exercised": false
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/sim-err.txt",
  "stderr_path": ".judge/<run_id>/format-snapshot.txt",
  "feature_status": "active"
}
```

## §V3 READ

LLM judge prompt (run via `claudefast -p`):

> Read `.judge/<run_id>/judge.json` and supporting evidence in
> `evidence_dir`. Emit verdict `PASS` / `FAIL` / `SKIP`. Criteria:
>
> - PASS if: `format_snapshot_pass == 1` AND `matcher_fp_pass == 1`. If `fixture_exercised == true`, additionally require: `first_line_chars <= 80` AND `details_line_present == 1` AND `error_literal_present == 0`.
> - FAIL if: `format_snapshot_pass == 0` OR `matcher_fp_pass == 0`. If fixture was exercised: `first_line_chars > 80` OR `details_line_present == 0` OR `error_literal_present == 1`.
> - SKIP if:
>   - `skip_reason` key is present in `judge.json` (e.g. `"test_files_absent_pre_m5_merge"`)
>     — the test files introduced in M5 are not present in this checkout; run against a
>     checkout that includes commit 485b3a4 or later.
>   - Required infrastructure is unavailable (`pnpm vitest` not found).
>   - Feature has been deleted from the project.

## Notes

- Original logic summary: The script runs two vitest suites — the format snapshot suite ensures hook messages remain under 80 chars on the first line and include a detail line (`^   細節:`) without leaking raw `Error:` prefixes; the keyword matcher suite ensures meta-commands (like `gh issue create`) do not trigger false-positive rule matches. A synthetic PreToolUse fixture (if present) exercises the full hook binary pipeline. All results are written to a single `judge.json` with threshold annotations.
- Known limitations / dependencies:
  - Requires `pnpm vitest` to be available.
  - Hook bundle at `packages/cli/dist/bin-pre-tool-use.cjs` must be built for fixture phase.
  - The fixture path `.judge/fixtures/pre-tool-use-meta-cmd.json` must be created manually or by the PR author before running.
  - The test file paths are hardcoded; update if test files move.
  - `first_line_chars <= 80` threshold reflects the humane prompt design constraint; do not loosen without updating the feature spec.
  - Both test files (`format-snapshot.test.ts`, `keyword-matcher-meta-cmd.test.ts`) were introduced in M5 (commit 485b3a4). When running this playbook against a pre-M5 checkout, the existence pre-check will produce a SKIP verdict rather than a spurious FAIL.

## Phase 2 fix log
Resolved 2026-05-08: #2 (P2) added §V1 pre-check existence guard for both M5 test files; updated §V3 SKIP criteria to include `skip_reason: "test_files_absent_pre_m5_merge"` for pre-M5 checkouts. Commit 1016620.
