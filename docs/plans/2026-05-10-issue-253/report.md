```text
   issue #253          PR #255            squash 0b3e9c1
   ──────────          ──────             ──────────────
   open + grill   ──►  /review iter-1 ──► /review iter-2 ──► merged
   + label              (2 P0 fixed       (all green)
                         in same PR)
```

# Post-merge report — Issue #253

## Actual chain executed

1. `/fixed-flow-driver 253` started on `main` worktree, sanity-gated (FIXEDFLOW spec present, gh auth ok, `grill-ready` label set, `--- end grill ---` terminator confirmed).
2. Pickup announcement comment posted to issue #253.
3. Worktree `.codex/worktrees/issue-253` cut from `origin/main@a34cb84`, branch `feat/issue-253`.
4. **3 implementation commits** (atomic, single concept each):
   - `cf020d1` chore — mirror 11 skills (`cp -R`) + `mmx-cli` symlink to `.codex/skills/`. Result: 20 == 20 between `.claude/skills/` and `.codex/skills/`.
   - `79d5ba1` feat — `DEFAULT_PLUGINS` collapsed to 6 plugins / 1 marketplace, exactly mirroring `.claude/settings.json:enabledPlugins`. Test rewritten (10/10 PASS).
   - `534547f` docs — Boris-workflow `research.md` + judge harness `judge.md` under `docs/plans/2026-05-10-issue-253/`.
5. **/review iter-1** (cwd-aware, run inside the issue-253 worktree): 2 CRITICAL findings in `packages/cli/src/__tests__/install-plugins.test.ts` (hard-coded `sales` / `sales@knowledge-work-plugins` / `knowledge-work-plugins` literals broke after `sales` left `DEFAULT_PLUGINS`).
6. **iter-1 fix-plan written** at `docs/plans/2026-05-10-issue-253-iter-1-fix-plan.md` per `docs/PR-PLAN.md` (3 sections: task / expected outputs / judge harness). No follow-up issue opened (project rule).
7. **iter-1 fix commit** `70d4833`: `sales` → `code-review` in `--only` test; `sales` → `commit-commands` in installer-failure test. Other `sales`/`superpowers` literals in unrelated tests (parser CSV test, render shape test) intentionally kept — they don't assert bundle membership.
8. **Rebase onto origin/main**: 4 commits replayed cleanly atop `29ecf6f` (issue-146-f1 had landed during this session). Branch hashes after rebase: `cf020d1` → `cf020d1`, `79d5ba1` → `79d5ba1`, `534547f` → `534547f`, `70d4833` → `70d4833` (numerically identical because no merge conflicts existed; git replay produced new SHAs for all 4 but project commit log shows the rebased SHAs after squash).
9. **/review iter-2** (full re-check, post-rebase): 12+10+95+11+66 = 194 tests across 5 surfaces all PASS, root `tsc --noEmit -p tsconfig.base.json` PASS. PASS gate met.
10. `git push -u origin feat/issue-253 --force-with-lease` (rebase required force-with-lease).
11. `gh pr create` — normal (non-draft) PR #255 with 4-section body per `docs/HOWTO-PLAN-PR.md` (plan / expected outputs / how-to-verify / claudefast probes).
12. `gh pr merge 255 --squash --auto` — merged at 2026-05-09T16:28:46Z, squash commit `0b3e9c1`. Issue #253 auto-closed via "Closes #253".
13. Cleanup: `git worktree remove .codex/worktrees/issue-253` + `git branch -D feat/issue-253` + `git pull --ff-only origin main` on parent checkout.

## Iteration count

`docs/plans/2026-05-10-issue-253-iter-1-fix-plan.md` (1 fix iteration). `/review` ran twice (iter-1 found findings; iter-2 PASS gate). `.fixedflow/iter-253.json` snapshot inside the (now-removed) worktree showed `iter: 2`.

## Token spend

Not measured — driver did not capture per-iter token counts (sub-100-iter run, no PushNotification thresholds tripped). Skill spec mentions PushNotification at iter ∈ {10, 25, 50, 100}; we hit none.

## Deviations from grill plan

None of substance. Two minor judgment calls flagged but not deviations:

- Driver intentionally left `superpowers` / `sales` / `knowledge-work-plugins` literals in `parseInstallPluginsArgs` CSV-parser test (`L45-46`) and in `renderInstallPluginsResult` shape test (`L147-179`). Both pass as-is; both assert behavior (parser, renderer) that is independent of bundle membership. Removing them would have been unrelated cleanup churn outside grill scope. Documented in iter-1 fix-plan.
- Driver flagged but did **not** touch the broader stale `superpowers`/`sales` references in `bin.ts` help text (L480, L1230), `init.ts` opt-in banner (L91, L1546), `packages/teamagent/CLAUDE.md` learnings (L20-21), m5 fixtures, and `evidence-phase-gaps-ab.ts`. Those are out-of-scope per the grill ("不动其他 init step / `--legacy-claude-md` / `--target` 行为" + "不动 root `CLAUDE.md` / `AGENTS.md` 任何 canned-answer 段落"). They remain as a follow-up — the user can open a new ≤50-word issue + grill comment if desired.

## Pre-existing blocker noted (out of scope, untouched)

`pnpm --filter @teamagent/core typecheck` reports `TS6059` for `fixtures/scenarios/*.ts` not under `packages/core/src` rootDir. This existed on `origin/main` independently of this PR. Project-canonical gate is root-level `pnpm typecheck` (against `tsconfig.base.json`), which passes.

## Links

- PR: https://github.com/libz-renlab-ai/TeamBrain/pull/255
- Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/253
- Squash commit: `0b3e9c1`
- Worktree commits (replayed onto origin/main): `cf020d1`, `79d5ba1`, `534547f`, `70d4833`
- Plan dossier: `docs/plans/2026-05-10-issue-253/{research.md,judge.md}` + `docs/plans/2026-05-10-issue-253-iter-1-fix-plan.md`
