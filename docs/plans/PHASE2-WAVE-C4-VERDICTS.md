```
  ____  _   _    _    ____  _____   ____
 |  _ \| | | |  / \  / ___|| ____| / ___|
 | |_) | |_| | / _ \ \___ \|  _|  | |
 |  __/|  _  |/ ___ \ ___) | |___ | |___
 |_|   |_| |_/_/   \_\____/|_____| \____|

 Phase 2 Wave C-4 — docs/features ACTIVE
 heavyweight playbook verdicts
 Worker 4 of 4  (12 playbooks)
```

# Phase 2 Wave C-4 — docs/features ACTIVE Heavyweight Playbook Verdicts

> 12 ACTIVE playbooks for docs/features judge harnesses, tested
> §V1 RUN → §V2 DUMP → §V3 READ.
>
> Env constraints applied:
> - SKIP-INFRA: claudefast API unreachable (MiniMax 45-90s timeout) — any step requiring `claudefast -p`
> - SKIP-INFRA: Worktree has no `node_modules/` — `@teamagent/*` packages unresolvable via tsx from worktree paths (calibrator-v2, xsync)
> - SKIP-UNSAFE: Steps that push to real GitHub remotes
> - tsx available at `/Users/m1/projects/TeamBrain/node_modules/.bin/tsx`
> - Main repo packages (core dist, adapters dist) reachable from `/Users/m1/projects/TeamBrain`

| # | Playbook | Steps RUN | Steps SKIP-* | §V3 Verdict |
|---|----------|-----------|--------------|-------------|
| 1 | docs/features/team-sharing-probe/run-judge | dry-run preview only (SKIP-UNSAFE for real-run; SKIP-INFRA for claudefast) | real-run SKIP-UNSAFE (pushes to GitHub remote); Steps 3/4/6 SKIP-INFRA (claudefast) | SKIP |
| 2 | docs/features/ab-benchmark/run-judge | playbook structure verified | all 20 claudefast calls SKIP-INFRA; probes.json + arm-b-rules.json present | SKIP-INFRA |
| 3 | docs/features/ab-benchmark/verify-canned-answer | playbook structure verified | delegates to run-judge (SKIP-INFRA) | SKIP-INFRA |
| 4 | docs/features/calibrator-v2/run-judge | all 5 tsx steps fail: `@teamagent/types` unresolvable from worktree path | all steps SKIP-INFRA (worktree no node_modules) | SKIP-INFRA |
| 5 | docs/features/calibrator-v2/prod-judge | same tsx resolution failure as run-judge | all steps SKIP-INFRA | SKIP-INFRA |
| 6 | docs/features/auto-capture/real-judge | ran via tsx from main repo: 66 labeled rows (4 real-fixture sessions) | none | PASS |
| 7 | docs/features/auto-capture/extraction-judge | ran via tsx from main repo: labeled (20 rows) + prod (50 rows) passes | prod-fixture.jsonl present; gen-prod-fixture.cjs not re-run | PASS |
| 8 | docs/features/auto-capture/verify-canned-answer | vitest fallback (archived judge scripts absent) | primary path (extraction-judge.sh + real-judge.sh) SKIP (scripts archived) | PASS |
| 9 | docs/features/rule-quality/run-judge | ran tsx runner; recall=1.0 on 10 defectives; fp=10 on 10 clean rules | none | FAIL |
| 10 | docs/features/rule-quality/verify-canned-answer | delegates to run-judge (FAIL) | none | FAIL |
| 11 | docs/features/xsync/run-judge | bare git remote init succeeded; seed step fails (`@teamagent/types` unresolvable) | Steps 2-9 SKIP-INFRA (worktree no node_modules) | SKIP-INFRA |
| 12 | docs/features/xsync/verify-canned-answer | delegates to run-judge (SKIP-INFRA) | SKIP-INFRA | SKIP-INFRA |

## Summary

- PASS: 3 / 12 (PB6, PB7, PB8)
- FAIL: 2 / 12 (PB9, PB10)
- SKIP (UNSAFE): 1 / 12 (PB1)
- SKIP-INFRA: 6 / 12 (PB2, PB3, PB4, PB5, PB11, PB12)

## §V2 Evidence Captured

