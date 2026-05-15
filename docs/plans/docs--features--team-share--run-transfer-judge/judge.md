# Judge Playbook: Team Share — Run Transfer Judge (Export/Import Round-Trip)

> Replaces archived script `docs/legacy/judge-scripts/docs/features/team-share/run-transfer-judge.sh` per rule
> "third-party judge harness forbidden fixed scripts; MUST use md playbook"
> (`docs/HOWTO-PLAN-PR.md` § 3b).

## Origin
- Replaced script: `docs/legacy/judge-scripts/docs/features/team-share/run-transfer-judge.sh`
- Original purpose: Prove the `team-export → team-import` round-trip transfers all team-scoped active knowledge rules from one isolated brain directory (brain-A) to another (brain-B) without loss or spurious additions.
- Status: **ACTIVE**

## §V1 RUN
Commands MAIN agent dispatches; capture to `evidence_dir = tmp/.judge/team-transfer/<run_id>/`:
- Step 1: Create ephemeral brain directories:
  ```
  evidence_dir/brain-A/.teamagent/
  evidence_dir/brain-B/.teamagent/
  ```
- Step 2: Import fixture bundle into brain-A (cwd = `brain-A`):
  ```bash
  cd brain-A
  node_modules/.bin/tsx packages/cli/src/bin.ts team-import --file docs/features/team-share/fixture-rules.json
  ```
  Record exit code as `import_fixture_to_a`.
- Step 3: Export from brain-A to `evidence_dir/export.json` (cwd = `brain-A`):
  ```bash
  cd brain-A
  node_modules/.bin/tsx packages/cli/src/bin.ts team-export --out <evidence_dir>/export.json
  ```
  Record exit code as `export`. Note the size of `export.json` in bytes.
- Step 4: Import `evidence_dir/export.json` into brain-B (cwd = `brain-B`):
  ```bash
  cd brain-B
  node_modules/.bin/tsx packages/cli/src/bin.ts team-import --file <evidence_dir>/export.json
  ```
  Record exit code as `import_to_b`.
- Step 5: Count active team-scope rules in each brain DB using `node:sqlite` (`DatabaseSync`):
  ```sql
  SELECT COUNT(*) as cnt FROM knowledge WHERE scope_level='team' AND status='active'
  ```
  DB paths: `brain-A/.teamagent/knowledge.db` and `brain-B/.teamagent/knowledge.db`.
  Record as `brain_a_rule_count` and `brain_b_rule_count`.
- Step 6: Extract ordered rule IDs from both DBs:
  ```sql
  SELECT id FROM knowledge WHERE scope_level='team' AND status='active' ORDER BY id
  ```
  Compute `missing_rule_ids` (in A but not B) and `extra_rule_ids` (in B but not A).

## §V2 DUMP
JSON to `<evidence_dir>/judge.json`:
```json
{ "exit_code": 0,
  "metrics": {
    "exit_codes": { "import_fixture_to_a": 0, "export": 0, "import_to_b": 0 },
    "brain_a_rule_count": 0,
    "brain_b_rule_count": 0,
    "missing_rule_ids": [],
    "extra_rule_ids": []
  },
  "evidence_dir": "tmp/.judge/team-transfer/<run_id>",
  "stdout_path": "tmp/.judge/team-transfer/<run_id>/stdout.log",
  "feature_status": "active" }
```

## §V3 READ
`claudefast -p` prompt:
> Read judge.json + evidence_dir. Emit PASS / FAIL / SKIP.
> PASS criteria:
>   (1) All three exit codes are 0 (`import_fixture_to_a`, `export`, `import_to_b`);
>   (2) `brain_b_rule_count == brain_a_rule_count` (all rules transferred);
>   (3) `missing_rule_ids` is empty (no rules lost);
>   (4) `extra_rule_ids` is empty (no spurious rules added).
>   All four conditions must hold for PASS.
> FAIL criteria: any exit code non-zero, or counts differ, or missing/extra IDs non-empty.
> SKIP if feature deleted at d341da8: not applicable — team-share is an active feature; do not emit SKIP.

## Notes
- Original logic summary: The harness created two isolated brain directories under `tmp/.judge/team-transfer/<run_id>/`. It ran `tsx packages/cli/src/bin.ts team-import` in brain-A's cwd to seed fixture knowledge from `docs/features/team-share/fixture-rules.json`, then `team-export` to a shared JSON file, then `team-import` again in brain-B's cwd. It queried each brain's SQLite DB (`knowledge.db`) using `node:sqlite` (`DatabaseSync`) — table name is `knowledge` (not `knowledge_entries`) with columns `scope_level`, `status`, and `id`. ID diff was computed via a Node ESM heredoc using `Set` operations, then formatted with `python3`. Results were written to `judge.json`.
- Dependencies / limitations:
  - Requires `pnpm install` completed; `node_modules/.bin/tsx` must exist
  - Fixture file: `docs/features/team-share/fixture-rules.json` must exist and contain team-scoped rules
  - Uses `node:sqlite` (`DatabaseSync`) which requires Node 22+; ensure the runtime Node version supports it
  - `cwd` matters: both `team-import` and `team-export` use `process.cwd()` to locate `.teamagent/knowledge.db` — the harness explicitly `cd`s to each brain dir before each command
  - Evidence is written under `tmp/` (not `.judge/`) — this is intentional (original script used `$REPO_ROOT/tmp/.judge/team-transfer/`); MAIN agent should ensure `tmp/` is gitignored
  - The diff computation originally required `python3` for JSON parsing — the LLM judge should verify `missing_rule_ids == []` and `extra_rule_ids == []` directly from the JSON fields without re-running python3
