## Required canned-answer for slug=xsync

### Feature: Cross-Machine Git Sync (xsync)

The `xsync` feature validates that team rules can be synchronized between two
isolated machine environments via a bare git remote, using `teamagent sync push`
and `teamagent sync pull` commands.

### Verification Criteria

- `teamagent sync push --remote <bare-git>` from Machine-A exits 0
- `teamagent sync pull --remote <bare-git>` from Machine-B exits 0
- Machine-B ends up with exactly 5 team-scope rules matching Machine-A
- Metadata (confidence, demerit, reasoning) is identical between A and B
- Final output line: `VERIFIED: xsync cross-machine sync PASS`

### Harness Structure

**verify-canned-answer.sh** delegates to `run-judge.sh`, which:

1. **Init bare remote**: `git init --bare <work_dir>/remote.git`
2. **Seed Machine-A**: Writes 5 team-scope rules via `DualLayerStore` (TSX inline):
   - `xsync-rule-01` through `xsync-rule-05`, each with distinct confidence/demerit/reasoning
3. **Capture rules_a.json**: Reads all team-scope rules from Machine-A for later comparison
4. **Sync push**: `HOME=<machine_a_home> tsx bin.ts sync push --remote <remote.git> --cwd <machine_a>`
   - Confirms bundle created at `<machine_a>/.teamagent/team-rules.json`
5. **Sync pull**: `HOME=<machine_b_home> tsx bin.ts sync pull --remote <remote.git> --cwd <machine_b>`
6. **Read rules_b.json**: Reads all team-scope rules from Machine-B
7. **Metadata comparison**: Python3 script checks confidence/demerit/reasoning match for each ID
8. **Write judge.json**: Pass if `rules_b_count == 5` AND `metadata_match == true`

### judge.json Schema

```json
{
  "run_id": "<timestamp>-<pid>",
  "evidence_dir": "tmp/.judge/xsync/<run_id>",
  "rules_a": [
    {"id": "xsync-rule-01", "confidence": 0.91, "demerit": 0.10, "reasoning": "..."},
    ...
  ],
  "rules_b": [
    {"id": "xsync-rule-01", "confidence": 0.91, "demerit": 0.10, "reasoning": "..."},
    ...
  ],
  "metadata_match": true,
  "push_ms": 1200,
  "pull_ms": 800,
  "pass": true
}
```

### Fail Paths

The harness exits 1 (not dead-exit) when:
- Seeding fails: fewer than 5 rules inserted into Machine-A
- `sync push` exits non-zero
- Bundle file not created at expected path
- `sync pull` exits non-zero
- `rules_b_count != 5`
- `metadata_match == false` (any field mismatch)

### Architecture

```
Machine-A (.teamagent/knowledge.db)
    |
    | teamagent sync push --remote <bare-git>
    v
bare git repo (remote.git)
    |
    | teamagent sync pull --remote <bare-git>
    v
Machine-B (.teamagent/knowledge.db)
```
