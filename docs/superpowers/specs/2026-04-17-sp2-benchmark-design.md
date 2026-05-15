# SP-2 Benchmark 框架 v1 设计文档

> 创建日期：2026-04-17
> 状态：v1.1 实现完成（PRR 100% 验证通过）
> 父文档：`docs/superpowers/specs/2026-04-15-phase2-design-v2.md` §6
> 范围：Phase 2 SP-2 v1（基础设施先行）+ v1.1（signal 修复）

---

## 一、目标与范围

### 1.1 v1 单句目标

> **搭起 benchmark 基础设施 — 跑通 baseline vs teamagent 2 组对比 + 3 种子任务，输出可读报告，证明 hook 拦截真实生效。**

### 1.2 v1 不做（明确推迟）

| 项 | 推迟到 | 理由 |
|---|---|---|
| LLM-as-judge 评测器实现 | v2 | pattern 评测先够用；接口预留 |
| Auto-Memory 对比组 | v3 | 需研究 Anthropic 内置 memory 接口 |
| Codacy 对比组 | v4 | 需 API key + MCP 接入 |
| 30+ 任务库 | 持续累加 | v1 只 3 个种子；dogfood 中按需加 |
| 并行执行 | v2+ | 串行先稳 |
| 统计显著性检验 | v3+ | runs=3 平均够用 |
| Token 成本预测器 | v2 | 跑前 dry-run 估算 |

### 1.3 设计哲学

- **基础设施优先**：先搭跑得通的骨架，任务/对比组/评测器后续渐进累加
- **独立可演进**：`packages/benchmark` 几乎独立，不依赖 `core/adapters/types`，方便后续重构
- **TDD + Port**：SDK 调用通过 `SdkRunner` 接口注入，runner 逻辑可单测

---

## 二、4 组对比 v1 范围

| 组 | v1 状态 | 内容 |
|---|---|---|
| 1 baseline (裸 SDK) | ✅ v1 | 空 settings.json + 空 knowledge.db |
| 2 Auto-Memory | ❌ v3 | 需 SDK memory 接口 |
| 3 Codacy | ❌ v4 | 需 API + MCP |
| 4 teamagent | ✅ v1 | 完整 hook + seeded knowledge.db |

---

## 三、模块边界（packages/benchmark）

### 3.1 文件职责

| 文件 | 职责 | 依赖 |
|------|------|------|
| `types.ts` | 纯类型：`Task`、`TaskResult`、`GroupConfig`、`Report`、`Verdict` | 无 |
| `task-loader.ts` | 读 `fixtures/tasks/*.json` → `Task[]`，zod schema 校验，regex 编译 fail-fast | `types`, `node:fs`, `zod` |
| `evaluator.ts` | `evaluatePatterns(output, task) → Verdict`（correct/wrong/neither） | `types` |
| `isolator.ts` | `createGroupWorkdir(group)`、`cleanupGroupWorkdir(path)` | `types`, `node:fs`, `node:os` |
| `sdk-runner.ts` | `SdkRunner` 接口 + `ClaudeSdkRunner` 实现 + `FakeSdkRunner` 测试用 | `@anthropic-ai/claude-agent-sdk` |
| `runner.ts` | `runTask(task, group, sdk, workdir) → TaskResult` | `types`, `evaluator`, `sdk-runner` |
| `reporter.ts` | `aggregate(results) → Report`、`writeJson`、`writeMarkdown` | `types` |
| `bin.ts` | CLI parser → orchestrator | 全部 |

### 3.2 fixtures 结构

```
packages/benchmark/
  fixtures/
    tasks/
      001-moment-vs-dayjs.json     ← hook 拦截测试（pre-tool）
      002-axios-cancel.json        ← wiki 注入测试（user-prompt-submit）
      003-react-key.json           ← 纯文本基线（无 hook 命中）
    groups/
      baseline/
        settings.template.json     ← {} 空 hook（无占位符）
      teamagent/
        settings.template.json     ← 挂三 hook，路径用 {{HOOK_DIR}} 占位符
        seed.sql                   ← INSERT 语句填规则 + wiki，由 isolator 跑
  src/
    types.ts ...
  __tests__/
    ...
```

