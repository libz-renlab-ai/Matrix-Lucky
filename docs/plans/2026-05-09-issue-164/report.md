```text
                ┌─────────────────────────────────────────────────────────┐
                │  ISSUE-164 REPORT — FIXEDFLOW BAIL                      │
                │  Race with PR #227 (already merged before we finished)  │
                └─────────────────────┬───────────────────────────────────┘
                                      │
                              pickup 11:31 UTC
                                      │
              ┌───────────────────────┴───────────────────────┐
              │                                               │
        our branch (13 commits)                       PR #227 (1 commit)
        feat/issue-164                                feat/install-vector
        outcome:                                      outcome:
        spec satisfied,                               same spec satisfied,
        cleaner design                                merged into main at
        but REDUNDANT                                 11:43 UTC by issue author
              │                                               │
              └────────────► no PR opened ────────────────────┘
                              (destructive-action gate)
```

# Issue #164 — FIXEDFLOW Driver Report (BAIL)

> **Cherry-pick disposition (added when this report landed via PR #242)**:
> This report is a snapshot of the bail moment, kept verbatim. PR #242 is
> option 2 from the "Recommendation to maintainer" list below — it cherry-picks
> the user-message cleanup + this docs trio (research/plan/judge/report) into
> main. The embedder code + tests from the bailed branch were **not**
> cherry-picked — PR #227 already covers that surface. The ASCII art's
> "no PR opened" line refers to the bailed `feat/issue-164` branch, not this
> follow-up.

## TL;DR

The FIXEDFLOW driver picked up issue #164 at **2026-05-09T11:31:08Z** and produced 13 atomic commits implementing the locked grill spec. While the driver was still implementing, **the issue author merged PR #227 (commit `168190a`) at 2026-05-09T11:43:38Z** — 12 minutes after pickup — implementing the same spec with a different design.

The driver did **NOT** open a competing PR (would be destructive — would revert the merged work in #227). It paused at the scope/destructive-action gate per the project's "Do everything = full chain" memory rule, wrote this report, and left the worktree intact for the maintainer to decide.

## Timeline

| Time (UTC)            | Event |
|-----------------------|-------|
| 2026-05-09T10:27:38Z  | Issue author posted "Claiming — 我来做。" comment |
| 2026-05-09T11:05:23Z  | Issue author posted Grill spec ending with `--- end grill ---` |
| 2026-05-09T11:05:47Z  | github-actions queued comment: "🤖 FIXEDFLOW: queued for local pipeline" |
| **2026-05-09T11:31:08Z**  | **Driver pickup** — posted `👋 driver picked up` comment |
| 2026-05-09T11:31–11:39Z | Driver wrote plan trio + began implementation |
| **2026-05-09T11:43:38Z**  | **PR #227 merged** by issue author — closed issue #164 |
| 2026-05-09T11:39–12:30Z | Driver continued (unaware) and finished 13 commits |
| 2026-05-09T~12:30Z    | `/review` adversarial reviewers detected the merged-PR situation |
| 2026-05-09T~12:35Z    | Driver paused at scope/destructive-action gate, wrote this report |

## Why this happened

FIXEDFLOW Step 0 sanity gates check that the issue is `OPEN` and has `grill-ready` label **at pickup time**. They do not periodically re-check during the long implementation window. With a 1+ hour implementation budget and a competing developer also working the same issue (the issue author themselves, in this case), a race is possible.

This is not a bug in FIXEDFLOW — it's a fundamental tension:
- Long-running drivers cannot lock the issue (no GitHub primitive)
- Re-checking every minute would burn API budget
- The watcher's `grill-ready` label was correctly applied; the queue handoff worked

The right outcome is what happened: detect the merged PR during `/review`, stop before opening a competing PR, surface the situation to a human.

## What our 13 commits contain

| Commit  | Concept |
|---------|---------|
| 277e409 | docs(issue-164): plan trio (research, plan, judge harness) |
| 4f3664c | feat(issue-164): pin vector deps in teamagent dependencies |
| face704 | feat(issue-164): add embedder-state schema + atomic R/W (28 tests) |
| f2ca12a | feat(issue-164): add embedder-client (200 ms HTTP wrapper) (16 tests) |
| f9e8910 | feat(issue-164): bin-embedder daemon (HTTP + refcount + idle-exit) (18 tests) |
| e23bce0 | feat(issue-164): emit dist/bin-embedder.cjs from tsup hook config |
| 102be0a | feat(issue-164): export spawnEmbedderDaemonDetached helper (5 more tests) |
| 389a039 | feat(issue-164): wire PreToolUse to embedder daemon (no in-process load) |
| a8f20ea | feat(issue-164): wire Stop to embedder daemon (no in-process load) |
| d309d7a | feat(issue-164): SessionStart spawn-or-join the embedder daemon |
| ffb4c2d | feat(issue-164): SessionEnd refcount-shutdown the embedder daemon |
| 8a86f21 | feat(issue-164): drop TEAMAGENT_INCLUDE_OPTIONAL opt-in messaging |
| 9b15d51 | docs(issue-164): ADR-0001 reworded for the daemon path |

Total: **2759 insertions, 78 deletions across 21 files**, all 67 new tests passing,
full workspace `pnpm typecheck` clean, full `pnpm test` shows 2512/2513 passing
(the one failure is a pre-existing environmental flake on the merge-base, unrelated
to this branch).

## How our design differs from PR #227

Both implementations satisfy the locked grill spec. Reviewer 2's static analysis
(see /review output above) found:

- **PR #227** (merged): introduces `daemon-first-embedder.ts` — a *single embedder
  class* that internally tries the daemon first then falls back to a wrapped
  `XenovaRuleEmbedder` instance in-process. Endpoint name is `/register`.
- **Our branch**: hooks construct an inline `RuleEmbedder` that **only** proxies
  to the daemon and **throws** on failure. The existing semantic-error catch in
  each hook (preserved from before #164) handles the legacy fallback. The
  in-process `XenovaRuleEmbedder` import is **removed entirely** from the four
  hook bins. Endpoint name is `/join`.

Trade-offs:
- Their design: hooks always have an embedder available, even when daemon is
  down (in-process fallback inside the embedder). Lower legacy-fallback rate
  but the hook process can still cold-load the model in the rare daemon-down
  case (the very thing #164 was trying to eliminate).
- Our design: hooks only get embeddings via daemon; daemon-down ≡ legacy.
  Fully eliminates per-hook in-process loads. Slightly higher legacy-fallback
  rate during daemon respawn windows.

Reviewer 2 called our design "an independent re-implementation with a different
(cleaner) layout" but both meet the 10 acceptance criteria.

## /review findings against our branch

The two adversarial subagents flagged these issues against our (un-merged)
branch. **None apply to PR #227's merged code** (different file layout); listed
here for the record so a maintainer can compare:

- **P1-A**: `/embed` accepts unbounded `texts: string[]` payload — any local
  process can OOM the daemon. Fix: cap raw body bytes (1 MB), `texts.length`
  (≤64), per-text length (≤8 KB). [`bin-embedder.ts:309-334`]
- **P1-B**: TOCTOU between `describeEmbedderReadiness` and `embedViaDaemon` in
  Stop's semantic-scan path — when daemon dies between check and call, no
  respawn fires. Fix: call `spawnEmbedderDaemonDetached()` in the catch.
  [`bin-stop.ts:738-822`]
- **P1-C**: PID-reuse race in `acquireLock` — recycled OS pid can make a
  stale lock look alive forever, requiring manual cleanup. Fix: also probe
  `/health` on the recorded port; if no response within 200 ms, treat as stale.
  [`bin-embedder.ts:211-251`]
- **P2-A**: Refcount=0 + first `/shutdown` for unjoined session footgun —
  daemon may schedule grace exit after a SessionEnd for a session that never
  `/join`-ed (e.g., warmup-not-ready path skips `/join`). Fix: `/shutdown`
  is no-op if session_id not in members.
- Several P3s, all retractable.

## Recommendation to maintainer

Three options:

1. **Discard our branch** (most likely correct). PR #227 is the canonical
   issue #164 fix. Delete `feat/issue-164` branch and the
   `.codex/worktrees/issue-164/` worktree. No further action.

2. **Cherry-pick specific improvements** from our branch into a follow-up
   PR. Candidates:
   - The 67 unit tests covering `embedder-state.ts` (28), `embedder-client.ts` (16),
     `bin-embedder.ts` (23). PR #227's diff did not include comparable
     unit-test coverage at this granularity.
   - The locked-spec judge harness at `docs/plans/2026-05-09-issue-164/judge.md`
     (10 acceptance criteria + §V1 RUN matrix) — reusable as a verification
     gate for the merged design.
   - The defensive cleanup of `TEAMAGENT_INCLUDE_OPTIONAL` user-facing messages
     in `doctor.ts`/`init.ts`/`warmup.ts`/`postinstall.mjs`.

3. **Replace #227 with our design** — only if the cleaner separation is
   judged worth the revert cost. Would require a follow-up PR that carefully
   undoes #227's daemon-first-embedder.ts and wires our inline approach.
   **Not recommended** — both designs work; the merged one stays.

## Driver state

- Worktree: `/Users/m1/projects/TeamBrain/.codex/worktrees/issue-164/`
- Branch: `feat/issue-164` (13 commits, NOT pushed to remote, NOT linked to a PR)
- `.fixedflow/iter-164.json`: `iter=1`, `started_at=2026-05-09T12:18:47Z`
- Driver did NOT: push branch, open PR, merge PR, close issue (already
  closed by #227), comment on PR #227

## Closing the loop

The driver posts a comment on issue #164 (and on PR #227 if appropriate)
linking to this report so future watchers / maintainers / readers can find
the diff context and the /review findings.

## FIXEDFLOW skill hardening recommendation

Step 0 sanity gates already check `state=open` + `grill-ready` label at
**pickup time**, but for long-running implementations (this branch took
~1.5 hours wall-clock) the issue can be merged by another developer's PR
mid-flight. Two cheap mitigations would have caught this:

1. **Periodic re-fetch of origin/main during implementation**
   The driver could sample `git fetch origin && git log HEAD..origin/main
   --grep="issue.<N>"` every N commits or every M minutes. If a matching
   merge appears, abort early and write the bail report at that point
   instead of after burning the full 13 commits + `/review` cycle.

2. **Pre-flight competing-PR search at Step 0**
   `gh pr list --search "issue:<N>" --state all` would catch a PR that's
   already open and approaching merge. PR #227 specifically was opened
   `2026-05-09T03:21Z` (≈ 8 hours before our pickup), so this check would
   have surfaced it immediately.

Concretely, between the `Verify issue is open` and `Verify latest comment
by issue author` gates in `procedure` § 0, add:

```bash
gh pr list --search "issue:${N}" --state all --json number,state,mergedAt | \
  jq -e 'all(.state != "OPEN" and .mergedAt == null)' \
  || echo "⛔ Existing PR for this issue — bail and ask"
```

The hardening lives in the FIXEDFLOW driver skill (`.codex/skills/fixed-flow-driver/SKILL.md`),
not this branch's code. A follow-up PR against that skill is the right
home for the change.

This bail report is the in-band evidence that the gap exists.
