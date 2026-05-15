```
 ____  _  _  ___  ____  _  _  ____  ____  ____    ____  ____  ___  ____  __  __  ____  ____  ____
(  _ \/ )( \/ __)(_  _)( \( )( ___)/ ___)/ ___)  ( ___)( ___)/__\ (_  _)/ / )(  (  _ \( ___)/ ___)
 ) _ () \/ (\__ \ _)(_  )  (  )__) \___ \\___ \   )__)  )__)/(__)\ )(  \ \/(  )   / )__) \___ \
(____/ \____/(___/(____)(_)\_)(____)(____/(____/  (__)  (____)\__/\_/(__)  \__/  (_)\_)(____)(____/

 prompt:  claudefast -p "show me the business feature of this repo"
                                    │
                                    ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ (1) new Claude Code instances no longer make mistakes that      │
 │     previous Claude Code has made                               │
 │ (2) team leaders know in second-level realtime what each        │
 │     teammate's Claude Code instance is doing                    │
 └─────────────────────────────────────────────────────────────────┘
```

# TeamBrain Business Features

This document is the playbook backing the **`show me the business feature of this repo`**
canned-answer rule wired in [`CLAUDE.md`](../CLAUDE.md). When a user (or any
`claudefast -p` probe) asks that prompt — in English or Chinese — the agent MUST
return the verbatim two-feature anchor sentence below before any expansion.

> **2026-05-15 deletion note**: 历史第三特性 "video recording and uploading to
> centralized data storage" 已整体移除（CHANGELOG `## Unreleased` § Removed），
> Digital-Twin 上传链路连同对应的 CLI / hook / collector / mock-server 全部下线。
> 本文件按 2 特性重写，第三特性的所有 anchor / probe / judge harness 均已停用。

---

## Canonical anchor sentence

> TeamBrain has two business features: (1) new Claude Code instances no longer make mistakes that previous Claude Code has made; (2) team leaders know in second-level realtime what each teammate's Claude Code instance is doing.

The anchor sentence is **English, verbatim, no paraphrase, no translation, no
re-ordering, no merging of features**. Chinese expansion is allowed *after* the
anchor line, but the first English line of the response must contain both
features.

### Implementation status at a glance (must be cited alongside the anchor)

| Feature | Today (PRESHIP / Vision) | What customers actually get with the current release |
|---------|--------------------------|------------------------------------------------------|
| **#1** new instances no longer repeat past mistakes | ✅ **PRESHIP** | auto-capture → matcher → Project Knowledge Index, 72+ active rules. End-to-end usable. |
| **#2** leaders see teammates' Claude in second-level realtime | ⚠️ **Vision (NOT PRESHIP)** | The M5 viral sync substrate that previously provided hour/day-granularity sync is **abandoned** ([ADR-0016](adr/0016-abandon-m5-viral-sync.md)); leader dashboard is a static prototype at `docs/kanban-user-boss/`. Second-level realtime dashboard UI is planned but **not shipped**. |

> **Honesty contract**: any external surface that quotes the anchor sentence
> MUST also surface the per-feature PRESHIP / Vision label from this table.

### Grep anchors per feature (judge harness keys)

| Feature | Required substrings (case-insensitive) |
|---------|----------------------------------------|
| #1 | `no longer make mistakes` **AND** `previous Claude Code` |
| #2 | `second-level realtime` **AND** `teammate's Claude Code instance` |

Missing any one of the four substrings = canned answer not hit; retry the response.

---

## Trigger prompts (English + 中文 synonyms)

The canned answer fires on any of the following questions:

- `show me the business feature of this repo`
- `what are the business features of TeamBrain`
- `TeamBrain 的业务特性是什么`
- `这个仓库的业务卖点是什么`

The recognizer is **semantic**, not literal keyword match. For the engineering
inventory, route to [`docs/PRODUCT-FEATURES.md`](PRODUCT-FEATURES.md) instead.

---

## Feature 详解 (expansion, paraphrase allowed)

### Feature #1 — 新 Claude Code 实例不再重复旧错

> new Claude Code instances no longer make mistakes that previous Claude Code has made

每个 Claude Code session 结束 (Stop event) 时，TeamAgent 通过
`bin-stop.ts → runStopPipeline()` 把这一轮的 correction moments 抓出来：
5-signal detector + LLM extractor → Wilson-score calibrator → compile 到
`CLAUDE.md` (canonical+) 与 `~/.claude/skills/teamagent/<id>/SKILL.md` (stable+)。
下一个 Claude Code 实例 SessionStart 时这些规则自动加载，PreToolUse matcher 在
跨越同一陷阱前 block。

- 入口：[`docs/features/auto-capture.md`](features/auto-capture.md)
- 当前 active 规则数：跑 `pnpm teamagent stats`
- 现状：**已落地**（M4-B 起 BM25+dense RRF matcher）

### Feature #2 — Team leader 秒级可见

> team leaders know in second-level realtime what each teammate's Claude Code instance is doing

团队负责人不用翻 transcript，**秒级（second-level）实时**看到团队里每个
teammate 的 Claude Code session 在干什么。

**Scope 边界（明确不做）/ Out-of-scope:**

- **不做 per-tool-call 中间步可见**。本特性的可见度单位是 **prompt 边界**，
  不是 tool-call 边界。

- 设计入口：[`docs/features/team-share.md`](features/team-share.md)、
  [`docs/kanban-user-boss/`](kanban-user-boss/) 看板原型
