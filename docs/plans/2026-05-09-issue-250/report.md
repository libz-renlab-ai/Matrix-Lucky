```text
   issue-250 FIXEDFLOW execution report
   ─────────────────────────────────────
   grill (web grill-with-docs Q1-Q11)
        ↓
   issue + grill comment + grill-ready label
        ↓
   /fixed-flow-driver (manual maintainer trigger)
        ↓
   step 0-7 全程记录见下
        ↓
   PR #251 squash-merged → main
```

# Report — issue #250 / PR #251

**Issue**: [#250 落 ADR-0010 bottom-level fixture corpus 设计 + 3 处 doc 集成入口](https://github.com/libz-renlab-ai/TeamBrain/issues/250)
**PR**: [#251](https://github.com/libz-renlab-ai/TeamBrain/pull/251) — squash-merged 2026-05-09T15:59:31Z (commit `7ff2cb9`)

## Actual chain executed

```
step 0 sanity gates       ✅ FIXEDFLOW.md / gh auth / grill-ready / 评论结尾 --- end grill --- / 无 needs-human
step 1 pickup announcement ✅ 评论 #4412912562 by driver at 15:48:20Z
step 2 worktree + branch   ✅ .codex/worktrees/issue-250 on feat/issue-250 from origin/main@b79ce21
step 3 implementation      ✅ 4 file changes, 2 atomic commits (4acfecd ADR + b053012 wire-up)
step 4 /review loop
        iter 1             ⚠️ 1 INFORMATIONAL (confidence 6/10): tier 一词二义
                           ✅ AUTO-FIX: CONTEXT.md _Avoid_ 行加 disambiguation
                           ✅ iter-1 PR-PLAN 写到 docs/plans/2026-05-09-issue-250-iter-1-fix-plan.md
                           ✅ commit 58a9576
        iter 2             ✅ PASS (无新 finding，原 fingerprint auto-fixed)
step 5 open PR             ✅ PR #251 created (non-draft per project rule)
                           ✅ rename iter-1 fix-plan → pr-251-fix-plan.md (commit 9ac04d6)
step 6 squash-merge        ✅ gh pr merge --squash --auto --delete-branch
                           ✅ main now at 7ff2cb9
                           ✅ remote feat/issue-250 自动删除
step 7 cleanup + report    🔁 进行中（本文档）
```

## Iteration summary

读自 `.codex/worktrees/issue-250/.fixedflow/iter-250.json`（worktree 清理前快照）：

```json
{
  "issue": 250,
  "iter": 2,
  "started_at": "2026-05-09T15:48:20Z",
  "last_iter_at": "2026-05-09T15:54:00Z",
  "tokens_cumulative": 0,
  "iter_1_finding": "CONTEXT.md:113 INFORMATIONAL tier-overload AUTO-FIXED via _Avoid_ disambiguation",
  "iter_2_verdict": "PASS"
}
```

**Total iterations**: 2
**Tokens cumulative**: 未实测 (driver session 内 token 计量未启用，0 是占位 default 而非真值)
**Wall-clock**: ~11 min (15:48:20Z 起 → 15:59:31Z merged)
**No PushNotification triggered**: iter < 10 阈值

## Deviations from grill plan

仅 1 处微调：

| 位置 | grill 原文 | 实际落地 | 原因 |
|------|-----------|---------|------|
| `docs/CONTEXT.md` _Avoid_ 行 | 仅写 "tier 是 canonical 词" | 追加 "calibration `Tier` ≠ replay tier" disambiguation 子句 | iter-1 /review 发现的一词二义；属于 AUTO-FIX 同 PR 修，符合 `docs/PR-PLAN.md` "no follow-up issues" 铁律 |

其他 4 项 deliverable（ADR-0010 / feature-verification.md / verify/INDEX.md / 行数预算）全部按 grill comment 锁定的内容、行数、插入位置 1:1 落地，无字面差异。

## Commits in PR (pre-squash)

| SHA | Subject |
|-----|---------|
| `4acfecd` | feat(issue-250): add ADR-0010 bottom-level fixture corpus design |
| `b053012` | docs(issue-250): wire ADR-0010 into CONTEXT/feature-verification/verify-INDEX |
| `58a9576` | fix(issue-250): disambiguate calibration Tier vs replay tier in CONTEXT.md |
| `9ac04d6` | chore(issue-250): rename iter-1 fix-plan to pr-251-fix-plan |

Squash 后 main 单 commit: `7ff2cb9` (172 行 insertion，5 文件)

## Out of scope (留给后续 FIXEDFLOW issue)

ADR-0010 §"First-fixture seed and migration are out of scope" 节明确列出未做项，下一波 FIXEDFLOW issue 应分别覆盖：

1. CLI 三命令实现：`pnpm teamagent fixture record/finalize/replay`
2. `tests/fixtures/CAPTURE-MASTER.md` 通用 capture playbook + 一份 example per-scenario `capture.md`
3. ≥3 个 seed scenario fixture（针对现有 universal seed pack 中已有 rule 捕获）
4. `tests/fixtures/scenarios/__tests__/replay-events.test.ts` —— vitest tier-(a) 入口
5. `.scratch/fixtures/` 加进 `.gitignore`
6. （可选）lint rule：禁止 `derive-*` utility 出现在 `audit/` 之外

## Risks / next-step considerations

- **CONTEXT.md 已 198/200 行**，再加任何术语就溢出。后续若需扩展 bottom-level testing 词汇表，应考虑：(a) 把 `Bottom-level testing` 子节挪到独立 glossary 文件；或 (b) 压缩老条目腾空间。
- **ADR-0010 status = proposed**——按项目惯例（参考 ADR-0008/ADR-0009）需要在第一次实现 PR 落地时改为 `accepted`。
- **judge harness 实跑未执行**——本 PR 仅落 design+doc，未实际跑 `claudefast -p` 两条 probe；首个 fixture 实现 PR 必须以这两条 probe 作为 acceptance gate。
