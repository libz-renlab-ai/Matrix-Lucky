```text
   ┌──────────────────────────────────────────────────────────────────┐
   │  ISSUE #244 — update-state.json read-modify-write FIXEDFLOW      │
   │                                                                  │
   │   issue → grill → driver-A → driver-B → /review → squash-merge   │
   │                       ▲          ▲                               │
   │                  partial     parallel                            │
   │                  resume      pickup                              │
   │                  by Claude   (TOCTOU fix)                        │
   └──────────────────────────────────────────────────────────────────┘
```

# Issue #244 — Boris workflow report (post-merge)

PR: https://github.com/libz-renlab-ai/TeamBrain/pull/254 (merged as squash `7a05812`)
Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/244
Plan: [`plan.md`](./plan.md) (4-section grill-aligned spec)
Iter-by-iter fix plan: [`../2026-05-10-pr-254-fix-plan.md`](../2026-05-10-pr-254-fix-plan.md)

## Actual chain executed

| Phase | Action | Notes |
|------|--------|-------|
| **research** | (skipped) | Issue body + grill comment were precise enough; no `research.md` needed. |
| **plan** | `plan.md` 4-section grill-aligned (102 lines) | Closed #244, listed 3 call sites, judge harness. |
| **annotate** | (implicit) | Field-ownership decision documented inline at `bin-updater.ts:104-128`. |
| **implement** | 9 atomic commits → squash `7a05812` | 6 in-scope files; see commit list below. |
| **/review loop** | 2 iterations × 2 drivers | iter-1 (this driver): 1 INFORMATIONAL doc miss; iter-2 (parallel driver, captured the **real** finding I missed): 1 CRITICAL TOCTOU race. |
| **PR** | normal PR (no `--draft`) | Body had 4 sections per `docs/HOWTO-PLAN-PR.md`. |
| **merge** | squash, branch deleted (manual cleanup) | `gh pr merge --squash` succeeded; `--delete-branch` fallback failed due to nested worktree, cleaned up via `git push origin --delete feat/issue-244`. |
| **report** | this file | Direct commit on `main`. |

## Iterations + drivers

```
iter-1  /review by Claude driver (this session)
        Findings: 0 critical, 1 informational (bin-updater field-ownership
                  docstring missing reinstall_banner_shown_at).
        AUTO-FIX → commit e037e2b.
        ⚠️ MISS: did NOT detect the TOCTOU race in tryStealStaleLock's
        empty-file window between openSync(wx) + writeSync(pid).

iter-2  /review by parallel driver (background, separate session)
        Findings: 1 CRITICAL TOCTOU race in tryStealStaleLock.
        Root cause: acquireLock creates the lock in two syscalls
        (openSync wx → writeSync pid). Between them the file exists
        but is EMPTY. A racing caller's tryStealStaleLock used to read
        empty content, parseInt → NaN → "garbage, treat as stale",
        unlinkSync → tryCreateLock for itself. Two writers proceed
        concurrently → exactly the lost-update race #244 set out to fix.
        Fix → commit d04be33: empty/non-numeric content treated as
        "still being created, do not steal" → return false; outer retry
        loop re-reads on next attempt by which time pid is written.

iter-2 (this driver, after parallel commit was already on origin)
        /review on `git diff origin/main` (which now included d04be33)
        Findings: 0 critical, 0 informational. PASS.
```

`/review` PASS happened ~0:37 local time (driver A side); parallel driver had pushed d04be33 at ~0:32 — Claude's working tree fast-forwarded through the parallel driver's fix during the next `git push` (`d04be33..238f0c5 feat/issue-244 -> feat/issue-244`).

## Commits in the squash

| SHA | Author | Subject |
|-----|--------|---------|
| (plan) | Claude driver | docs(issue-244): plan — file lock for update-state.json read-modify-write |
| (helper) | (prior driver, resumed) | feat(issue-244): introduce withUpdateStateLock helper + tests |
| (call-1) | (prior driver, resumed) | feat(issue-244): wire session-start-logic.writeUpdateState through lock |
| (call-2) | Claude driver | feat(issue-244): wire commands/update.writeState through lock (call-site 2/3) |
| (call-3) | Claude driver | feat(issue-244): wire bin-updater.writeState through lock (call-site 3/3) |
| (test) | Claude driver | test(issue-244): cover timeout fallback + field-ownership merge |
| **d04be33** | **Parallel driver** | **fix(issue-244): tryStealStaleLock must not steal empty lock files** ← the CRITICAL fix Claude missed |
| e037e2b | Claude driver | docs(issue-244): /review iter-1 — document reinstall_banner_shown_at ownership |
| 238f0c5 | Claude driver | docs(issue-244): PR-PLAN for PR #254 fix loop |

## Deviations from grill plan