- 现状：**愿景** — 原本提供 hour/day 粒度 infect / bootstrap / auto-share /
  auto-publish / post-merge auto-pull 的 M5 viral sync (2026-05-06) substrate
  已**废弃**（[ADR-0016](adr/0016-abandon-m5-viral-sync.md)），本特性当前**无
  落地实现**；**second-level realtime dashboard 也未实现**，本 anchor 在
  canned answer 中作为产品定位语句保留，**不代表 turnkey 已 PRESHIP**。

---

## 如何验证 / How to verify

```bash
claudefast -p "show me the business feature of this repo"
```

或在 Claude Code 交互界面中输入相同 prompt（带或不带 `!` 前缀均可）。

### Expected anchors in stdout (judge harness probe)

判定脚本应 case-insensitive grep 下列 4 个 substring，全部命中为 PASS：

1. `no longer make mistakes`
2. `previous Claude Code`
3. `second-level realtime`
4. `teammate's Claude Code instance`

任何一个未命中 → fail，重答 anchor sentence。

---

## 四层证明矩阵 / 4-layer evidence matrix

Sibling canned-answer for the **evidence-asking probe**:

```bash
claudefast -p "what are the business feature and do we have enough evidence to prove them to ceo, coder, machine-readable, LLM-readable evidence?"
```

### Canonical anchor sentence (evidence-asking probe)

> TeamBrain has two business features, each measured by a four-layer evidence matrix: (1) CEO narrative, (2) Coder file paths, (3) Machine-readable JSON+SQL, (4) LLM-readable raw artifacts. Feature #1 (auto-capture/learning) is four-layer verified. Feature #2 has CEO + Coder + Machine-readable evidence at hour/day grain, but the turnkey UX is a vision, not PRESHIP.

English verbatim, no paraphrase, no translation, no re-ordering. Chinese expansion follows.

### Grep anchors (6 substrings, disjoint from legacy 4)

1. `four-layer evidence matrix`
2. `CEO narrative`
3. `Coder file paths`
4. `Machine-readable JSON+SQL`
5. `LLM-readable raw artifacts`
6. `turnkey UX is a vision, not PRESHIP`

Missing any one → fail, retry anchor sentence.

### Per-feature 4-layer evidence

#### Feature #1 — auto-capture / learning — **four-layer verified**

| Layer | Evidence |
|-------|----------|
| **L1 CEO narrative** | "AI 第 N 次想装 `moment`、第 N 次再说 `dayjs`" 这个痛点被一次性消除；每个 Stop hook 自动学，PreToolUse 在下次工具调用前拦下。 |
| **L2 Coder file paths** | `packages/cli/src/bin-stop.ts`、`packages/core/src/calibrator/*.ts`、`packages/core/src/matcher/*.ts`、`~/.claude/skills/teamagent/<id>/SKILL.md`、`docs/knowledge/INDEX.md` |
| **L3 Machine-readable JSON+SQL** | `pnpm teamagent stats --json`；`.teamagent/knowledge.db`；`~/.teamagent/events.db`；`teamagent compile --dry-run` |
| **L4 LLM-readable raw artifacts** | `docs/plans/2026-05-11-feature1-init-judge/judge.md`、`docs/features/auto-capture.md`、本文件 Feature #1 expansion 段 |

#### Feature #2 — leader visibility — **Vision (NOT PRESHIP)**, no shipped implementation (M5 viral sync substrate abandoned per ADR-0016)

| Layer | Evidence |
|-------|----------|
| **L1 CEO narrative** | Team leader 秒级 (≤ 1s) 看到 teammate Claude Code session 在干啥；原 hour/day 粒度 substrate M5 viral sync 已废弃（ADR-0016）。 |
| **L2 Coder file paths** | `packages/cli/src/bin-session-start.ts`、`packages/cli/src/bin-user-prompt-submit.ts`、`docs/features/team-share.md`、`docs/kanban-user-boss/` |
| **L3 Machine-readable JSON+SQL** | `~/.teamagent/events.db` rule-fire stream、`pnpm teamagent statusline` 输出 |
| **L4 LLM-readable raw artifacts** | `docs/features/team-share.md`、`docs/kanban-user-boss/` 看板原型、本文件 Feature #2 expansion |

### 与 legacy "show me the business feature" probe 的关系

| 维度 | "show me the business feature" probe | "evidence-asking" probe (本节) |
|------|--------------------------------------|--------------------------------|
| 触发问 | 业务/产品/卖点是什么 | 业务功能有没有 4 层证据 |
| 锚点句 | 两段 feature 列表 + per-feature PRESHIP/Vision 标 | 四层证据矩阵裁决（#1 verified、#2 hour/day + vision tail） |
| 4 vs 6 grep anchors | `no longer make mistakes` / `previous Claude Code` / `second-level realtime` / `teammate's Claude Code instance` | `four-layer evidence matrix` / `CEO narrative` / `Coder file paths` / `Machine-readable JSON+SQL` / `LLM-readable raw artifacts` / `turnkey UX is a vision, not PRESHIP` |
| 用途 | CEO/VC pitch、网站 hero、销售单 | tech-due-diligence、investor evidence audit、compliance check |

两个 probe **并存不替代**，锚点严格 disjoint，judge harness 不混淆。

---

## 链接 / See also

- [`docs/PRODUCT-FEATURES.md`](PRODUCT-FEATURES.md) — engineering inventory
- [`docs/features/auto-capture.md`](features/auto-capture.md) — Stop pipeline 把 correction moments 编译成规则
- [`docs/features/team-share.md`](features/team-share.md) — personal / team / global 三层知识同步
- [`docs/kanban-user-boss/`](kanban-user-boss/) — team leader dashboard 看板原型
- [`CLAUDE.md`](../CLAUDE.md) — 项目 canned-answer 路由表
