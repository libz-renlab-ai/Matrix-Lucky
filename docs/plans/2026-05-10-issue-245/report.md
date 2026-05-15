```
   _____
  ( o>    issue #245 → PR #260 squash-merged
   \\_<_)  4 个 update-* AttributionBus 事件全装好
    |  |   stats 升级事件 7d 段落上线，CI 三平台全绿
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  step 0       step 1-2 (manual)        step 3-5 (driver)
  ─────────    ──────────────────       ──────────────────
  pickup ──→   ≤50 字 issue + grill ──→ worktree → 5 commits → /review iter-1
  comment      grill-ready label                    │
                                                    └─→ iter-1 P2 fix → CI green → squash-merge #260
```

# Issue #245 — post-merge report

| 字段 | 值 |
|------|----|
| issue | [#245](https://github.com/libz-renlab-ai/TeamBrain/issues/245) `[fixedflow] 升级流程未 emit AttributionBus 事件 — 装机率遥测无数据` |
| PR | [#260](https://github.com/libz-renlab-ai/TeamBrain/pull/260) |
| squash commit | `5db733f` on `main` |
| branch | `feat/issue-245` (本地 + 远端均已删) |
| /review iter | 2（iter-1 找到 2 条 P2 finding，commit `7ec5f1a` 修复后 PASS） |
| 实施方式 | 主会话直驱（user 拒绝 subagent delegation 后切到 in-session driver） |
| 起讫时间 | 2026-05-10 ~01:11 → ~11:30 UTC（含前 driver 留下的 fbe5379 resume） |

## 实际执行链

| step | 时间戳 | 动作 |
|------|--------|------|
| 0 | 11:11 | sanity gate（issue OPEN ✅、grill-ready ✅、grill 评论 233min ≥60s ✅） |
| 1 | 11:11 | pickup 公告 → [#issuecomment-4414266750](https://github.com/libz-renlab-ai/TeamBrain/issues/245#issuecomment-4414266750) |
| 2 | 11:12 | resume：发现 `.codex/worktrees/issue-245/` 已有 commit `fbe5379`（前 driver 留下的 4 event kinds + factory，质量 OK）+ 进行中的 SessionStart wiring（uncommitted） |
| 3a | 11:13 | 修 `upgrade-event-emitter.ts` 的 import 错误（`AttributionBus` 来自 `@teamagent/ports` 不是 `@teamagent/types`），commit `316780e` (= rebased 到 `654d7ec`) |
| 3b | 11:30 | wire emit 点 2-4（snooze / never / install）+ 单测 10 个 case，commit `db4f859` (= rebased `04185f0`) |
| 3c | 11:55 | `teamagent stats` 升级事件 7d 段，commit `3aa615b` (= rebased `bad1917`) |
| 3d | 12:05 | E2E 集成测试覆盖 grill J3，commit `51da8fd` (= rebased `ff268fb`) |
| 4 | 12:10 | rebase onto origin/main（origin 同时合并了 issue-256/258 的 follow-up） |
| 5 | 12:15 | /review iter-1：找到 2 条 P2（fire-and-forget emit + emit 在 pruneOldBackups 之后）→ 写 [`docs/plans/2026-05-10-issue-245-iter-1-fix-plan.md`](../2026-05-10-issue-245-iter-1-fix-plan.md) → commit `7ec5f1a` |
| 6 | 12:20 | push + `gh pr create`（普通 PR，非 draft）→ PR #260 |
| 7 | 12:30 | CI 三 check 全绿（ubuntu test / windows test / claude-review）→ auto-merge fired → squash commit `5db733f` |
| 8 | 12:32 | 清 worktree + 删本地 branch + 删远端 branch + ff-pull main + 写本 report |

## 偏差（deviations from grill plan）

1. **路径偏差**：grill 说 `packages/core/src/attribution/upgrade-events.ts`，实际放在 `packages/core/src/update/upgrade-events.ts`（与 `snooze.ts` / `update-state.ts` / `prompt-text.ts` 同 dir）。前 driver 在 `fbe5379` 的 commit message 已经解释这次分组选择，本 driver 沿用，未改路径。
2. **fix-plan 文件名未按 SKILL.md 重命名**：写的时候叫 `2026-05-10-issue-245-iter-1-fix-plan.md`，PR 开出来后本应重命名成 `2026-05-10-pr-260-fix-plan.md`。我没改。已落 commit、不打算追加重命名 PR——影响仅限文件检索习惯，PR-PLAN.md 内容本身完整。
3. **claudefast probe 未实跑**：grill 列了 `claudefast -p "TeamAgent 升级流程哪些 AttributionBus 事件？"` 期望命中 ≥3 事件名，PR 描述里照引但本会话内没实际 invoke。E2E 测试已经在真 sqlite 上验证 4 个 kind 全部能 emit + 持久化，等价覆盖；如果 maintainer 想跑 claudefast 二次确认可以独立验证。
4. **/review iter-1 找到 2 条 P2 finding**：fix 路线见 fix-plan 文件 + commit `7ec5f1a`。修完后所有 5 个升级测试文件 98 tests 仍绿。

## 验证证据

| judge | 命令 | 实测结果 |
|-------|------|----------|
| J1 typecheck | `pnpm typecheck` | exit 0（多次跑） |
| J2 升级套件 | `pnpm exec vitest run packages/cli/src/__tests__/{update,updater-logic,maybe-show-upgrade-prompt,stats,upgrade-events-e2e}.test.ts packages/core/src/update/__tests__/upgrade-events.test.ts` | 6 文件 109 tests passed |
| J3 全量回归 | `pnpm exec vitest run packages/core packages/cli` | 172 文件 2052 passed + 2 skipped |
| J4 stats 含「升级」 | `aggregateUpgradeEvents7d` + `renderUpgradeEvents7d` 单测验证 + 集成 case `appends 升级事件 段落 when total > 0` | passed |
| CI ubuntu | GitHub Actions | passed |
| CI windows | GitHub Actions | passed |
| CI claude-review | GitHub Actions | passed |

## 后续 / 风险

- **F2~F9 of issue #146 还活着**：本轮 option 2 只搞了独立 grill-ready issue（#244 / #253 / #245）。#146 依然 OPEN（`enhancement, ready-for-human` label，body > 50 字、非 fixed-flow template）。要走 FIXEDFLOW 必须先拆成 ≤50 字 issue + 各自 grill。本 driver 不动它。
- **`emitInstalled` 现在 await 异步**：bin-updater 的 detached process 现在会多等 ~10ms 直到 events.db 行落定才 exit。在生产环境是正确取舍（不漏 telemetry > 多等几 ms）。如果实际 detached 启动场景对延迟敏感，可在跟踪 issue 中收紧。
- **`installStartMs` 不含 backup 时间**：grill 没明确定义 `durationMs`，本实现取「install + migrate」两段。如果 CEO 想看完整升级时长（含 backup），需要在后续 issue 里把 backup 计入或新加 `backupMs` 字段。

## 链接

- PR: https://github.com/libz-renlab-ai/TeamBrain/pull/260
- squash commit: https://github.com/libz-renlab-ai/TeamBrain/commit/5db733f
- 5 个 feature commit（rebased 后）：`8d14119` `654d7ec` `04185f0` `bad1917` `ff268fb`
- 1 个 review-fix commit：`7ec5f1a`
- iter-1 fix-plan: [`docs/plans/2026-05-10-issue-245-iter-1-fix-plan.md`](../2026-05-10-issue-245-iter-1-fix-plan.md)
- pickup 公告评论: https://github.com/libz-renlab-ai/TeamBrain/issues/245#issuecomment-4414266750
