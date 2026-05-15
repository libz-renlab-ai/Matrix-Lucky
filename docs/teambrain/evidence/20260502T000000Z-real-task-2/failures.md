# Failures — 20260502T000000Z-real-task-2

```
   Task #1            Task #2 (this run)
   baseline    →      bootstrap closure
   10/10 PASS         10/10 PASS preserved
   4 GAPs deferred    GAP-1..GAP-4 closed
        |                    |
        v                    v
   0 errors             0 errors (no regressions, no new categories)
```

## Observed failures

No failures observed during Task #2 verification. The 10/10 PASS check matrix from Task #1 carries over because the same harness re-ran successfully against the same archive, and the Task #2 self-bootstrap also passed.

| Check | Source of truth | Observed | Verdict |
|-------|----------------|----------|---------|
| Harness exits 0 against Task #1 archive | `.judge/20260502T000000Z-real-task-1/judge.json` (overwritten by Task #2 re-run) | exit_code=0; missing_evidence=false | PASS |
| Anchor sweep on 4 owner files | harness anchor regex | 26 hits across TASK_TEMPLATE / VERIFY_TEMPLATE / claude.md / evidence/README.md (Task #1 baseline 22; +4 from H24-36 anchor expansion) | PASS |
| Canonical 12-path sweep (STRUCTURE.md) | harness CANON_PATHS array | 12 OK / 0 MISS | PASS |
| Archive gate (Task #1, 6 files) | harness ARCHIVE_REQUIRED array | 6/6 present | PASS |
| Archive gate (Task #2, 6 files) | harness ARCHIVE_REQUIRED array against Task #2 dir | 6/6 present after build | PASS |
| Pre-archive negative case for Task #2 | `.judge/20260502T000000Z-real-task-2/pre-archive-stdout.txt` | exit_code=2; archive_missing=6; missing_evidence=true | PASS (negative case behaves correctly) |
| AP-8 detector (no $(cat / $(head inside claudefast prompts) | awk detector across scripts/verify/*.sh | scripts/verify/tbrain-verify.sh exits 0 (clean); VERIFY_TEMPLATE.md still flagged as canonical failing case | PASS (binary clean; canonical failing case retained for Real Task #3+) |
| TRAP-OPS-012 verify_command (jq post-conditions on raw judge.json) | TRAP-OPS-012 row | jq -e '.missing_evidence == false and .metrics.archive_missing == 0 and .metrics.canonical_paths_missing == 0' returns true | PASS |
| Required archive layout matches evidence/README schema | evidence/README required fields table | INDEX.md, transcript.md, stdout.txt, stderr.txt, failures.md, judge-summary.json all present and non-empty | PASS |
| judge-summary.json carries all 8 required fields | evidence/README schema (post-GAP-4) | run_id / task_title / exit_code / metrics / raw_evidence_dir / archive_dir / raw_judge_path / failure_list_path all populated | PASS |

## TeamBrain framework gaps tracked from Real Task #1

| ID | Gap (Real Task #1) | Disposition (Real Task #2) |
|----|--------------------|----------------------------|
| GAP-1 | No automated harness binary in `scripts/verify/` | **CLOSED** by 9230b3c (added `scripts/verify/tbrain-verify.sh`); harness ran twice in Task #2 with the expected pass/fail behaviours. |
| GAP-2 | Archive gate enforced by convention only, no CI check | **CLOSED** by 83c54b6 (TRAP-OPS-012 binds the binary as the canonical gate; verify_command runs jq post-conditions on raw judge.json). |
| GAP-3 | LLM judge fed via `$(cat ...)` substitution inside prompt | **CLOSED** by 181ac5f (AP-8 + VERIFY-CLAUDE-007 detector; harness binary uses file paths only; canonical failing case in VERIFY_TEMPLATE.md retained for the detector to keep flagging). |
| GAP-4 | `archive_dir` not enumerated as required field in evidence/README.md | **CLOSED** by 5819ab6 (added explicit "judge-summary.json required fields" table with 8-field schema). |

## New gaps surfaced in Task #2

None. Task #2's exit floor was "no new errors beyond Task #1's 0". The harness binary, AP-8 detector, and judge-summary schema all behaved as documented; no new framework gaps surfaced. Future hardening items (e.g. wiring the harness into a real CI workflow, expanding the anchor regex set, signing judge-summary.json) are deferred to Real Task #3+ and will be tracked there if and when scoped.

## Disposition

All 10 verification checks PASS. Zero new errors versus Task #1. Day 2 H24-36 patches landed cleanly; Day 2 H36-60 self-bootstrap is a closed loop. Day 2 exit criteria 1-8 are satisfied.
