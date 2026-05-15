```
   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  H0 - 2    │→ │  H2 - 6    │→ │  H6 - 12   │→ │  H12 - 24  │
   │  Frame it  │  │  Skeleton  │  │  Review    │  │  Real run  │
   └────────────┘  └────────────┘  └────────────┘  └────────────┘
                                                          │
   ┌────────────┐  ┌────────────┐  ┌────────────┐         ▼
   │  H60 - 72  │← │  H36 - 60  │← │  H24 - 36  │← ──────┘
   │  Release   │  │  Real run2 │  │  Patch     │
   └────────────┘  └────────────┘  └────────────┘
```

# TeamBrain 72h Light-Speed Bootstrap

72 小时把 TeamBrain 从「空 repo + 一个想法」推进到 v0.1，靠人 + agent 不间断协作完成。

## Multi-Day Status Snapshot (as of 2026-05-01)

| Day | Hour 范围 | 阶段 | 状态 | 备注 |
|-----|-----------|------|------|------|
| **DAY 0** | H0 – H2 | Frame the problem | ✅ **DONE** | Mission + trap dump + HTML 快照已产出 |
| **DAY 1** | H2 – H24 | Skeleton + Reviewer + Real Task #1 | 🔄 **IN PROGRESS** | H2-12 已达 `READY`（H2-6 骨架 8/8 ✅ + H6-12 reviewer/cleanup 2 轮 ✅；P0=0 / P1=0 / P2=3 deferred）；H12-24 Real Task #1 等 owner 指派真任务 |
| **DAY 2** | H24 – H48 | Patch the brain + Real Task #2 (start) | ⏳ **TODO** | 等待 owner approval 才可启动 |
| **DAY 3** | H48 – H72 | Real Task #2 finish + Release v0.1 | ⏳ **TODO** | 等待 owner approval 才可启动 |

> ⛔️ **H24+ pause gate**：DAY 2/3 不在本 commit 范围内。owner 必须显式批准
> 后，agent 才能继续推进 H24 之后的工作。当前仍在 DAY 1：H2-12 已 READY，
> H12-24 Real Task #1 等 owner 指派真任务与对应 evidence/transcript。

### DAY 0 detail — Hour 0 – 2「Frame the problem」FINISHED ✅

| 产出 | 状态 | Artifact |
|------|------|----------|
| Mission statement (≤200 字) | ✅ Done | 见下文 *Mission statement* 段 |
| 原始 trap dump | ✅ Done | [../notes/2026-05-01-day0-team-experience-dump.md](../notes/2026-05-01-day0-team-experience-dump.md) — 40 坑 + 10 标准 + 5 失败案例 |
| HTML 快照 | ✅ Done | [2026-05-01-teambrain-72h-bootstrap.html](2026-05-01-teambrain-72h-bootstrap.html) |
| 生成方式 | ✅ Reproducible | 7 路并行 `claudefast -p --output-format stream-json --verbose`（FASTPROBE pattern, see `docs/FASTPROBE.md`），尾部 `<laziness-self-report>` 6 项均 false |

### DAY 1 detail — Hour 2 – 24「Skeleton + Review + Real Task #1」🔄 IN PROGRESS

H2 – 6 Skeleton parallel build (8 sonnet writers × 1 file each, atomic commits) — ✅ **DONE** (后经 H6-12 cleanup 2 轮 → READY)：

| Owner | Output | 状态 | Commit / Artifact |
|-------|--------|------|-------------------|
| skeleton-architect (sonnet) | `docs/teambrain/STRUCTURE.md` | ✅ Done | 529a6a7 — canonical layout registry |
| readme-writer (sonnet) | `docs/teambrain/README.md` | ✅ Done | 8519046 — 5-min onboarding flow |
| trap-format-author (sonnet) | `docs/teambrain/TRAP_FORMAT.md` | ✅ Done | 75a95c4 — trap schema + linter recipe |
| verify-template-author (sonnet) | `docs/teambrain/VERIFY_TEMPLATE.md` | ✅ Done | ebc321a — 3-stage judge harness |
| traps-curator (sonnet) | `docs/teambrain/TRAPS.md` | ✅ Done | 7e7288c — 5 P0 + 35 condensed + 10 standards + 5 cases |
| task-template-author (sonnet) | `docs/teambrain/TASK_TEMPLATE.md` | ✅ Done | dad4222 — anti-mock + evidence checklists |
| claude-rules-author (sonnet) | `docs/teambrain/agent_rules/claude.md` | ✅ Done | c6a4886 — FASTPROBE batch=2 cap |
| codex-rules-author (sonnet) | `docs/teambrain/agent_rules/codex.md` | ✅ Done | 6fa6a2c — image-gen + sandbox guards |
| convergence-reviewer (opus) | `docs/teambrain/CONVERGENCE.md` | ✅ Done | H6-12 reviewer pass (this commit) |