**isolator 准备 workdir 的步骤**：
1. `mkdir tmp/teamagent-bench-{group}-{uuid}/.claude/`
2. 读 `fixtures/groups/{group}/settings.template.json`，把 `{{HOOK_DIR}}` 替换为绝对路径 `<repoRoot>/packages/cli/dist`，写到 `workdir/.claude/settings.local.json`
3. `mkdir workdir/.teamagent/` 并 `openDb(workdir/.teamagent/knowledge.db)` 创建空库（自动建 schema v4）
4. 若 `fixtures/groups/{group}/seed.sql` 存在，跑 `db.exec(sql)` 填规则/wiki
5. close db

→ 解决两个隐含问题：
- **hook 路径跨机器**：占位符 + 运行时替换，不依赖固定绝对路径
- **schema 创建**：复用 `@teamagent/adapters` 的 `openDb` 而非 commit 二进制 SQLite 文件

→ isolator 唯一对 `@teamagent/adapters` 的依赖：`openDb`（util，非业务）。可接受。

### 3.3 Task JSON 格式

```json
{
  "id": "001-moment-vs-dayjs",
  "name": "moment vs dayjs",
  "category": "tech_choice",
  "prompt": "Write a TypeScript function that formats current date as YYYY-MM-DD using a date library.",
  "evaluator": {
    "type": "pattern",
    "wrong_patterns": ["from ['\"]moment['\"]", "require\\(['\"]moment['\"]\\)"],
    "correct_patterns": ["from ['\"]dayjs['\"]", "require\\(['\"]dayjs['\"]\\)"]
  }
}
```

zod schema 校验：缺字段 / regex 编译失败 → 加载阶段 fail-fast。

### 3.4 Verdict 三态

```
correct  ← matched correct_patterns, no wrong_patterns
wrong    ← matched wrong_patterns
neither  ← neither matched (off-topic / native API / refused)
```

PRR 计算只用 wrong 数。

---

## 四、数据流

### 4.1 全链路

```
pnpm benchmark --groups=baseline,teamagent --tasks=all --runs=1
   ↓
bin.ts: parseArgs() → BenchmarkConfig
   ↓
preCheck:
  - ANTHROPIC_API_KEY 存在
  - hook bundle dist/bin-*.cjs 存在（teamagent 组依赖）
  - fixtures/groups/{group}/* 存在
   ↓
task-loader.ts: loadTasks("fixtures/tasks/*.json") → Task[]
   - zod validate
   - regex compile
   - fail-fast on any error
   ↓
for group in [baseline, teamagent]:
   workdir = isolator.createGroupWorkdir(group)
     - mkdir tmp/teamagent-bench-{group}-{uuid}/
     - cp fixtures/groups/{group}/settings.local.json → workdir/.claude/
     - cp fixtures/groups/{group}/knowledge.db.* → workdir/.teamagent/knowledge.db
   for task in tasks:
     for run in 1..N:
        result = runner.runTask(task, group, sdk, workdir):
          - sdk.run(task.prompt, {cwd: workdir, settingSources: ["local"], maxTurns: 5})
          - evaluator.evaluatePatterns(output, task) → Verdict
          - return TaskResult {group, taskId, run, verdict, tokensIn, tokensOut, durationMs, output}
        push result to allResults[]
        print progress to stdout
   isolator.cleanupGroupWorkdir(workdir)
   ↓
report = reporter.aggregate(allResults, config)
reporter.writeJson("bench-report.json")
reporter.writeMarkdown("bench-report.md")
print summary
```

### 4.2 SDK 调用细节

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// in ClaudeSdkRunner.run():
const session = query({
  prompt: task.prompt,
  options: {
    cwd: workdir,
    settingSources: ["local"],
    permissionMode: "bypassPermissions",
    maxTurns: 5,
  }
});

let output = "";
let tokensIn = 0, tokensOut = 0;
const start = Date.now();
for await (const msg of session) {
  if (msg.type === "assistant") output += extractText(msg);
  if (msg.type === "result") {
    tokensIn = msg.usage.input_tokens;
    tokensOut = msg.usage.output_tokens;
  }
}
const durationMs = Date.now() - start;
```

### 4.3 串行 vs 并行（v1 全串行）

- group 之间串行（避免 SDK 状态污染）
- task 之间串行（cap LLM rate limit）
- run 之间串行

3 任务 × 2 组 × 1 run = 6 调用，约 1-3 分钟串行可接受。

### 4.4 Report 数据结构

```typescript
interface Report {
  generatedAt: string;
  config: BenchmarkConfig;
  groups: GroupSummary[];
  perTask: TaskBreakdown[];
  comparison: { prr: number; tokenDelta: number; durationDelta: number };
  rawResults: TaskResult[];
}

