# Judge Playbook: universal-pack / run-judge

> Replaces archived script `docs/legacy/judge-scripts/docs/features/universal-pack/run-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/universal-pack/run-judge.sh`
- Original purpose: Validate the universal seed pack JSONL file (12–18 entries, AC-required fields) and confirm vitest contract + init regression tests pass.
- Status: **ACTIVE**

## §V1 RUN

Concrete commands (extracted from source):

- Step 1: Mechanical pack file inspection — run the embedded Node ESM script against `packages/teamagent/seed/packs/universal.jsonl`; capture result as `evidence_dir/pack-check.json`. The script checks:
  - File exists.
  - Lines parse as valid JSONL.
  - Entry count is 12–18 (inclusive).
  - No duplicate `id` fields.
  - Every entry satisfies AC-required fields: `channel == "tool-action"`, `enforcement == "block"`, `confidence == 0.85`, `source == "preset"`, `scope.level == "global"`, `status == "active"`, `wrong_pattern` non-empty with length >= 3.
- Step 2: Run dedicated vitest suite — `pnpm vitest run packages/cli/src/__tests__/seed-pack-universal.test.ts --reporter=json --outputFile=<evidence_dir>/vitest-pack.json`.
- Step 3: Run init regression tests — `pnpm vitest run packages/cli/src/__tests__/init.test.ts --reporter=json --outputFile=<evidence_dir>/vitest-init.json`.
- Step 4: Write `judge.json` combining all three results (pack_check_ok, pack_vitest_ok, init_vitest_ok) into `evidence_dir`.
- Step 5: Exit 0 if `overall_pass == true`; exit 1 otherwise.

Capture to `evidence_dir = .judge/universal-pack/<run_id>/`.

## §V2 DUMP

```json
{
  "exit_code": 0,
  "metrics": {
    "pack_path": "packages/teamagent/seed/packs/universal.jsonl",
    "pack_count": 15,
    "pack_check_ok": true,
    "pack_vitest_ok": true,
    "pack_vitest_pass": 5,
    "pack_vitest_fail": 0,
    "init_vitest_ok": true,
    "init_vitest_pass": 8,
    "init_vitest_fail": 0,
    "overall_pass": true
  },
  "evidence_dir": ".judge/universal-pack/<run_id>",
  "stdout_path": ".judge/universal-pack/<run_id>/stdout.log",
  "stderr_path": ".judge/universal-pack/<run_id>/stdout.log",
  "feature_status": "active"
}
```

## §V3 READ

`claudefast -p` prompt:
> Read judge.json + evidence_dir. PASS / FAIL / SKIP.
> PASS criteria: `overall_pass` is `true`, meaning all three sub-checks pass: `pack_check_ok` (file exists, 12–18 entries, all AC-required field values correct, no duplicates), `pack_vitest_ok` (dedicated contract test suite exits 0), and `init_vitest_ok` (init regression suite exits 0).
> FAIL criteria: Any of `pack_check_ok`, `pack_vitest_ok`, or `init_vitest_ok` is `false`. Check `evidence_dir/pack-check.json` `.problems` array and vitest JSON `testResults` for individual failure details.
> SKIP if `packages/teamagent/seed/packs/universal.jsonl` is absent and `pnpm` / `vitest` infra is missing.

## Notes

- Original logic summary: The harness performs two complementary verification layers. First, a pure mechanical inspection using a Node ESM inline script validates the raw JSONL file against all acceptance-criteria field constraints (channel, enforcement, confidence, source, scope.level, status, wrong_pattern length) without running any app code. Second, it runs two vitest suites: the dedicated `seed-pack-universal.test.ts` contract suite (which exercises the schema validator and matcher logic against the actual pack), and `init.test.ts` as a pack-loading regression guard. All three must pass for `overall_pass = true`.
- Dependencies / limitations:
  - Requires `pnpm install` to have been run.
  - The JSONL entry count range (12–18) is a hard AC requirement from issue #88; changing the pack size outside this range is intentional drift that must be reflected here.
  - The Node ESM inline script requires Node 18+ (native ESM `--input-type=module`).
  - `pnpm vitest run` must be available in PATH as resolved by `pnpm exec`.
  - No `claudefast` call in this harness — verdict is purely mechanical (exit code from vitest + pack check script).

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
