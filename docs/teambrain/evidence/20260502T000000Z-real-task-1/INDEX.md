# Evidence 20260502T000000Z-real-task-1

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
                                  .judge/20260502T000000Z-real-task-1/judge.json (raw)
```

## Real Task #1 — Day 1 H12-24

| Field | Value |
|-------|-------|
| `recipe_id` | `VERIFY-TBRAIN-001` |
| `run_id` | `20260502T000000Z-real-task-1` (stable; never appended with commit SHA) |
| `task_title` | Align run_id stability + task_title field across docs/teambrain/ |
| `owner` | Day 1 H12-24 orchestrator |
| `assignee` | Opus orchestrator (this session) |
| `reviewer` | Opus self-review + claudefast `-p` external LLM judge |
| `review_deadline` | 2026-05-02 23:59 local |
| `commit_sha (precision diffs)` | recorded post-commit below |
| `commit_sha (evidence archive)` | recorded post-commit below |
| `raw_evidence_dir` | `.judge/20260502T000000Z-real-task-1/` (local, gitignored) |
| `archive_dir` | `docs/teambrain/evidence/20260502T000000Z-real-task-1/` |

## Files in this archive

| File | Purpose |
|------|---------|
| `INDEX.md` (this) | Archive index, run_id, reviewer hand-off, commit SHAs |
| `transcript.md` | Owner task, filled TASK record, execution log, anti-mock posture |
| `stdout.txt` | Anchor + path + diff sweep stdout (44 lines) |
| `stderr.txt` | Empty (0 lines, sweep was clean) |
| `failures.md` | Per-check verdict table; 10/10 PASS; 4 GAP IDs deferred |
| `judge-summary.json` | Structured summary derived from raw judge.json |

## Raw evidence pointer

| File | Path |
|------|------|
| Raw judge JSON | `.judge/20260502T000000Z-real-task-1/judge.json` |
| Raw stdout | `.judge/20260502T000000Z-real-task-1/stdout.txt` |
| Raw stderr | `.judge/20260502T000000Z-real-task-1/stderr.txt` |

## Verdict

| Metric | Value |
|--------|-------|
| `exit_code` | 0 |
| `anchor_hits` | 22 |
| `canonical_paths_ok` | 12 |
| `canonical_paths_missing` | 0 |
| `unstaged_files_committed` | 4 |
| `missing_evidence` | false |
| `verdict` | PASS (per `failures.md`; LLM judge JSON appended to this archive after the READ stage) |

## Commit SHAs (filled after commit)

| Commit | Concern | SHA |
|--------|---------|-----|
| 1 | Precision diffs across 4 docs/teambrain/ files | `2309a9f` |
| 2 | Evidence archive + CONVERGENCE H12-24 DONE | `7e7e31b` |

## External LLM judge verdict

The separate `claudefast -p` LLM judge (Wave B) read only the raw `judge.json`, the committed `judge-summary.json`, and `failures.md`, and emitted:

```json
{"recipe_id":"VERIFY-TBRAIN-001","run_id":"20260502T000000Z-real-task-1","conclusion":"pass","notes":"All 10 checks PASS. Raw judge.json non-empty (exit_code=0, missing_evidence=false). judge-summary.json schema complete (recipe_id, run_id, task_title, exit_code, metrics, archive_dir, stdout_path, stderr_path, failure_list_path, missing_evidence, anti_mock). failures.md shows 0 observed failures. run_id matches ^20260502T000000Z-real-task-1$ exactly."}
```

Verdict file: `judge-llm-verdict.json` (raw transcript: `judge-llm-verdict.json.raw`; stderr: `judge-llm-stderr.txt`).

`run_id` is stable and DOES NOT include any commit SHA. SHAs are recorded only here, per `evidence/README.md` and `TASK_TEMPLATE.md`.
