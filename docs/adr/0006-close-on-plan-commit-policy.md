```text
   ┌──────────────────────────────────────────────────────────────┐
   │   ADR-0006: Close-on-plan-commit policy                      │
   │                                                              │
   │   未分配的 feature issue                                     │
   │        │                                                     │
   │        ▼                                                     │
   │   docs/plans/issue-<N>/plan.md  (4 段, 立即可开工)           │
   │        │                                                     │
   │        ▼                                                     │
   │   close issue + cite plan path                               │
   │        │                                                     │
   │        ▼                                                     │
   │   后续 follow-up PR 真正实现 (与本 ADR 无关)                 │
   └──────────────────────────────────────────────────────────────┘
```

# ADR-0006: Close-on-plan-commit policy for unassigned feature issues

> **Note (2026-05-08):** Originally numbered 0005. Renumbered to 0006 after PR #142 merged
> `docs/adr/0005-archive-hypothetical-port-seams.md` to main while this PR was open. The
> close-comments on issues #81 / #82 / #83 / #89 / #117 cite the original "ADR-0005" and
> the path `docs/adr/0005-close-on-plan-commit-policy.md`; that link is now stale, but the
> ADR's content and effect are unchanged — only the file name moved to 0006-.

- **Date:** 2026-05-08
- **Status:** Accepted
- **Authors:** @LiuShiyuMath
- **Supersedes:** —
- **Superseded by:** —

## Context

TeamBrain 当前的 issue tracker 上有两类 issue 在并存：

1. **In-flight PR 上长出来的新 issue。**
   `docs/POSTPR.md` 与 `docs/PR-PLAN.md` 已明确：在已开 PR 的反馈循环里发现的新问题，**禁止开 follow-up issue 然后 merge** ——必须 block merge、在 `docs/plans/<date>-pr-<n>-fix-plan.md` 落 PR-PLAN、用 `docs/TEAMWORK.md` 的 N+1+(2N) 模式并行修在同一 PR 分支。这条 "no punt" 规则是项目硬约束，不在本 ADR 讨论范围内。

2. **未分配的、独立的 feature issue。**
   例如 #81 (3 同事 dogfood research)、#82 (issue 标题写作 "group sharing"，canonical 名 team-scope viral sync teaching)、#83 (issue 标题 "group video recording"，canonical 名 team-scope session recording + gbrain index)、#89 (5 个 stack packs)、#117 (terminal 主题)。这些 issue 不是从某个 PR 长出来的，没人正在做、没人 assigned，本质是"将来要做的事"的清单。它们一旦堆积超过个位数，就开始：

   - 让 issue tracker 的 OPEN 列表失真（看上去"很多事在做"，实际没人在做）
   - 让任何人想给这些 issue 写真正的实施计划时，找不到入口（在 issue 评论里写嫌长，在 PR 里写没 issue 上下文）
   - 让 POSTPR 的"close-the-loop"心智被稀释（POSTPR 的 close 是 merge-ready；feature issue 永远 close 不掉）

   POSTPR 的 "no punt" 条款没明确覆盖这一类——它的语境是 in-flight PR，不是 standalone feature issue。

我们需要一条政策来回答：**未分配 feature issue 在什么条件下可以从 OPEN 转为 CLOSED？**

## Decision

未分配的 feature issue 可以由一份 **足够具体的实施计划** 闭环，不要求该计划已被实施。

"足够具体的实施计划" 的硬性条件：

1. 文件路径在 `docs/plans/issue-<N>/plan.md`，按 `docs/HOWTO-PLAN-PR.md` 的 4 段结构写（task description / expected outputs / how-to-verify (third-party judge harness) / claudefast probes）。
2. Plan 必须能让一名其他工程师**直接进入 implement 阶段**——不需要再做一次需求澄清、设计 review 或假设确认。
3. Plan 必须显式列出已知 blocker 与依赖（外部依赖、跨 issue 依赖、运行时依赖、术语对齐等），不允许把"等 X 想清楚"塞进隐藏假设。
4. 若 issue 本身在领域语言上与 `docs/CONTEXT.md` canonical 术语冲突，plan 必须包含 Glossary mapping 一节，把 issue 用语映射到 canonical 用语，且 plan body 一律用 canonical 用语。
5. Close issue 时**必须留 cite-back comment**，至少包含 plan 文件相对路径、PR 链接、以及一句"为什么这份 plan 算 good"的判断（例：plan committed at <path>; ready for impl PR; depends on #X / blocked by gbrain video API spec gap）。