interface GroupSummary {
  group: string;
  wrongCount: number;
  correctCount: number;
  neitherCount: number;
  errorCount: number;
  totalTokensIn: number;
  totalTokensOut: number;
  avgDurationMs: number;
}
```

### 4.5 Markdown 报告示例

```markdown
# Benchmark Report — 2026-04-17

**Config**: 2 groups × 3 tasks × 1 run = 6 invocations
**Duration**: 47s

## Summary

| Group | Wrong | Correct | Neither | Tokens (in/out) | Avg Duration |
|---|---|---|---|---|---|
| baseline | 2 | 1 | 0 | 1.2k / 850 | 7.8s |
| teamagent | 0 | 3 | 0 | 1.4k / 920 | 8.3s |

**PRR**: 100% (2 → 0)
**Token Overhead**: +14%
**Duration Overhead**: +6%

## Per-Task Breakdown
...
```

---

## 五、错误处理

### 5.1 错误分类

| 错误来源 | 处理 |
|---|---|
| SDK 调用失败（rate limit / network） | 标 `verdict=error`，记 errorMsg，继续下一 task |
| 任务超时（> 60s） | `Promise.race` + abort，标 `verdict=error, reason=timeout` |
| AI 响应空 | 标 `verdict=neither, reason=empty_response` |
| 评测器 regex 烂 | 加载阶段预编译，fail-fast at load |
| Workdir 创建失败 | abort 整个 group，下一 group 继续 |
| Settings.json fixture 缺失 | abort with clear message at startup |
| Hook bundle 缺失（teamagent 组） | 启动前预检 `dist/bin-*.cjs`，缺则 abort |

### 5.2 退出码

```
0  全跑完，至少 1 task verdict ≠ error
1  config 错误 / fixture 缺失 / hook bundle 缺失
2  全部 task error
```

### 5.3 重试策略

**v1 不重试**。理由：
- 重试掩盖 flakiness 真实情况
- 增加 token 成本
- runs=N 维度自然平滑统计

报告显示 N error，让用户决定是否手动重跑。

### 5.4 日志

- stdout：进度（`[1/6] baseline / 001-moment-vs-dayjs ... wrong (2.3s)`）
- stderr：异常 + SDK 错误堆栈
- 报告 JSON 包含每个 task 完整 output（debug 用）
- 不写额外日志文件

---

## 六、测试策略

### 6.1 单元测试（vitest）

| 模块 | 测试覆盖 |
|---|---|
| `task-loader` | valid JSON 加载、schema 校验失败、文件缺失、regex 编译失败 fail-fast |
| `evaluator` | correct-only / wrong-only / both / neither 4 态、regex escape、case sensitivity |
| `isolator` | createWorkdir 复制 fixtures 正确、cleanup 清理彻底、cleanup 失败不 throw |
| `reporter` | aggregate 数学正确（PRR 公式、token sum）、空 results 不 crash、JSON/MD 格式稳定 |
| `runner` | 用 `FakeSdkRunner` 注入 → runTask 调用流程正确、评测衔接对、errorMsg 透传 |

### 6.2 不做单元测试

- 真实 SDK 调用 — 集成测试覆盖
- `bin.ts` CLI parser — 端到端验证

### 6.3 集成测试（手动 walking skeleton）

```bash
cd C:/bzli/teamagent
pnpm --filter @teamagent/cli build:hook  # 确保 hook bundle 在
pnpm benchmark --groups=baseline --tasks=001 --runs=1
# 退出 0、生成 report、verdict 正常
```

### 6.4 SDK 注入设计（让 runner 可测）

```typescript
export interface SdkRunner {
  run(prompt: string, options: SdkOptions): Promise<{output: string, tokensIn: number, tokensOut: number}>;
}

export class ClaudeSdkRunner implements SdkRunner { /* 真 SDK */ }
export class FakeSdkRunner implements SdkRunner { /* 测试预设 output */ }

