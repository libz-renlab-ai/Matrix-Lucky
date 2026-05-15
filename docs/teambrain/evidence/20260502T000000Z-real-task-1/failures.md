# Failures — 20260502T000000Z-real-task-1

```
   anchor sweep    path sweep    diff stat    archive gate
        |              |             |             |
        v              v             v             v
   22 hits / 0    12 / 12 OK     4 files       6/6 files
       miss                       changed       non-empty
```

## Observed failures

No failures observed during the verification capture. Detailed evidence:

| Check | Expected | Observed | Verdict |
|-------|----------|----------|---------|
| `TASK_TEMPLATE.md` run_id stability anchor | line containing "must stay stable for the run" | line 152 hit | PASS |
| `VERIFY_TEMPLATE.md` `TASK_TITLE` shell var | declared and used in judge.json + INDEX | lines 63, 89, 132 hit | PASS |
| `VERIFY_TEMPLATE.md` `archive_dir` field | present in `judge.json` block and `judge-summary.json` block | lines 95, 122 hit | PASS |
| `VERIFY_TEMPLATE.md` judge schema | `Output JSON with recipe_id, run_id, conclusion, and notes` | line 155 hit | PASS |
| `agent_rules/claude.md` AP-2 wording | `metrics` and `missing_evidence` (no `/status`) | lines 113, 167 hit | PASS |
| `evidence/README.md` run_id stability | `Never append or replace it with a commit SHA` | line 32 hit | PASS |
| Canonical path sweep | 12/12 paths non-empty | 12 OK / 0 MISS | PASS |
| Unstaged diff stat | exactly 4 files | 4 files (TASK_TEMPLATE.md, VERIFY_TEMPLATE.md, agent_rules/claude.md, evidence/README.md) | PASS |
| Required archive gate | INDEX.md, transcript.md, stdout.txt, stderr.txt, failures.md, judge-summary.json non-empty | all 6 present | PASS |
| Raw judge JSON | `.judge/<run_id>/judge.json` non-empty | written, 30 lines | PASS |

## TeamBrain framework gaps surfaced (not Real Task #1 failures, but tracked)

| ID | Gap | Disposition |
|----|-----|-------------|
| GAP-1 | No automated harness binary lives in repo yet — `VERIFY_TEMPLATE.md` ships only a skeleton, not an executable script under `scripts/verify/`. | Defer to Real Task #2; document in `transcript.md`. |
| GAP-2 | Required archive gate is enforced by convention, not by a CI check. | Defer to Real Task #2; track via TRAPS.md when prioritised. |
| GAP-3 | The `LLM judge` invocation in `VERIFY_TEMPLATE.md` shells out to `claudefast -p "..."` with command-substituted file contents — fine for skeleton, but a real harness should pass file paths and let the judge `Read` them. | Defer; capture as future hardening item. |
| GAP-4 | `evidence/README.md` does not yet enumerate that `archive_dir` is a required field in `judge-summary.json`. | Minor doc clarification; not blocking Real Task #1. |

## Disposition

All 10 verification checks PASS. No regressions. Day 1 H12-24 exit criteria 1, 2, 3 satisfied.
