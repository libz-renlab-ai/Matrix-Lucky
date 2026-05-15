```text
                          ┌──────────────────────────────────────────┐
                          │                                          │
   stdin JSON ──► HookShell (default) ──► handler (pure core) ──►   │
                  │                       │                          │
                  │ ctx: { store,         │ returns Output            │
                  │   eventLog,           │                           │
                  │   bus,                │                           │
                  │   mirrorSystemMsg }   │                           │
                  │                       │                          │
                  ▼                       ▼                          │
                  AttributionEvent (kind = …)                        │
                  └─────────► Renderer ─► stderr                     │
                                                                     │
   Stop / heavy bin ──► HookShell (advanced) ──► escape: { detached, │
                                                            lock,    │
                                                            timeout }│
                          └──────────────────────────────────────────┘

   8 个 bin-*.ts  ────► 1 个 HookShell module  ────► 1 个 AttributionBus
   (重复 wiring)        (两层 API: 默认 + 进阶)         (取代 stderr)
```

# HookShell + AttributionEvent Fused PR Plan

PR 编号：待开（max-power scope）
Branch：`teamwork/hookshell-attribution-fused`（基于 main 2e783ae）
Plan 起源：[Architecture grilling session 2026-05-07/08](.) — `/improve-codebase-architecture` skill 走完 candidate 2+3 grilling，4 副鸭子 INTERFACE-DESIGN 平行设计稿，two-layer hybrid + 三处借鉴 锁定。

---

## CHANGELOG

| ver | date | 变更 |
|-----|------|------|
| v1 | 2026-05-07 | Initial fused plan after architecture grilling round 2 锁定全部 5 题 + max-power scope 升级 |
| v1.1 | 2026-05-08 | Branch 转移：从 `teamwork/archive-hypothetical-ports` 移到独立分支 `teamwork/hookshell-attribution-fused`（避免与 ADR-0005 PR 共用 commit 树） |
| v1.2 | 2026-05-08 | 加入 delivery field as metadata (per `/improve-codebase-architecture` candidate-2 grilling α2 决议)：`AttributionEventBase` 加 `delivery?: "log" \| "context" \| "block"` optional 字段；attribution-bus-contract.ts 加 roundtrip 用例；CONTEXT.md 加 Delivery mode 术语；详见 ADR-0009。**当前是 metadata only**——HookShell 仍走 ADR-0008 的 always-exit-0 路径不变 |

---

## 1. Task Description

### 做什么

把 8 个 `packages/cli/src/bin-*.ts` 共享的 imperative shell 抽出来成 **HookShell module**（两层 API：`runHook` 默认层 + `runAdvancedHook` 进阶层），同时：

- **Sweep**：把 5 个 hook handler factory 从 `packages/adapters/` 搬到 `packages/core/`（修复 FCIS 元约束违反）
- **Reshape**：`AttributionEvent` 重塑为 discriminated union by `kind`（Q4-2 = α）
- **Migrate**：8 个 bin-*.ts 全部改用 HookShell；20+ 处 `process.stderr.write` user-visible 文本替换为 `bus.emit({ kind, ... })`
- **Document**：CONTEXT.md 补 `Hook channel` + `HookShell` + `Hook handler` 三个术语；ADR 0006 记录此次 deepening

### 怎么做

12+ commit incremental，单 PR，bin-stop（最高 risk）放最后。每 commit 跑 `pnpm typecheck` + `pnpm test` 全绿才进下一步。

### 不做

- **Candidate 1（hypothetical port seams）**：已在 ADR-0005 + `docs/plans/2026-05-07-archive-hypothetical-ports/` 处理（由 `teamwork/archive-hypothetical-ports` 分支 PR 推进），本 PR 不重复
- **Candidate 4（dual calibrators）**：另开 ADR + PR，不在本 PR scope
- **新增任何 port**：稿 4 副鸭子建议的 `HookIOPort` / `ClockPort` / `HookProcessPort` / 新 `KnowledgeStorePort` / `PersistedEventLogPort` 全部拒绝（hypothetical seam，违反 ADR-0005 纪律）
- **MCP / Cursor channel 适配**：NOT YET（per `docs/features/multi-tool.md`），HookShell 的 `runAdvancedHook` 设计为它们留口子但不在本 PR 实装
- **Plugin / middleware 系统**：稿 2 副鸭子的 9-phase plugin framework 拒绝（over-engineering for 8 channels）