H6 – 12 Reviewer pass + human cleanup — ✅ **DONE** (2 轮 review → READY)：
- 最终 verdict: `READY` — 当前状态入口见 [`../teambrain/CONVERGENCE.md`](../teambrain/CONVERGENCE.md)，完整 review trail 见 [`../teambrain/convergence/`](../teambrain/convergence/)（含 1st-pass 全部 findings、cleanup queue、2nd-pass sign-off、Final READY sign-off）。
- Round 1 (commit 6f50017): `CLEANUP-REQUIRED`，P0=6 / P1=7 / P2=3。Top P0 themes: TRAPS.md schema drift vs TRAP_FORMAT spec（hyphen vs underscore 字段名、P1/P2 table 缺 `verify_command` / `evidence_link` 两列、`category: testing` violates enum）；TASK_TEMPLATE example 用 `VERIFY#...` / `TRAP#<slug>` 不符合 id regex；`agent_rules/claude.md` 用 uppercase `TRAPS-READ:` 而 `codex.md` 用 lowercase `traps-read:` — VERIFY-CLAUDE-005 grep 会 reject 每个 Codex agent 的 first commit。
- Cleanup loop: 主 lead 通过 SendMessage 把 per-file findings 路由回 4 个 originating teammates（traps-curator / task-template-author / claude-rules-author / codex-rules-author），不让 lead 静默 patch。共 11 个 atomic cleanup commits（含 traps-curator 5 个 + task-template-author 3 个 + claude-rules-author 3 个 + codex-rules-author 1 个）。
- Round 2 (commit 03c15db): 残留 1 个 P1（`feat(m{N})` 漏改 `agent_rules/codex.md:99`），routed back → codex-rules-author 一行修复 commit `283f5a4` → `READY`，P2 cosmetic findings 按 1st-pass 指引 deferred 到 Real Task #1 之后统一清理。
- Reviewer 只写 CONVERGENCE.md + 本 status；8 份 reviewed files 全部由 originating writer 自行修复，零 lead-side patch。

H12 – 24 Real Task #1（real owner work + transcript + evidence）— ⏳ **READY TO START**（cleanup-blocker 已解，等 owner 指派一个 owner-real 任务）。

DAY 1 退出准则（必须全部 ✅ 才能进入 DAY 2）：
1. STRUCTURE.md registry 所列 canonical paths 全部存在且关键入口非空。
2. Reviewer agent 已出具 current convergence status，CONVERGENCE.md 已落盘，完整 reviewer trail 归档在 `docs/teambrain/convergence/`。
3. Real Task #1 的 transcript + 命令 evidence + 失败点列表已归档。

### DAY 2 / DAY 3 — ⏳ TODO（H24+ pause gate active）

未启动。详见后文 H24 – 36 / H36 – 60 / H60 – 72 各阶段定义。等待 owner
显式 approval 后再继续；不要 agent 自己越过 pause gate。

### Mission statement

> TeamBrain 是 agent 团队的**共享经验脑**：把每次踩过的坑、判断标准、失败案例固化成可验证规则，让新 agent / 新人 5 分钟内能避开历史坑、跑通真实任务；不靠口头审、不靠 mock 通过、不靠"我感觉应该这样"。

## Cast & Constraints

- **1 人类 owner**：方向、删废话、补真实失败案例。
- **2 个 Claude Code instances**（Agent A、Agent B）。
- **2 个 Codex instances**（Agent C、Agent D）。
- **1 个 reviewer agent**：审规则、审 mock、审可验证性。
- 所有人不睡觉，连续 72h。