满足以上 5 条的 plan 落地 + commit + close issue + cite-back comment = 该 issue 在本项目内 **CLOSED**。

后续真正的 implement PR 不重开同一个 issue，而是在 PR description 里反向引用 plan 文件路径。

## Consequences

### Positive

- **Issue tracker 反映真实状态**：OPEN 只剩"还没有可执行 plan"或"plan 已存在且正在实施"两类，零"将来某天会做"。
- **Plan 文件成为正向资产**：`docs/plans/issue-<N>/plan.md` 是可 review、可 grep、可被 follow-up PR 反向引用的具体物。比 issue body 长篇评论更耐久。
- **领域语言强约束**：每条 plan 路过 `docs/CONTEXT.md` 闸门，重复借用偏离 canon 的 issue 用语会被显化。
- **POSTPR 与本 ADR 不冲突**：POSTPR 管 in-flight PR 的 "no punt"，本 ADR 管 standalone feature issue 的 "close-with-good-plan"，互不渗透。

### Negative

- **"Plan committed = closed" 与 "完成 = closed" 在 issue tracker 表象上无法区分。**
   缓解：close comment 里强制写明"plan committed; impl pending follow-up PR"句式；外部读者可由此区分。
- **Plan 写得草率会通过 5 条门槛而真到 implement 时仍要返工。**
   缓解：plan 必须含 judge harness 段（MD playbook MAIN 调度），写不出 judge 步骤的 plan 视为不够具体，应保持 OPEN。
- **未来语义漂移风险**：team 成员可能渐渐把任意 plan stub 都视为"good"，把 ADR 当成 close-everything 通行证。
   缓解：本 ADR 用作 close 的引用文档；review 时若一份 plan 不满足 5 条硬性条件，reviewer 直接拒绝合 PR、并在 issue 上重开。

### Neutral

- 本 ADR **不**改写 `docs/POSTPR.md`、`docs/PR-PLAN.md`、`docs/HOWTO-PLAN-PR.md` 任何条款。它们只覆盖 in-flight PR 与 implementation PR 的循环；本 ADR 只补充未分配 feature issue 的处置方式。
- 本 ADR **不**对已分配（assignee 非空）的 issue 生效。已分配 issue 仍按 owner 自己的进度推进，close 条件由 owner 决定。

## Alternatives considered

### Option A：plan 写出来 + commit = close（即本 ADR 选项）

见 Decision。已选。

### Option B：plan 立即可开工 OR 已被现有工作覆盖 = close

更严格。会产生"plan 写了但 issue 不 close"的状态——issue tracker 的 OPEN 列表无法由"是否 close"反映 plan 完备性。被否，因为它把判断权挪到了 close 行为上而不是 plan 行为上，与"plan 文件是首要正向资产"理念相悖。

### Option C：plan 完整解决 issue、零后续 PR = close

最严。基本上只允许"实际上已实现且补 plan 文档化"的极少数情况 close。会把 95% 的 feature issue 永远卡在 OPEN，与本 ADR 要解决的 issue tracker 失真问题正面冲突。被否。

## Verification (judge harness for this ADR)

本 ADR 自己也需要可验证。判 ADR 是否被遵守的 judge harness：

1. 在任意一个 docs-only PR 提出"close issue with plan"时，reviewer 在 PR 上手动核对 5 条硬性条件中的每一条；任一未满足，reviewer 在 PR 上 request changes 并附上未满足条款编号。
2. 若已 close 的 issue 在后续 6 个月内从未被 follow-up PR 引用其 plan 路径，由 sweep 任务（人手或自动）回头审查：plan 是否实际是个 placeholder。Placeholder 则把 issue 重新打开并标 `plan-was-stub`。
3. 任何工程师对 close 决定有疑问时，可在原 issue 上评论 `/reopen-with-reason: <theory>`，由 maintainer 决定。

## References

- `docs/HOWTO-PLAN-PR.md` — 4 段 plan 结构权威来源
- `docs/POSTPR.md` — in-flight PR 的 codex review loop（与本 ADR 互补）
- `docs/PR-PLAN.md` — in-flight PR 找出 issue 的"no punt"修法（与本 ADR 互补）
- `docs/CONTEXT.md` — TeamBrain canonical 领域语言
- `docs/adr/0001-two-stage-install.md` — ADR 写作风格参考
- `docs/adr/0004-calibration-via-claude-code-subagent.md` — ADR 写作风格参考
