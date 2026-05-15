```text
   AttributionEventBase  ←── 现状: severity, timestamp, userFacingValue?, counterfactual?
       |
       v + delivery?: "log" | "context" | "block"   ← 本 ADR 加
       
   Renderer (StdoutRenderer)
       |
       v 消费 delivery: 现在不渲染区分 (future: 加 [→Claude] 前缀做装饰)
       
   HookShell (runHook / runAdvancedHook)
       |
       v 当前: 始终 exit 0 (per ADR-0008 不变)
         delivery 是 metadata; 未来若放宽 ADR-0008 时可作退码聚合依据
```

---
Status: proposed
Date: 2026-05-08
---

# Add `delivery` field to `AttributionEventBase` as metadata; preserve ADR-0008 always-exit-0 guarantee

候选 2 grilling 阶段（`/improve-codebase-architecture` 走完 D1 + D2 系列）暴露了一个 ADR-0008 当前 design 没覆盖的维度：每条 `AttributionEvent` 在 hook 进程退出时同时讲给**两个听众**——用户屏幕（exit 0 stderr）+ Claude 上下文（exit 2 stderr 反馈）。当前 `AttributionEventBase` 只有 `severity` / `timestamp` / `userFacingValue?` / `counterfactual?`，没有 audience（谁看）或 blocking（是否阻止下一步）维度的 typed 表达；又因 ADR-0008 把 `runHook` / `runAdvancedHook` 的退码硬编码为 `exitZero()`（"Hooks must never block Claude Code" 保证），实际上 Claude **永远拿不到** attribution event 作 context——AttributionBus 当前是单消费者管道（user only），与设计文档 spec v5.2 + plan v1.2 的"事件总线"愿景半残。Grilling 收敛出三档调和方案——(α1) 放宽 ADR-0008 加退码聚合 / (α2) delivery 仅 metadata exit 不变 / (α3) 放弃 delivery 字段——用户最终选 (α2)：保留 ADR-0008 的 `always-exit-0` 硬保证，把 delivery 维度作为**显式 typed metadata 字段**加进 `AttributionEventBase`，三档枚举 `"log" | "context" | "block"` optional 默认 `"log"`，**不**映射到退码、**不**改 HookShell 行为，仅供 (i) Renderer 未来按 delivery 做装饰渲染（如 context 事件加 `[→Claude]` 前缀提示）、(ii) 任何 future ADR 可在已有的 architectural future-proof 字段上扩展退码聚合 / persistent log 分流 / telemetry 采样、(iii) grep 检索点（`grep "delivery: \"context\""` 找出哪些 emit 站点意图给 Claude 看）。本 ADR 同时在 `attribution-bus-contract.ts` 加 roundtrip 用例确保 delivery 经 emit+drain 不丢，在 `docs/CONTEXT.md` 的 "Integration & shell" 子节加 `Delivery mode` 术语，在 `docs/plans/2026-05-07-hookshell-attribution-fused-plan.md` 的 CHANGELOG 加 v1.2 条目。bin-*.ts 的所有现有 emit 站点保留默认 `"log"` 语义无须改动；新加显式 delivery 标注仅在未来需要时再追加。

## Considered Options

- **(α1) 放宽 ADR-0008，让 delivery 字段映射到退码（context → exit 2 不阻止；block → exit 2 阻止；log → exit 0）** — Rejected by user choice。代价：直接撤回 ADR-0008 的 "never block harness" 硬保证；HookShell.runHook / runAdvancedHook 内部需加 hook-type-aware delivery 聚合逻辑（包括 Stop hook 不能退 2 的 fallback）；contract test、run-hook 单元测试都要重写；这次 PR 体量翻倍。Long-term 对 architectural value 最大，但 PR 风险面也最大。**保留作 future ADR**。
- **(α2) delivery 字段 as metadata only，exit 行为不变** — **Chosen**。代价：TOP LEVEL "Claude 拿到 attribution context" 的诉求**当前不实现**；delivery 字段单纯是 typed metadata，对运行时行为没有可观察影响（仅 contract test + grep 能验证它存在）。优点：合并 PR 最小风险面（attribution.ts 加 1 字段 + 1 测试 + 1 ADR + CONTEXT.md term）；ADR-0008 always-exit-0 保证不变；future 任何 ADR 可在已有字段上扩展，无需重新加字段触发 Port 接口冻结流程。该 ADR 的核心价值是 **architectural future-proof + 显式 audience 维度的 typed 表达**。
- **(α3) 不加 delivery 字段，接受 fused 当前形态** — Rejected by user choice。代价：grilling 阶段 4 份 doc 全废；audience 维度永远停在隐式（每个 emit 站点的"谁应该看"靠人脑/code review 维护）；future 加退码聚合或 telemetry 时需先加字段、撞 Port 接口冻结流程。**没有显式 typed metadata 比有 metadata 更糟**。
- **(α4) 加 `audience: "user" | "claude" | "both"` + `blocking: bool` 两个独立字段** — Rejected。两个字段笛卡尔积有 6 种组合，但只有 3 种实际有意义（log / context / block）；其余 3 种（"only Claude not user blocking" / "only Claude not user non-blocking" / "user only blocking"）在 hook 语义里不可能或无意义。两字段开放但无意义组合 = 接口比实现深、shallow 不被 deletion-test 发现。单字段 `delivery: 3 档 enum` 收窄 leverage 同时保留全部有效语义（per LANGUAGE.md "interface includes every fact a caller must know"）。
- **(α5) 用现有 `severity: "info" | "highlight" | "warning"` 字段编码 audience（severity = info → user only / highlight → both / warning → block）** — Rejected。severity 描述事件**响度**（用户关心程度），audience 描述**给谁看**，blocking 描述**是否阻止下一步**，三个维度正交。压成一字段后"warning 级别但不阻止"或"info 级别但 Claude 必须看"这种合理组合无法表达。