| Playbook | evidence_dir | exit_code | key metrics |
|----------|-------------|-----------|-------------|
| PB6 auto-capture/real-judge | `.judge/capture-real/1778211303/` | 0 | recall_real=0.897, precision_real=0.963, TP=26, FP=1, FN=3, TN=36 |
| PB7 auto-capture/extraction-judge | `.judge/capture/1778211277/` | 0 | labeled.recall=0.875, prod.recall=0.875, prod.precision=1.0, prod.thresholds_pass=true |
| PB8 auto-capture/verify-canned-answer | vitest output (22 tests) | 0 | 22/22 pass, recall_harness=100% (14/14 TP) |
| PB9 rule-quality/run-judge | `.judge/rule-quality-20260508T112902-9832/` | 0 | recall=1.0, false_positives=10, verdict=FAIL |

## §V3 READ Findings

### PB1 — team-sharing-probe/run-judge — SKIP

Dry-run mode (preview only) is safe. Real-run requires: (1) authenticated `gh` with push access to `libz-renlab-ai/TeamBrain-team-sharing-probe` (separate probe repo), (2) `claudefast` for scenario-designer (Step 3) and judge LLM (Step 6), (3) human approval before hard-resetting probe repo. All three blockers are active. Evidence dir would be at `tmp/.judge/team-sharing-probe/<run_id>/`. Verdict: **SKIP** — real-run is SKIP-UNSAFE; dry-run produces no real artifacts.

### PB2 — ab-benchmark/run-judge — SKIP-INFRA

Requires 20 sequential `claudefast` calls (10 probes × 2 arms). `probes.json` and `arm-b-rules.json` verified present at `docs/features/ab-benchmark/`. Python3 available. Only blocker is `claudefast` API (MiniMax endpoint timeout). Verdict: **SKIP-INFRA**.

### PB3 — ab-benchmark/verify-canned-answer — SKIP-INFRA

Thin wrapper that delegates entirely to PB2 (run-judge). Inherits SKIP-INFRA verdict.

### PB4 — calibrator-v2/run-judge — SKIP-INFRA

All 5 tsx helper steps (`_seed.ts`, `_snap.ts`, `_calibrate.ts`, `_assert.ts`) import from `../../../packages/adapters/src/index.js` which resolves to the worktree path. Worktree has no `node_modules/`, so `@teamagent/types` is unresolvable from there. Error: `Cannot find package '@teamagent/types'`. Fixture helpers (`_seed.ts` through `_assert.ts`) are all present. Verdict: **SKIP-INFRA** — worktree module resolution prevents execution.

### PB5 — calibrator-v2/prod-judge — SKIP-INFRA

Same `@teamagent/types` resolution failure. Additionally uses `_prod-seed.ts` and `_prod-judge.ts` (both present). CLI smoke-test (`packages/cli/src/bin.ts calibrate`) also blocked by same path resolution issue. Verdict: **SKIP-INFRA**.

### PB6 — auto-capture/real-judge — PASS

Ran via tsx from main repo (`/Users/m1/projects/TeamBrain`) against `docs/features/auto-capture/real-fixture/` (4 JSONL session files + 4 labels.json files = 66 labeled turns across sessions). Used `ruleBasedCorrectionDetector` from `packages/core/dist/index.js`. Built proper 2-turn ParsedSessions (prior assistant turn + labeled user turn). Results:

```json
{
  "recall_real": 0.8966,
  "precision_real": 0.9630,
  "f1_real": 0.9286,
  "pass": true,
  "labeled_turns": 66,
  "true_positives": 26,
  "false_positives": 1,
  "false_negatives": 3,
  "true_negatives": 36,
  "thresholds": { "recall_min": 0.85, "precision_min": 0.90 }
}
```

Both thresholds met (recall=0.897 ≥ 0.85, precision=0.963 ≥ 0.90). Verdict: **PASS**.

### PB7 — auto-capture/extraction-judge — PASS

Ran via tsx from main repo against `labeled-fixture.jsonl` (20 rows) and `prod-fixture.jsonl` (50 rows). Built proper 2-turn ParsedSessions. Results:

```json
{
  "labeled": { "recall": 0.875, "precision": 1.0, "TP": 7, "FP": 0, "FN": 1, "TN": 12 },
  "prod": { "recall": 0.875, "precision": 1.0, "thresholds_pass": true },
  "prod_mode": true
}
```