---

## 2. Expected Outputs

### 新增

| 路径 | 内容 |
|------|------|
| `packages/cli/src/hook-shell/index.ts` | `runHook` + `runAdvancedHook` 实现（~250 LOC） |
| `packages/cli/src/hook-shell/types.ts` | `DefaultHookContext` / `AdvancedHookContext` / `HookOptions` / `AdvancedHookOptions` 类型定义 |
| `packages/cli/src/hook-shell/conditional-gate.ts` | TS conditional type，强制 `runAdvancedHook` 必须传至少一个 `escape.*` 字段才编译通过 |
| `packages/cli/src/hook-shell/__tests__/conditional-gate.test.ts` | runtime + 类型 gate 测试 |
| `packages/cli/src/hook-shell/__tests__/run-hook.test.ts` | 默认层 lifecycle smoke 测试 |
| `docs/adr/0008-hookshell-imperative-shell.md` | 设计决策 + considered options |
| `docs/plans/2026-05-07-hookshell-attribution-fused/judge.md` | 第三方 judge harness playbook |

### 移动（adapter → core，FCIS 修复）

**Plan correction (post-impl)**：原计划假设 5 个 handler factory 要搬。实际 inventory 后只有 **2 个** SDK handler factory 存在：

| from | to | commit |
|------|-----|--------|
| `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts` | `packages/core/src/hook/pre-tool-use-handler.ts` | dc6510b |
| `packages/adapters/src/hook/claude-agent-sdk/post-tool-use-sdk.ts` | `packages/core/src/hook/post-tool-use-handler.ts` | 2dbca7c |

PreToolUse 注入 3 个 dep：`idGen: () => string` / `now: () => string` / `formatStyle: "humane" | "ascii-box"`（替换 `crypto.randomUUID` / `new Date()` / `process.env.TEAMAGENT_HOOK_ASCII_BOX`）。
PostToolUse 注入 2 个 dep：`idGen` / `now`（无 env-driven format flag）。

其他 hook channel（`user-prompt-submit` / `stop` / `session-start` / `session-end` / `pre-compact` / `updater`）已经直接以 imperative `bin-*.ts` 形态在 `packages/cli/src/`，没有 `createXxxHandler(deps)` factory 模式可搬。它们已经在 imperative shell 层（per ADR-0008 设计），通过 commits 5-12 改用 HookShell 即可，不需要 sweep 到 core。

### 重塑

`packages/types/src/attribution.ts` —— `AttributionEvent` 从混血 P/Q 改成 discriminated union by `kind`：

```typescript
export type AttributionEvent =
  | { kind: "rules-vectorized"; count: number; source: "hook-stop"; severity: "info"; timestamp: string }
  | { kind: "calibration-started"; mode: string; source: "hook-stop"; severity: "info"; timestamp: string }
  | { kind: "calibration-finished"; rulesAdjusted: number; source: "hook-stop"; severity: "info"; timestamp: string }
  | { kind: "skills-updating"; source: "hook-stop"; severity: "info"; timestamp: string }
  | { kind: "scan-errors-started"; source: "hook-stop"; severity: "info"; timestamp: string }
  | { kind: "scan-errors-progress"; lastLine: string; source: "hook-stop"; severity: "info"; timestamp: string }
  | { kind: "analyze-started"; modeTag: string; source: "hook-stop"; severity: "info"; timestamp: string }
  | { kind: "analyze-finished"; firstLine?: string; source: "hook-stop"; severity: "info"; timestamp: string }
  | { kind: "hook-pre.matched"; ruleId: string; permissionDecision: "allow" | "deny" | "ask"; source: "hook-pre"; severity: "warning" | "highlight"; timestamp: string }
  | { kind: "hook-pre.passed"; ruleCount: number; source: "hook-pre"; severity: "info"; timestamp: string }
  | { kind: "user-prompt.injected"; injectedIds: string[]; source: "hook-user-prompt"; severity: "info"; timestamp: string }
  | { kind: "user-prompt.flagged"; ruleId: string; source: "hook-user-prompt"; severity: "warning"; timestamp: string }
  | { kind: "session.warmup-progress"; phase: string; source: "hook-session"; severity: "info"; timestamp: string }
  // ... 共 12-20 种 kind，sweep 所有 stderr write 后定稿
  ;
```

