# Evidence 20260502T000000Z-real-task-2

```
 INDEX.md (this) ─┐
 transcript.md ───┼─ committed audit archive ──> reviewer reads
 stdout.txt    ───┤
 stderr.txt    ───┤
 failures.md   ───┤
 judge-summary ───┘
                                          pointers to raw evidence
                                                   │
                                                   v
                                  .judge/20260502T000000Z-real-task-2/judge.json (raw)
```

## Real Task #2 — Day 2 H36-60

| Field | Value |
|-------|-------|
| `recipe_id` | `VERIFY-TBRAIN-002` |
| `run_id` | `20260502T000000Z-real-task-2` (stable; never appended with commit SHA) |
| `task_title` | Run scripts/verify/tbrain-verify.sh against Real Task #1 evidence dir; build self-bootstrap evidence archive |
| `owner` | Day 2 H36-60 orchestrator |
| `assignee` | Opus orchestrator (this session) |
| `reviewer` | Opus self-review + claudefast `-p` external LLM judge (file-path mode per AP-8) |
| `review_deadline` | 2026-05-02 H60 local |
| `commit_sha (precision diffs)` | recorded post-commit below |
| `commit_sha (evidence archive)` | recorded post-commit below |
| `raw_evidence_dir` | `.judge/20260502T000000Z-real-task-2/` (local, gitignored) |
| `archive_dir` | `docs/teambrain/evidence/20260502T000000Z-real-task-2/` |

## Files in this archive

| File | Purpose |
|------|---------|
| `INDEX.md` (this) | Archive index, run_id, reviewer hand-off, commit SHAs |
| `transcript.md` | Owner task, filled TASK record, execution log, anti-mock posture |
| `stdout.txt` | Harness binary stdout: anchor sweep + path sweep + archive gate (per RUN stage) |
| `stderr.txt` | Harness stderr (empty when sweep is clean) |
| `failures.md` | Per-check verdict table; 0 errors carried over from Task #1; 0 new errors introduced |
| `judge-summary.json` | Structured summary derived from raw judge.json (8 required fields per evidence/README) |

## Raw evidence pointer

| File | Path |
|------|------|
| Raw judge JSON (Task #2 self-verify) | `.judge/20260502T000000Z-real-task-2/judge.json` |
| Raw stdout (harness against Task #1) | `.judge/20260502T000000Z-real-task-2/task1-verify-stdout.txt` |
| Raw stderr (harness against Task #1) | `.judge/20260502T000000Z-real-task-2/task1-verify-stderr.txt` |
| Captured Task #1 judge.json (Task #2 input) | `.judge/20260502T000000Z-real-task-2/task1-judge.json` |
| Pre-archive negative-case stdout | `.judge/20260502T000000Z-real-task-2/pre-archive-stdout.txt` |

## Verdict

| Metric | Value |
|--------|-------|
| `exit_code` (post-archive self-verify) | 0 |
| `anchor_hits` | 26 (Task #1 baseline 22; +4 from H24-36 anchor expansion in claude.md and evidence/README.md) |
| `canonical_paths_ok` | 12 / 12 |
| `canonical_paths_missing` | 0 |
| `archive_present` | 6 / 6 |
| `missing_evidence` | false |
| `verdict` | PASS — Task #1 passes harness re-verification AND Task #2 archive itself satisfies the gate |

## Bootstrap closure

Task #2 demonstrates the harness verifying its own evidence chain:

1. **Harness against Task #1** — `scripts/verify/tbrain-verify.sh VERIFY-TBRAIN-001 20260502T000000Z-real-task-1` exits 0; raw `.judge/.../judge.json` shows `missing_evidence=false`. Task #1 holds up under the new binary.
2. **Harness against Task #2 (pre-archive)** — exits 2 with `archive_missing=6`, `missing_evidence=true`. Negative case captured to `pre-archive-stdout.txt`.
3. **Archive built** — six required files written under `docs/teambrain/evidence/20260502T000000Z-real-task-2/`.
4. **Harness against Task #2 (post-archive)** — exits 0; `archive_present=6/6`; `judge.json` overwritten with the passing snapshot.

This bootstrap loop closes GAP-1 (executable harness exists) and GAP-2 (archive gate enforced by binary) for the first time on a real task.

## Commit SHAs (filled after commit)

| Commit | Concern | SHA |
|--------|---------|-----|
| 1 | scripts/verify/tbrain-verify.sh harness binary (GAP-1) | `9230b3c` |
| 2 | TRAP-OPS-012 archive gate harness binding (GAP-2) | `83c54b6` |
| 3 | AP-8 file-path-only judge rule (GAP-3) | `181ac5f` |
| 4 | judge-summary.json required-fields enumeration (GAP-4) | `5819ab6` |
| 5 | Real Task #2 evidence archive + CONVERGENCE H24-36/H36-60 DONE | `8f0076e` |

## External LLM judge verdict

Issued by a separate `claudefast -p` invocation (file-path mode, per AP-8) reading only:

- `.judge/20260502T000000Z-real-task-2/judge.json` (raw harness dump; uses keys `evidence_dir`/`stdout_path`/`stderr_path`)
- `docs/teambrain/evidence/20260502T000000Z-real-task-2/judge-summary.json` (committed summary; uses the 8 required keys per `evidence/README.md`)
- `docs/teambrain/evidence/20260502T000000Z-real-task-2/failures.md`
- `docs/teambrain/evidence/20260502T000000Z-real-task-2/INDEX.md`

### Attempt 1 (preserved as evidence of judge schema-confusion)

Attempt 1 prompted the judge to confirm the 8-field schema against `judge-summary.json` but did not call out that the raw `judge.json` deliberately uses a different (lower-level) schema with `evidence_dir`/`stdout_path`. The judge conflated the two files and emitted `conclusion=fail`, even though the on-disk `judge-summary.json` does carry all 8 required keys (`jq -e` confirms this). Transcript preserved at `.judge/20260502T000000Z-real-task-2/judge-llm-stream-attempt1.jsonl`. This becomes a useful regression-test seed for prompt clarity in Real Task #3+ and is itself a real-world example of why GAP-3's right-pattern (file paths + clear schema disambiguation) matters.

### Attempt 2 (canonical Day 2 verdict)

Attempt 2 explicitly disambiguates the two schemas in the prompt and re-asks the same conditions. Transcript: `.judge/20260502T000000Z-real-task-2/judge-llm-stream.jsonl` (raw). Final structured verdict mirrored to `judge-llm-verdict.json` in this archive.

`run_id` is stable and DOES NOT include any commit SHA. SHAs are recorded only here, per `evidence/README.md` and `TASK_TEMPLATE.md`.