## Consequences

- **`AttributionEvent` 类型变化**——`packages/types/src/attribution.ts` `AttributionEventBase` 新增 `delivery?: "log" | "context" | "block"`，optional 默认 `"log"`，向后兼容现有所有 emit 调用点（约 14-20 个 kind 的 emit）。包括 `cli/commands/skeleton-demo.ts` 6 处 emit、`cli/commands/pitfall.ts` 1 处 emit、`core/pipeline/*` 内 ~7 处 emit 在内的所有现有 caller 默认拿到 `"log"` 语义，行为不变。新加 emit 可显式写 `delivery: "context"` 等。
- **`AttributionBus` port 接口本身不动**——只 emit/subscribe/drain，`delivery` 是 event payload 的字段，不是 bus 接口的 surface。这意味着 M0 元约束「Port 接口冻结」对 bus 本身**不**触发，降低 PR 风险面。`attribution-bus-contract.ts` 加一个用例验证 delivery 字段经 emit + drain roundtrip 不丢。
- **`Renderer` port 接口不动；`StdoutRenderer` adapter 现在可读 delivery 字段做 future 装饰**——本 PR **不**改 StdoutRenderer 行为；future 可加 `[→Claude]` 前缀给 `delivery="context"` 的事件、或加 `[阻断]` 给 `delivery="block"`。Renderer port 当前仍是 hypothetical seam（per ADR-0005 / one production adapter），保持不动符合 archive-port 纪律。
- **HookShell 行为不变**——`runHook` / `runAdvancedHook` 仍始终 `exitZero()`，per ADR-0008 的 "Hooks must never block Claude Code" 保证。delivery 字段对退码**没有可观察影响**；HookShell 不读它。
- **grep + telemetry future-proof**——`grep "delivery: \"context\""` 在代码里能找出哪些 emit 站点意图给 Claude 看；future 加 OpenTelemetry / Prometheus sink 时可按 delivery 分桶；future ADR 若放宽 ADR-0008，已有现成字段直接接入。
- **CONTEXT.md 新增 `Delivery mode` 术语**——加在 "Integration & shell" 子节，配合 `HookShell` / `Hook channel` / `Hook handler` 一起作为 hook 边界 + attribution 维度的 canonical 词汇。Flagged ambiguities 加 "audience vs delivery" 与 "exit 2 vs metadata" 条目记录设计权衡。
- **回滚路径**——若发现 delivery 字段在生产中误用（比如某 caller 误标 context 期望 Claude 反馈但实际不发生），可直接 revert `packages/types/src/attribution.ts` 的 delivery 字段添加，所有 caller 无 breaking change（optional 字段，删字段 caller 编译仍通过）；最坏情况整个 ADR-0009 revert 不影响 ADR-0008 + HookShell 任何工作。
- **future ADR 入口**——若团队决定让 attribution 真正 feed Claude，新 ADR 应：(i) 引用本 ADR-0009 已有 delivery 字段；(ii) 决议放宽 ADR-0008 的 always-exit-0（或加 escape hatch）；(iii) 在 HookShell finally 块加 delivery 聚合 → exit code 计算（含 Stop hook 的 block→context fallback 与 PreToolUse / UserPromptSubmit 的 exit 2 + block 副作用）；(iv) 重写 contract test 与 run-hook 单元测试。
- **compatibility with M5 viral sync**——delivery 字段是 in-process attribution 标签，**不**进 git；team-scope 规则的 attribution 事件在每个 teammate 本地独立标 delivery，不需要 cross-machine 协议。M5 不受影响。