1. **Scope creep avoided** (caught by Claude driver): first rebase landed on `a34cb84`, but `origin/main` advanced to `29ecf6f` while work was in flight, polluting `git diff origin/main..HEAD` with 8 unrelated `digital-twin` files. Fixed by a second `git rebase origin/main` before pushing — final diff was 6 in-scope files only.

2. **Parallel driver picked up the same issue** (un-orchestrated): a separate driver session ran iter-2 `/review` and committed `d04be33` to `feat/issue-244` before Claude's iter-2 ran. Claude's iter-2 saw the diff including the fix, found 0 issues, and passed. **Net positive** — caught a CRITICAL bug Claude's iter-1 missed. Worth noting for future skills work: FIXEDFLOW driver does not currently coordinate against concurrent drivers on the same issue; this run got lucky that the parallel driver's fix landed cleanly via fast-forward push, and that the fix was correct.

3. **Iter counter format**: `.fixedflow/iter-244.json` only captured Claude driver's view (1 → 2). Parallel driver's iter-2 finding/fix were not reflected in that file because the JSON is not synchronized. The PR-PLAN doc captures both iterations honestly.

4. **Field-ownership merge in bin-updater extends the grill plan**: grill listed 3 call sites with simple lock wrap; Claude added a "field-ownership-aware merge" mutator for bin-updater (overlays only updater-owned fields onto the live re-read inside the lock) so foreground snooze updates survive bin-updater's multi-second HTTP/install sequence. Documented in commit `feat(issue-244): wire bin-updater.writeState through lock (call-site 3/3)`. Not a deviation per se — grill plan said "RMW under lock" and this is one valid implementation; the alternative (refactor `runUpdater` to mutator pattern) was scoped out as bigger surgery.

## Verification matrix (final)

| Gate | Result |
|------|--------|
| `pnpm typecheck` (workspace) | ✅ |
| New lock unit tests (`update-state-lock.test.ts`) | ✅ 10/10 pre-d04be33; **11/11 post-d04be33** (parallel driver added one test asserting the empty-lock TOCTOU fix) |
| Regression suites (`update`, `updater-logic`, `session-start-logic`, `integration-issue-159`) | ✅ 62/62 in both runs |
| Total final test count (post-rebase + d04be33 + Claude doc fix) | ✅ 73/73 (= 11 lock + 62 regression) |
| Scope: only 6 grill-listed files + 2 PR-PLAN docs | ✅ |
| No npm dep added | ✅ |
| Untouched: `events.db`, `warmup-state.json`, `knowledge.db` | ✅ |
| `/review` (local skill, ADR-0007) | ✅ PASS (after iter-2) |
| GitHub Actions CI (`claude-review`, `test ubuntu`, `test windows`) | ✅ all pass |
| Squash-only merge (no `--merge`, no `--rebase`) | ✅ |
| Issue body ≤50 words + grill comment + grill-ready label | ✅ (issue-author flow upstream) |
| Branch deleted on remote + local | ✅ |
| Worktree `.codex/worktrees/issue-244` removed | ✅ (by parallel driver after their merge attempt; we pruned) |

## Token / time spend

| Resource | Estimate |
|----------|----------|
| Wall-clock from driver pickup → squash-merge | ~50 minutes |
| Atomic commits (pre-squash) | 9 |
| Files in final squash | 6 code/test + 3 docs |
| Final code: insertions / deletions | +590 / −69 |

Token cumulative not measured this run.

## Lessons captured (for future drivers / skills work)

1. **Iter-1 review must include adversarial concurrency analysis on lock primitives.** Claude's iter-1 verified field-ownership but did not stress-test the helper's own internal RMW. Parallel driver's iter-2 caught the TOCTOU. Update `/review` checklist or skill prompt to explicitly demand "if the diff introduces a lock primitive, walk through every interleaving of its own syscalls."

2. **FIXEDFLOW driver should detect parallel pickups before doing work.** Issue #244 already had a "driver picked up" comment from `2026-05-09T14:02:10Z` on top of stale uncommitted state; this driver re-picked up at `2026-05-10` without coordinating with whatever wrote `d04be33`. Net effect was positive this time — but two parallel drivers diverging would have been a force-push race. A future improvement: driver checks for branch existing on `origin` AND for `driver picked up` comments newer than its own pickup, and either coordinates or bails to `needs-human`.

3. **The "field-ownership merge" pattern generalizes** beyond bin-updater. Any long-running async write that spans multiple seconds while another writer can interleave should: read at start, do async work, then re-read inside lock + overlay only its owned fields. Worth extracting to `docs/patterns/` if a third call site appears.

4. **Two locks are correct here, not over-engineering.** `update.lock` (process gate, ensures one bin-updater at a time) is distinct from `update-state.lock` (RMW gate, ensures atomic state mutation). Different scopes; merging them would block foreground commands during bin-updater's full ~10s run.