`StdoutRenderer` 改成按 `kind` switch 分发渲染。

### 改写

| bin | 旧 LOC | 新 LOC（预估） | 备注 |
|-----|-------|---------------|------|
| `bin-post-tool-use.ts` | 61 | ~25 | 金丝雀，最简 |
| `bin-pre-compact.ts` | 54 | ~20 | 最简 |
| `bin-session-start.ts` | 97 | ~35 | |
| `bin-session-end.ts` | 74 | ~28 | |
| `bin-updater.ts` | 206 | ~50 | HTTP 子流程留 channel |
| `bin-user-prompt-submit.ts` | 215 | ~80 | M4-A injection 留 channel |
| `bin-pre-tool-use.ts` | 264 | ~90 | semantic+legacy matcher 留 channel；含 mirrorSystemMessage |
| `bin-stop.ts` | 632 | ~50 + 子文件 | runAdvancedHook，pipeline 体仍在 `commands/stop-pipeline.ts` |

### 文档 + 治理

- `docs/CONTEXT.md` 加术语 `Hook channel` / `HookShell` / `Hook handler`
- `docs/adr/0008-hookshell-imperative-shell.md` 新建
- 新 lint 规则（`scripts/check-bin-stderr.sh` 或 ESLint custom rule）禁 `process.stderr.write` 出现 user-visible Chinese/`TeamAgent:` 文本于 `packages/cli/src/bin-*.ts`（debug fallback log 仍允许）
- `CLAUDE.md` 高频快照不变（HookShell 是实现细节，不是用户级 canned answer）

### 验证

- `pnpm test`、`pnpm typecheck` 全绿
- Feature verification 1+2+3（per `docs/feature-verification.md`）
- `pnpm teamagent skeleton-demo` 仍跑通（M0 walking skeleton 不断裂）
- 8 个 hook 真实调用：用 fixture stdin 跑每个 bin 一遍，断言 stdout 形状、bus 事件序列、exit code 0

---

## 3. Third-Party Judge Harness

按 `~/.claude/CLAUDE.md` testing-judge-harness 规则：**不让代码自己评价自己**。所有验证落到 `docs/plans/2026-05-07-hookshell-attribution-fused/judge.md` 这个 playbook（独立子文件）。

三阶段：
1. **RUN** — 固定工具集（typecheck / test / skeleton-demo / 8 bin fixture probe / verify-all-rules / feature 1+2+3 / lint check）
2. **DUMP** — 固定 JSON schema（`.judge/<run_id>/judge.json`）
3. **READ** — LLM judge（claudefast 8 路平行 probe）

任意 probe FAIL → block PR merge。详见 `judge.md`。

---

## 4. 实施顺序（incremental commits）

```
commit 1:  feat(m6): HookShell module skeleton (no callers)
           - packages/cli/src/hook-shell/{index,types,conditional-gate}.ts
           - 单元测试：mock stdin/stdout/store/bus，断言 lifecycle 顺序
commit 2:  refactor(m6): move createPreToolUseHandler from adapters to core
commit 3:  refactor(m6): move 4 other handler factories to core (sweep)
commit 4:  feat(m6): reshape AttributionEvent as discriminated union by kind
commit 5:  refactor(m6): bin-post-tool-use → runHook (canary)
commit 6:  refactor(m6): bin-pre-compact → runHook
commit 7:  refactor(m6): bin-session-start → runHook
commit 8:  refactor(m6): bin-session-end → runHook
commit 9:  refactor(m6): bin-updater → runHook
commit 10: refactor(m6): bin-user-prompt-submit → runHook + bus.emit
commit 11: refactor(m6): bin-pre-tool-use → runHook + mirrorSystemMessage
commit 12: refactor(m6): bin-stop → runAdvancedHook (highest risk)
commit 13: feat(m6): lint rule banning process.stderr.write user-visible text
commit 14: docs(m6): CONTEXT.md add 3 terms (Hook channel/HookShell/Hook handler)
commit 15: docs(m6): ADR-0008 hookshell-imperative-shell
commit 16: chore(m6): cleanup any dead wiring + verify-all-rules pass
```

