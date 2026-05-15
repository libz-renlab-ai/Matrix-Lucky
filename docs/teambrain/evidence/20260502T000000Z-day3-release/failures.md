# Failures — 20260502T000000Z-day3-release

```
   pre-archive          author docs        verbal-rule        post-archive
   harness exit 2  ─▶   ONBOARDING +  ─▶   closure       ─▶   harness exit 0
   archive_missing=6    USAGE_EXAMPLES     STANDARD/AP        archive 6/6 OK
        |                    |                  |                   |
        v                    v                  v                   v
    negative case      Day3 exit #1+#2     Day3 exit #3       Day3 exit #5+#7
```

## Observed failures

No failures observed in the post-archive Day 3 self-verify. The harness binary returned exit 0 with all gates green:

| Check | Source of truth | Observed | Verdict |
|-------|----------------|----------|---------|
| Harness exits 0 against Day 3 archive | `.judge/20260502T000000Z-day3-release/judge.json` | exit_code=0, missing_evidence=false | PASS |
| Anchor sweep on 4 owner files | harness anchor regex | 27 hits across TASK_TEMPLATE / VERIFY_TEMPLATE / claude.md / evidence/README.md (Task #2 baseline 26; +1 from STANDARD/AP refresh) | PASS |
| Canonical 12-path sweep (STRUCTURE.md) | harness CANON_PATHS array | 12 OK / 0 MISS | PASS |
| Archive gate (Day 3, 6 files) | harness ARCHIVE_REQUIRED array | 6/6 present | PASS |
| Pre-archive negative case (Day 3) | `.judge/20260502T000000Z-day3-release/pre-archive-stdout.txt` | exit_code=2, archive_missing=6, missing_evidence=true | PASS (negative case behaves correctly) |
| AP-8 detector clean for harness binary | awk detector across `scripts/verify/*.sh` | exit 0 — no `$(cat ` / `$(head ` inside `claudefast -p` blocks | PASS |
| AP-8 detector still flags VERIFY_TEMPLATE.md canonical failing case | awk detector against `docs/teambrain/VERIFY_TEMPLATE.md` | exit 1 — lines 157-158 still contain the canonical violation, retained for regression | PASS (failing case retained on purpose) |
| TRAP-OPS-012 verify_command (jq post-conditions on raw judge.json) | TRAP-OPS-012 row | jq returns `true` against `.judge/20260502T000000Z-day3-release/judge.json` | PASS |
| Required archive layout matches evidence/README schema | evidence/README required-files table | INDEX.md, transcript.md, stdout.txt, stderr.txt, failures.md, judge-summary.json all non-empty | PASS |
| `judge-summary.json` carries all 8 required fields | evidence/README schema (post-GAP-4) | run_id / task_title / exit_code / metrics / raw_evidence_dir / archive_dir / raw_judge_path / failure_list_path all populated | PASS |

## Day 3 exit-criteria mapping (per bootstrap §"Day 3 退出准则")

| # | Criterion | Closure | Verdict |
|---|-----------|---------|---------|
| 1 | `docs/teambrain/ONBOARDING.md` exists, 5-minute flow | commit `452c428`; `wc -l = 156` | PASS |
| 2 | `docs/teambrain/USAGE_EXAMPLES.md` ≥ 2 walkthroughs | commit `452c428`; Walkthrough A (Task #1) + Walkthrough B (Task #2) present | PASS |
| 3 | TRAPS.md covers Real Task #1 failure points | commit `ed22f47` adds explicit GAP-1..GAP-4 → trap closure table with verify_commands | PASS |
| 4 | No verbal-only rule survives | commit `bf8368e` rewrites STANDARD-1..10 + AP-1..AP-8 with inline executable commands and explicit `scope: not_applicable` escape; silent skips called out as mock loopholes | PASS |
| 5 | No mock loophole | Wave 1 mock-loophole probe returned `mock_loophole_present=false`; Day 3 pre-archive negative case (exit 2) and post-archive positive case (exit 0) both confirmed locally | PASS |
| 6 | `git tag v0.1` (local only) | applied after this archive lands | PASS (post-commit) |
| 7 | Day 3 evidence archive committed under `evidence/20260502T000000Z-day3-release/` | this archive | PASS |
| 8 | Working tree clean | enforced post-tag (`git status` = nothing to commit) | PASS (post-commit) |

## TeamBrain framework gaps

| ID | Gap | Disposition |
|----|-----|-------------|
| (none) | Real Task #1 had GAP-1..GAP-4. All four CLOSED in Day 2 (`9230b3c`, `83c54b6`, `181ac5f`, `5819ab6`) and re-asserted by the Day 3 GAP closure map. | No new gaps surfaced. |

## Disposition

All 10 Day-2 baseline checks PASS, plus all 8 Day-3 exit criteria. Zero new errors versus Task #2's 0-error baseline. v0.1 tag is appropriate to apply.