不做的事：
- 不做 UI。
- 不做数据库。
- 只做 Markdown + prompts + scripts。

## Hour 0 – 2 / Frame the problem

**Human**
- 说清楚 TeamBrain 是什么。
- 说清楚它不是给人看的文档站。
- 倒出历史坑（已经踩过的、模糊的规则、被绕过的检查）。

输出：一段 ≤ 200 字的 mission statement + 一份原始 trap dump（粗糙即可，留给 Agent B 整理）。

## Hour 2 – 6 / Skeleton parallel build

四个 agent 并行，每个 agent 一个独立目录，互不阻塞。

| Agent | Stack | Output |
|------|-------|--------|
| Agent A | Claude Code | `repo skeleton` + `README.md` |
| Agent B | Claude Code | `TRAPS.md` + trap 格式约定 |
| Agent C | Codex | `TASK_TEMPLATE.md` + `VERIFY_TEMPLATE.md` |
| Agent D | Codex | `agent_rules/claude.md` + `agent_rules/codex.md` |

收敛点：H6 时 owner 把四份产出 merge 到 `main`，跑一次 `tree`，确认目录结构干净。

## Hour 6 – 12 / Reviewer pass + human cleanup

**Reviewer Agent** 顺序检查：
1. 规则是否空泛 —— 比如「写好代码」「保持简洁」一律拒绝，要求改成 ground-truth 可验。
2. 有没有 mock loophole —— 任何「跳过」「skip if」「allow if no test」必须打上 ⚠️。
3. 每个任务模板是否能 ground-truth verify —— `VERIFY_TEMPLATE.md` 必须给出可执行命令 + 期望输出。

**Human** 跟在 reviewer 之后：
- 删除废话。
- 保留硬规则。
- 补充真实失败案例（H0 trap dump 里挑 3 – 5 条最痛的写进 `TRAPS.md`）。

## Hour 12 – 24 / Real Task #1

让 Claude 与 Codex 读完整 TeamBrain，跑一个真实任务（不是 hello-world，是用户自己今天就想做的活）。

收集：
- 完整对话 transcript。
- 命令输出 evidence。
- 失败点列表 —— TeamBrain 没拦住的错。

## Hour 24 – 36 / Patch the brain

把 Task #1 暴露的问题反向写回去：
- 新失败 → 新 trap（按 `TRAPS.md` 格式）。
- 模糊规则 → 硬规则（带可执行验证）。
- 加 `no-mocking checklist`。
- 加 `evidence checklist`。

收敛点：每条新增规则必须配一个 reproducible failing case（对应 Task #1 的 evidence）。

## Hour 36 – 60 / Real Task #2

换一个任务、换一个 agent（最好换 stack：Task #1 用 Claude，Task #2 用 Codex；反之亦然）。

通过条件：
- Task #1 的错误一个都不再犯。
- 新出现的错误数量 < Task #1。

如果 Task #2 仍把 Task #1 的错重犯一次，回到 H24 – 36 再 patch 一轮，不进入 release。

## Hour 60 – 72 / Release v0.1

- 清理目录（删 scratch、删未引用的 markdown）。
- 写 onboarding flow（新 agent / 新人怎么 5 分钟接入）。
- 写 usage examples（≥ 2 个真实任务的 walkthrough）。
- `git tag v0.1` + push。

## Success Bar

v0.1 被认为合格的硬条件：

1. 一个**没读过任何历史**的新 agent，按 onboarding flow 5 分钟内能跑通一个 task。
2. Task #1 全部失败点都在 `TRAPS.md` 里有对应条目。
3. 每条规则都能用 `VERIFY_TEMPLATE.md` 里描述的命令验证，没有「靠人审」的口头规则。
4. 没有任何「mock 即通过」的 loophole。

## Anti-pattern（在 72h 内必须避免）

- 写 plan.md 时塞「先去读哪些文件」之类的预热脚本。
- 让 agent 自己评价自己产出（必须走 reviewer agent + human）。
- 用 hello-world 当真实任务（Task #1 / #2 必须是 owner 当下真要做的活）。
- 跳过 H6 – 12 的 reviewer pass 直接进入 Real Task #1。
