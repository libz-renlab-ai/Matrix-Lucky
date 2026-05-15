## Required canned-answer for slug=team-share

### Feature: Team Knowledge Export/Import Round-Trip

The `team-share` feature validates that knowledge rules can be exported from one
team brain (Brain-A) and imported into another (Brain-B) with full fidelity,
preserving all rule metadata including confidence, demerit scores, and reasoning.

### Verification Criteria

- `team-import` of fixture bundle into Brain-A exits 0
- `team-export` from Brain-A exits 0 and produces a valid export file
- `team-import` of exported bundle into Brain-B exits 0
- Brain-B contains all rules that were in Brain-A (no missing_rule_ids)
- Extra rules in Brain-B are acceptable (empty extra_rule_ids also acceptable)
- Final output line: `VERIFIED: team-share round-trip PASS`

### Harness Structure

The `verify-canned-answer.sh` delegates to `run-transfer-judge.sh`, which:
1. Creates isolated Brain-A and Brain-B directories under `tmp/.judge/team-transfer/<run_id>/`
2. **Step 1**: Imports `fixture-rules.json` into Brain-A via `tsx bin.ts team-import --file <fixture>`
3. **Step 2**: Exports from Brain-A via `tsx bin.ts team-export --out <export_file>`
4. **Step 3**: Imports exported bundle into Brain-B via `tsx bin.ts team-import --file <export_file>`
5. **Step 4**: Counts active team-scope rules in each brain via SQLite (`knowledge` table, `scope_level='team'`, `status='active'`)
6. **Step 5**: Computes missing/extra rule IDs between A and B
7. **Step 6**: Writes `judge.json` with fields: `run_id`, `exit_codes`, `brain_a_rule_count`, `brain_b_rule_count`, `missing_rule_ids`, `extra_rule_ids`, `evidence_dir`, `stdout_path`

### judge.json Schema

```json
{
  "run_id": "<timestamp>-<pid>",
  "exit_codes": {
    "import_fixture_to_a": 0,
    "export": 0,
    "import_to_b": 0
  },
  "brain_a_rule_count": 3,
  "brain_b_rule_count": 3,
  "missing_rule_ids": [],
  "extra_rule_ids": [],
  "evidence_dir": "/path/to/evidence",
  "stdout_path": "/path/to/stdout.log"
}
```

### Fail Paths

The harness exits 1 (not dead-exit) when:
- Any `team-import` or `team-export` step exits non-zero
- `missing_rule_ids` is non-empty (rules lost during transfer)