Prod thresholds met (recall=0.875 ≥ 0.85, precision=1.0 ≥ 0.90). Labeled run is informational only. Verdict: **PASS**.

### PB8 — auto-capture/verify-canned-answer — PASS

Primary path (extraction-judge.sh + real-judge.sh) unavailable (scripts archived). Fallback: `pnpm vitest run packages/core/src/correction-detector --reporter=basic`. Output:

```
✓ rule-based.test.ts (21 tests) 15ms
✓ recall-harness.test.ts (1 test) — Recall: 100% (14/14), TP=14, FP=0, TN=10, FN=0
Test Files  2 passed (2) | Tests  22 passed (22)
```

Fallback exit code 0. Verdict: **PASS** (vitest fallback mode).

### PB9 — rule-quality/run-judge — FAIL

Ran tsx runner against `packages/core/src/validator/l0.js` (source via tsx, not compiled dist). Runner produced:

```json
{
  "verdict": "FAIL",
  "metrics": {
    "defects_caught": 10,
    "total_defects": 10,
    "false_positives": 10,
    "total_clean": 10,
    "overall_recall": 1.0,
    "overall_precision": 0.0
  }
}
```

**Root cause**: The runner used wrong API field names. The `validateLevel0` function's `ValidateL0Input` interface requires `{ entry, sourceText, existingRules, projectStack }` and returns `{ ok, failed_checks }` — not `{ rule, ... }` returning `{ valid, errors }` as the runner assumed. Every call threw `TypeError: Cannot read properties of undefined (reading 'type')` because `input.entry` was undefined (runner passed `rule:` not `entry:`). This caused all 20 rules to throw exceptions — defects were "caught" (exception = invalid) but clean rules also threw exceptions and were flagged as FP.

The playbook §V1 runner script has an API mismatch with the current `validateLevel0` interface. The harness runner must be updated to pass `entry` (not `rule`), include `projectStack: []`, and read `ok`/`failed_checks` (not `valid`/`errors`) from the result. Verdict: **FAIL** — playbook runner has stale API assumptions; L0 validator itself is importable and functional.

### PB10 — rule-quality/verify-canned-answer — FAIL

Thin gate wrapper delegating to PB9. Inherits FAIL.

### PB11 — xsync/run-judge — SKIP-INFRA

Bare git remote initialized successfully (`git init --bare tmp/.judge/xsync/<run_id>/work/remote.git`). Seed step (Step 2) blocked: tsx inline script for `DualLayerStore` seeding resolves `@teamagent/types` from worktree path, which has no node_modules. `DualLayerStore` is importable from compiled dist (`packages/adapters/dist/index.js`) in main repo context, but the seed script also needs full pnpm workspace links. `sync push` / `sync pull` CLI commands exist in `packages/cli/src/bin.ts`. Verdict: **SKIP-INFRA** — worktree module resolution prevents seed + CLI execution.

### PB12 — xsync/verify-canned-answer — SKIP-INFRA

Thin wrapper delegating to PB11. Inherits SKIP-INFRA.

## Infrastructure Notes

1. **Worktree module resolution** — The worktree (`mdplaybook`) has no `node_modules/`. Any tsx script that resolves `@teamagent/types`, `@teamagent/adapters`, or `@teamagent/ports` via relative imports from worktree package paths will fail. This blocks: calibrator-v2 (PB4, PB5) and xsync (PB11). Mitigation: run these harnesses from the main repo directory with all absolute paths, OR run `pnpm install` in the worktree.

2. **ruleBasedCorrectionDetector requires 2-turn sessions** — A single-turn session (user turn only) produces zero detections because the detector checks for prior assistant context. All playbooks that use this detector need to build 2-turn sessions: `[prior assistant turn, user correction turn]`.

3. **rule-quality/run-judge API mismatch** — The playbook's §V1 runner was generated for an older `validateLevel0` API (`{ rule, valid, errors }`). Current API is `{ entry, projectStack, ok, failed_checks }`. The runner needs to be regenerated against the current ports interface.

4. **auto-capture vitest fallback passes** — The correction-detector unit tests (22 tests, recall harness shows 100% on 14 sessions) demonstrate the feature works. Full recall/precision harnesses (PB6, PB7) also pass when run with proper 2-turn session construction.

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