---

## 5. 风险

| 风险 | mitigation |
|------|------|
| bin-stop 632 行迁移最复杂 | 放最后 commit；single-step rollback；commit 前用 `pnpm teamagent skeleton-demo` 验证 |
| AttributionEvent reshape 破坏既有 emit point | commit 4 同步改 pitfall.ts / skeleton-demo.ts；契约测试覆盖 Renderer |
| FCIS sweep 2 个 handler（PreToolUse + PostToolUse）移动 import 路径变化 | 每个 sweep commit 跑 typecheck；adapter 端保留 re-export 一段时间 |
| TS conditional type gate 写错导致 runAdvancedHook 误用不报错 | 单元测试用 type-level assertion；运行时 `assertEscapeNonEmpty` 兜底 |
| 与 ADR-0005 `_archived/` PR 冲突（同周内两个大重构） | merge 顺序：先 ADR-0005 PR，再 HookShell PR；HookShell PR rebase 后跑全套 verify |

---

## 6. Cross-PR 协调

- **ADR-0005**（archive hypothetical ports）：先 merge。HookShell PR rebase 后必须确认 6 个 archived port 不再被本 PR 任何代码 reference。
- **M5 viral sync**：HookShell 不动 viral sync 路径；m5-sync 命令本身不在 8 个 bin 里。
- **AttributionBus port**：复用现有 `packages/ports/src/attribution-bus.ts`，不改接口；只改 event payload 类型 `AttributionEvent`。
- **Issue #91 warmup state**：仍留 PreToolUse channel-specific（per Q3 lock）。
- **Issue #50542 systemMessage stderr mirror**：通过 `ctx.mirrorSystemMessage(text)` helper 收编。

---

## 7. POSTPR loop

per `docs/POSTPR.md`：PR 开后 fetch Codex review → triage P1/P2/P3 → 用 PR-PLAN + TEAMWORK 同 PR 修 → loop until Codex 👍 → merge gate（CI green + no conflict + Codex silent）。

---

## 8. 鸭语解释（DUCKPLAN 第四段）

```
        __
   ___ ( o )>   呷呷~ 鸭鸭复述全计划
   \__/__)
    ||  ||
   ^^^^^^^^
```

🦆 **(1) 任务描述**：把 8 只 bin 小鸭重复的洗脸刷牙工序提取成 `HookShell` 公共澡堂；3 只小鸭用「默认池」（post-tool-use / pre-tool-use / user-prompt-submit），4 只胖鸭用「进阶池」（bin-stop / bin-session-end / bin-pre-compact / bin-session-start，各自带 spawn detached / lock / pipeline timeout / manualResources 中的一些）。同时把 **2 个**（不是原计划的 5 个）handler factory 从 adapter 鸭舍搬回 core 鸭舍（修 FCIS 元约束）——只有 PreToolUse + PostToolUse 真存在 factory 模式。把 `AttributionEvent` 升级成 `kind: 40 enum` 的清晰窄类型。

🦆 **(2) 预期产出**：HookShell 模块 (3 文件 + 测试) / ADR-0008 / 2 handler 搬移 / AttributionEvent 重塑 (40 kind) / 8 bin 改写 / CONTEXT.md +3 术语 / lint rule。

🦆 **(3) 第三方裁判**：本 PR 自己**不**评自己。3 阶段 judge harness：RUN（固定工具）→ DUMP（固定 JSON）→ READ（LLM judge）。任一 probe FAIL → block merge。

🦆 **(4) 鸭鸭碎碎念**：呷呷~ incremental 16 commit，bin-stop 放最后兜底。POSTPR loop 直到 Codex 给 👍。merge 当日：CI 绿 + 无冲突 + Codex 不出声。

```
        __
   ___ ( o )>   呷呷！计划锁定，鸭鸭起飞！
   \__/__)
    ||  ||
   ^^^^^^^^
```