export async function runTask(task: Task, group: GroupConfig, sdk: SdkRunner, workdir: string): Promise<TaskResult> {
  // 业务逻辑可单测
}
```

---

## 七、v1 退出标准（DoD）

**功能：**
1. ✅ `pnpm benchmark --groups=baseline,teamagent --tasks=all --runs=1` 跑通
2. ✅ 输出 `bench-report.json` + `bench-report.md`
3. ✅ baseline 组比 teamagent 组多至少 1 个 wrong（PRR > 0）— 证明 hook 真实生效
4. ✅ 全程零手动干预、零 prompt 输入

**代码质量：**
5. ✅ `packages/benchmark` 单元测试覆盖 task-loader / evaluator / isolator / reporter / runner
6. ✅ `pnpm typecheck` 零新错（pre-existing M2.6 错误不算）
7. ✅ SdkRunner 接口 + Fake 实现可注入

**集成：**
8. ✅ Hook bundle 缺失时 fail-fast 报错明确
9. ✅ Walking Skeleton 不断裂：`pnpm test` 全绿（除 pre-existing failures）

---

## 八、与既有系统集成点

| 系统 | 关系 |
|---|---|
| `@teamagent/types` | **不依赖**。benchmark 自己的类型独立 |
| `@teamagent/ports` | **不依赖**。SdkRunner 接口在 benchmark 内部 |
| `@teamagent/core` | **不依赖**。benchmark 不需 wiki/规则 pure functions |
| `@teamagent/adapters` | **薄依赖**。仅 `openDb`（建 schema v4），不复用 SqliteWikiRetriever 等业务模块 |
| `@teamagent/cli` 的 hook bundle | **复用**。teamagent group settings.local.json 直接指 `packages/cli/dist/bin-*.cjs` |
| `@anthropic-ai/claude-agent-sdk` | dev-depend |
| `vitest`, `zod` | dev-depend |

→ `packages/benchmark` 几乎独立，无 workspace 内部依赖。

---

## 九、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| `claude` CLI 未登录 / OAuth 失效 | 中 | SDK 无法启 session | 运行前 `claude --version`；预检 hook bundle 存在 |
| LLM 响应不稳定 | 高 | 单 run 数据噪声 | runs=3 取众数（v2 加）；block enforcement 比 suggest 稳得多 |
| Token 成本失控 | 低 | 订阅额度 | Haiku 默认 + 走 Claude Code 订阅（无 API key 直接计费）；单次全跑 ~6 次调用、总 token ~50k |
| Hook 冷启动慢污染 duration | 中 | duration 数据不准 | 跑前 warmup 1 个 throwaway task（v2 加）|
| Windows path/permission 怪事 | 中 | isolator 失败 | 集成测试在 Windows 上跑过；isolator 已加 EBUSY guard |
| Hook bundle 路径错（worktree vs 主 repo） | 中 | teamagent 组 hook 不生效 | `settings.template.json` 用 `{{HOOK_DIR}}` 占位符，isolator 启动时替换为当前 repo 绝对路径 + 预检 bundle 存在 |
| Hook 输出 shape 漂移（SDK 升级） | 低 | deny 静默失效 | `bin-pre-tool-use.ts` 用 `hookSpecificOutput` 包装；benchmark 自身作为回归测试 |

---

## 十、v1.1 Signal 修复复盘（2026-04-17 实现）

v1 首次运行测出 **PRR=0%** — baseline 和 teamagent 都没产生 wrong verdict，hook 生效无法证明。
根因分析揭示五层叠加问题，v1.1 逐层拆解并修复，最终 PRR=100%。

### 10.1 第一层：Haiku 基线不进陷阱

**症状**：prompt `"use a date library"` → Haiku 自选 `date-fns`，既不命 moment 也不命 dayjs → verdict=neither。

**修**：task prompt 改写为硬压特定陷阱选择（`"use moment.js, our team standard"` / `"use axios.CancelToken API"` / `"use array index as key"`）。baseline 必进坑，teamagent 的 hook 才有拦截对象。

### 10.2 第二层：评测器只扫 text block，不扫 tool_use

**症状**：即使进坑，Claude 通过 Write 工具写出的代码在 assistant `text` block 外，evaluator 看不到。

**修**：新增 `workdir-scanner.ts` — run 结束后扫 workdir 下所有 `.ts/.tsx/.js/.jsx/.mjs/.cjs`，合并到评测输入。跳过 `.teamagent/.claude/node_modules/.git/dist/build`。

### 10.3 第三层：hook 输出 shape 不符合 SDK 规范

**症状**：teamagent 侧规则匹配成功、handler 返回 `{permissionDecision: "deny"}`，但 SDK 不理睬，tool 照常执行。

**根因**：Claude Agent SDK 的 `PreToolUseHookSpecificOutput` 要求 `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, permissionDecisionReason } }` 包装。CLI 接受扁平 shape 但 SDK 不接受 — `query()` 静默忽略。

**修**：`packages/cli/src/bin-pre-tool-use.ts` 输出前包装一层 `hookSpecificOutput`。CLI 行为不变，SDK 现在正确识别 deny。

### 10.4 第四层：permissionMode="bypassPermissions" 绕过所有 hook 决定

**症状**：hook shape 修好后仍无拦截。

**根因**：SDK 文档原文："Bypass all permission checks" — 包括 hook 发的 deny。

**修**：切换到 `permissionMode: "acceptEdits"`（保留 hook deny，自动允许常规 edit）。同时在两组 `settings.template.json` 添加显式 `permissions.allow` 白名单（`Write/Edit/MultiEdit/Read/Bash/Glob/Grep`），避免 Haiku 在 `default` 模式下停滞等授权。

### 10.5 第五层：narrative 提及 wrong pattern 造成误判

**症状**：teamagent 被 hook 拦截后，assistant 在解释文本里提到 "I can't use key={index}" → evaluator 按合并文本匹配，反而判 wrong。

**修**：evaluator 优先用 workdir 源文件内容；只有在**没有文件**时回退到 assistant text。narrative 不再影响 verdict。

### 10.6 辅助修复

- CancelToken 规则 `enforcement: suggest` → `block`：`suggest` 只给 hint，Haiku 无视；`block` 才是硬 deny。
- `maxTurns: 5` → `10`：block 后 Claude 需要更多轮次来重试 + 用建议的替代。
- runner 给 prompt 追加 workdir 绝对路径 + 指令"收到 deny 请立即用建议的替代重试"，加速 pivot。

### 10.7 验证结果（2026-04-17）

| Group | 001 moment | 002 axios | 003 key | Wrong | Correct |
|---|---|---|---|---|---|
| baseline | wrong | wrong | wrong | 3 | 0 |
| teamagent | correct | correct | correct | 0 | 3 |

**PRR = (3-0)/3 = 100%**。三条规则（moment→dayjs、CancelToken→AbortController、key=index→item.id）全部生效。

---

## 十一、v1 退出标准验证

| DoD 项 | 状态 |
|---|---|
| #1 `pnpm benchmark` 跑通 | ✅ |
| #2 输出 json + md report | ✅ |
| #3 baseline 比 teamagent 多至少 1 wrong（PRR > 0） | ✅ PRR=100% |
| #4 零手动干预 | ✅ |
| #5 单元测试覆盖 5 模块（+ workdir-scanner）| ✅ 47/47 tests pass |
| #6 typecheck 零新错 | ✅ |
| #7 SdkRunner Port + Fake 可注入 | ✅ |
| #8 hook bundle 缺失 fail-fast | ✅ |
| #9 Walking Skeleton 不断裂 | ✅ |

---

## 十二、关键新发现（供未来 milestone 参考）

1. **hook 输出 shape 规范**：任何新增 hook entry 必须用 `hookSpecificOutput` 包装，否则 SDK 路径静默失效。应加 lint 或契约测试防回归。
2. **permissionMode 选择**：benchmark/agent 场景用 `acceptEdits`，不要用 `bypassPermissions`（会绕过 hook 决定）。
3. **评测器分层**：narrative vs. file — file 是真相，text 是解说。未来 LLM judge 评测器也应优先看 artifact。
4. **Haiku 遵循力**：block enforcement 比 suggest 强数倍；benchmark 种子规则应用 block。
5. **workdir 绝对路径**：SDK query() 下 Haiku 常幻觉已创建文件；prompt 里明示绝对路径可降噪。

---

## 十三、v1 后的演进路径（不变）

```
v1 + v1.1: 基础设施 + 2 组 + 3 任务 + PRR signal 验证  ← ✅ 已完成
       ↓
v1.5: 累加 task 到 ~10 个，跑出第一份"半正式"报告（dogfood 数据）
       ↓
v2: 加 LLM judge + Auto-Memory 组 — 第一个跨系统对比
       ↓
v3: 加 Codacy + 任务到 30+ — 触发 Phase 2 退出标准评测（PRR ≥ max(other) + 10pp）
       ↓
v4: 并行 + 统计显著性 — 生产级 benchmark
```
