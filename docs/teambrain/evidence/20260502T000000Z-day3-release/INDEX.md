# Evidence 20260502T000000Z-day3-release

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
                                  .judge/20260502T000000Z-day3-release/judge.json (raw)
```

## Day 3 — H60-72 Release v0.1

| Field | Value |
|-------|-------|
| `recipe_id` | `VERIFY-TBRAIN-003` |
| `run_id` | `20260502T000000Z-day3-release` (stable; never appended with commit SHA) |
| `task_title` | Day 3 release v0.1 — onboarding/usage docs + verbal-rule closure |
| `owner` | Day 3 H60-72 orchestrator |
| `assignee` | Opus orchestrator (this session) |
| `reviewer` | claudefast `-p` external LLM judge (file-path mode per AP-8) |
| `review_deadline` | 2026-05-02 H72 local |
| `commit_sha (ONBOARDING + USAGE_EXAMPLES)` | `452c428` |
| `commit_sha (GAP closure map)` | `ed22f47` |
| `commit_sha (verbal-rule closure)` | `bf8368e` |
| `commit_sha (evidence archive + CONVERGENCE Day 3 DONE)` | `de977b3` |
| `commit_sha (external LLM judge verdict)` | `b2fcb1e` |
| `raw_evidence_dir` | `.judge/20260502T000000Z-day3-release/` (local, gitignored) |
| `archive_dir` | `docs/teambrain/evidence/20260502T000000Z-day3-release/` |

## Files in this archive

| File | Purpose |
|------|---------|
| `INDEX.md` (this) | Archive index, run_id, reviewer hand-off, commit SHAs |
| `transcript.md` | Owner task, Day 3 task plan + execution log |
| `stdout.txt` | Harness binary stdout: anchor sweep + path sweep + archive gate |
| `stderr.txt` | Harness stderr (empty when sweep is clean) |
| `failures.md` | Per-check verdict table; Day 3 exit-criteria mapping |
| `judge-summary.json` | Structured summary derived from raw judge.json (8 required fields) |

## Raw evidence pointers

| File | Path |
|------|------|
| Raw judge JSON (post-archive Day 3) | `.judge/20260502T000000Z-day3-release/judge.json` |
| Pre-archive negative-case stdout | `.judge/20260502T000000Z-day3-release/pre-archive-stdout.txt` |
| Pre-archive negative-case judge | `.judge/20260502T000000Z-day3-release/pre-archive-judge.json` |
| External LLM judge stream | `.judge/20260502T000000Z-day3-release/judge-llm-stream.jsonl` |

## Verdict

| Metric | Value |
|--------|-------|
| `exit_code` (post-archive self-verify) | 0 |
| `anchor_hits` | 27 |
| `canonical_paths_ok` | 12 / 12 |
| `canonical_paths_missing` | 0 |
| `archive_present` | 6 / 6 |
| `missing_evidence` | false |
| `verdict` | PASS |

## Day 3 exit criteria (per bootstrap spec §"Day 3 退出准则")

| # | Criterion | Closure |
|---|-----------|---------|
| 1 | `docs/teambrain/ONBOARDING.md` exists, contains 5-minute flow | `452c428` adds 156-line ONBOARDING.md with 5 timed steps + verification block |
| 2 | `docs/teambrain/USAGE_EXAMPLES.md` exists with ≥ 2 walkthroughs | `452c428` adds 159-line file with Walkthrough A (Task #1) + Walkthrough B (Task #2) |
| 3 | TRAPS.md covers Real Task #1 failure points | `ed22f47` adds explicit "Real Task #1 GAP closure" table (GAP-1..GAP-4 each → trap entry + verify_command) |
| 4 | No verbal-only rule survives | `bf8368e` replaces every AP-1..AP-8 `Catch:` and STANDARD-1..10 verify line with an inline executable command + scope marker |
| 5 | No mock loophole | `scripts/verify/tbrain-verify.sh` actually reads disk, writes raw judge.json, gates on `archive_missing` and `canonical_paths_missing`; mock-loophole probe (Wave 1) confirms `mock_loophole_present=false` |
| 6 | `git tag v0.1` (local only) | applied post-commit |
| 7 | Day 3 evidence archive committed under this dir | this archive |
| 8 | Working tree clean | enforced post-tag |

## External LLM judge verdict

Issued by a separate `claudefast -p` invocation (file-path mode, AP-8 right-pattern) reading only:

- `.judge/20260502T000000Z-day3-release/judge.json`
- `docs/teambrain/evidence/20260502T000000Z-day3-release/judge-summary.json`
- `docs/teambrain/evidence/20260502T000000Z-day3-release/failures.md`
- `docs/teambrain/evidence/20260502T000000Z-day3-release/INDEX.md`
- `docs/teambrain/ONBOARDING.md`
- `docs/teambrain/USAGE_EXAMPLES.md`

Verdict captured in `.judge/20260502T000000Z-day3-release/judge-llm-stream.jsonl`. Final structured verdict mirrored to `judge-llm-verdict.json` in this archive:

```json
{"recipe_id":"VERIFY-TBRAIN-003","run_id":"20260502T000000Z-day3-release","conclusion":"pass","notes":"All 8 pass conditions met. raw judge.json exit_code=0, missing_evidence=false, archive_missing=0, canonical_paths_missing=0. judge-summary.json has all 8 required keys. failures.md shows 0 observed failures and all 8 Day 3 exit criteria PASS. ONBOARDING.md (156 lines) and USAGE_EXAMPLES.md (159 lines) exist non-empty. run_id is stable with no commit SHA appended."}
```

`run_id` is stable and DOES NOT include any commit SHA. SHAs are recorded only here, per `evidence/README.md` and `TASK_TEMPLATE.md`.
