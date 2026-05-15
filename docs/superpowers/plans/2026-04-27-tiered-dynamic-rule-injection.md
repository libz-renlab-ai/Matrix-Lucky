# Tiered Dynamic Rule Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static CLAUDE.md rule dump with confidence-weighted per-turn semantic retrieval; refresh meta-principle set to 8 universal rules.

**Architecture:** Four-tier context budget — CLAUDE.md (preset-only), UserPromptSubmit Tier-1 (session-once tech-stack retrieval), UserPromptSubmit Tier-2 (per-turn prompt retrieval), PreToolUse (unchanged).

**Tech Stack:** TypeScript, Vitest, node:sqlite, `@teamagent/core`, `@teamagent/adapters`, XenovaRuleEmbedder, SqliteSemanticRetriever

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/core/src/init/meta-principles.ts` | Replace 6 presets with 8-preset set |
| Modify | `packages/core/src/compiler/markdown.ts` | Add `presetOnly` option |
| Modify | `packages/core/src/index.ts` | Export `rerankByConfidence` |
| Create | `packages/core/src/ranking/confidence-rank.ts` | Confidence-weighted re-ranking |
| Create | `packages/core/src/ranking/__tests__/confidence-rank.test.ts` | Unit tests |
| Create | `packages/cli/src/session-rule-injected.ts` | Session dedup tracker |
| Create | `packages/cli/src/__tests__/session-rule-injected.test.ts` | Unit tests |
| Create | `packages/cli/src/user-prompt-rule-retriever.ts` | Tier-1/2 retrieval + formatting |
| Create | `packages/cli/src/__tests__/user-prompt-rule-retriever.test.ts` | Unit tests |
| Modify | `packages/cli/src/bin-user-prompt-submit.ts` | Wire rule retriever |
| Modify | `packages/core/src/compiler/__tests__/markdown.test.ts` | Add presetOnly test cases |

---

## Task 1: Update Meta-Principles (8-Preset Set)

**Files:**
- Modify: `packages/core/src/init/meta-principles.ts`

- [ ] **Step 1.1: Write failing test**

File: create `packages/core/src/init/__tests__/meta-principles.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { getMetaPrinciples } from "../meta-principles.js";

describe("getMetaPrinciples", () => {
  it("returns exactly 8 entries", () => {
    const now = () => new Date("2026-04-27T00:00:00Z");
    const principles = getMetaPrinciples(now);
    expect(principles).toHaveLength(8);
  });

  it("contains the 4 retained presets", () => {
    const principles = getMetaPrinciples();
    const ids = principles.map((p) => p.id);
    expect(ids).toContain("preset-tdd-cycle");
    expect(ids).toContain("preset-small-commits");
    expect(ids).toContain("preset-prefer-edit-over-create");
    expect(ids).toContain("preset-search-web-before-trusting-memory");
  });

  it("contains the 4 new presets", () => {
    const principles = getMetaPrinciples();
    const ids = principles.map((p) => p.id);
    expect(ids).toContain("preset-audience-adaptive");
    expect(ids).toContain("preset-execute-not-analyze");
    expect(ids).toContain("preset-read-before-asserting");
    expect(ids).toContain("preset-full-pipeline-for-complex");
  });

  it("does NOT contain removed presets", () => {
    const principles = getMetaPrinciples();
    const ids = principles.map((p) => p.id);
    expect(ids).not.toContain("preset-pitfall-cli");
    expect(ids).not.toContain("preset-prefer-gstack-tooling");
  });

  it("all entries have source=preset and status=active", () => {
    const principles = getMetaPrinciples();
    for (const p of principles) {
      expect(p.source).toBe("preset");
      expect(p.status).toBe("active");
    }
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd C:/bzli/teamagent && pnpm test packages/core/src/init/__tests__/meta-principles.test.ts
```

Expected: FAIL — length mismatch, missing IDs.

- [ ] **Step 1.3: Update meta-principles.ts**

Replace the entire `getMetaPrinciples` function body in `packages/core/src/init/meta-principles.ts`. Keep the existing `makePreset` and `makeCanonicalPreset` helpers unchanged.

Replace the `return [...]` array to be exactly:

```typescript
return [
  // ── 保留 ──
  makePreset({
    id: "preset-tdd-cycle",
    category: "S",
    tags: ["tdd", "workflow"],
    trigger: "开始实现一个新功能或修 bug 时",
    correct: "先写失败测试（红）→ 写最小实现（绿）→ 重构（如需）→ commit；验证产出（跑测试、手动验证）后再声明完成",
    reason: "TDD 让接口设计先行；未经验证直接声明完成是常见错误，实际输出与预期可能偏差",
    created,
  }),
  makePreset({
    id: "preset-small-commits",
    category: "S",
    tags: ["git", "workflow"],
    trigger: "准备 git commit 时",
    correct: "一个 commit 只做一件概念上完整的事，tests 要过；commit message 说清'做了什么+为什么'",
    reason: "小 commit 让 review 容易、回滚粒度细、git bisect 有意义；批量提交会让 bug 定位变噩梦",
    created,
  }),
  makePreset({
    id: "preset-prefer-edit-over-create",
    category: "S",
    tags: ["scope", "workflow"],
    trigger: "准备新建一个文件完成某任务时",
    correct: "先确认项目里有没有已有文件能承载该改动；优先编辑现有文件，只在真的需要时才新建",
    reason: "不必要的新文件会让 reviewer 分心、让 import 关系复杂；大多数小改动应该在现有模块里完成",
    created,
  }),
  makeCanonicalPreset({
    id: "preset-search-web-before-trusting-memory",
    category: "K",
    tags: ["epistemics", "web-search", "groundedness"],
    trigger: "用户提到一个你没见过或不完全确定的概念、库名、API、术语时",
    correct: "不要凭记忆作答；优先用 WebSearch/WebFetch 或 mcp 搜索工具验证，再结合当前代码上下文作答",
    reason: "模型记忆会过时或臆造（幻觉）；用户用到的新概念常在训练数据截止之后出现。先搜索再作答可避免给出错误事实、误导用户",
    created,
  }),
  // ── 新增 ──
  makePreset({
    id: "preset-audience-adaptive",
    category: "K",
    tags: ["communication", "explanation"],
    trigger: "向用户讲解技术系统、方案、分析结果或操作流程时",
    correct: "先判断受众层级：非技术受众给功能骨架（做什么/为什么）不给实现细节；技术受众给机制层；所有受众都先结论后细节，从简到繁",
    reason: "技术细节会淹没非技术受众；过度简化会浪费技术受众时间；先匹配受众心智模型再调整深度，是最高效的讲解路径",
    created,
  }),
  makePreset({
    id: "preset-execute-not-analyze",
    category: "S",
    tags: ["execution", "workflow"],
    trigger: "收到明确的执行类任务（修 bug、实现功能、多步工作流、批量处理）时",
    correct: "执行完整序列到底，不要在分析/汇报阶段停下等待确认；只在遇到不可逆操作（删库、force push）或真正无法解决的歧义时才暂停",
    reason: "用户期望 AI 主动推进工作；频繁停下'先报告''先对齐'会割裂上下文、降低效率；完整执行再报结果是更好的节奏",
    created,
  }),
  makePreset({
    id: "preset-read-before-asserting",
    category: "K",
    tags: ["groundedness", "file-access"],
    trigger: "即将断言某文件/功能/模块不存在，或声称「计划文档还没实现」「这个路径没有内容」时",
    correct: "先用 Read 工具读取用户指向的路径，以实际文件内容为准，再基于真实内容推进；不要凭印象或对话历史断言存在性",
    reason: "AI 断言文件不存在但用户已指向具体路径是常见错误；实际文件可能已经存在或已实现，凭印象断言会误导用户并浪费调试时间",
    created,
  }),
  makePreset({
    id: "preset-full-pipeline-for-complex",
    category: "S",
    tags: ["workflow", "architecture", "planning"],
    trigger: "面对多组件、多阶段的复杂新功能或系统改造时",
    correct: "调研 → brainstorm+需求确认 → 设计文档 → 实现计划 → 执行；不得跳过前期设计直接写代码",
    reason: "跳过前期设计直接实现会导致架构返工；完整流水线确保需求对齐后再拆任务，执行时边界清晰、减少反复",
    created,
  }),
];
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
cd C:/bzli/teamagent && pnpm test packages/core/src/init/__tests__/meta-principles.test.ts
```

Expected: PASS (all 5 assertions green).

- [ ] **Step 1.5: Commit**

```bash
cd C:/bzli/teamagent && git add packages/core/src/init/meta-principles.ts packages/core/src/init/__tests__/meta-principles.test.ts
git commit -m "feat(m5): update meta-principles to 8-preset set — add 4 universal rules, demote 2 tool-specific"
```

---

## Task 2: Add `presetOnly` Option to `compileMarkdownBlock`

**Files:**
- Modify: `packages/core/src/compiler/markdown.ts`
- Modify: `packages/core/src/compiler/__tests__/markdown.test.ts`

- [ ] **Step 2.1: Write failing test**

Add the following test block to `packages/core/src/compiler/__tests__/markdown.test.ts`:

```typescript
describe("compileMarkdownBlock — presetOnly", () => {
  const NOW = "2026-01-01T00:00:00Z";

  function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
    return {
      id: "e1",
      scope: { level: "personal" },
      category: "S",
      tags: [],
      type: "practice",
      nature: "subjective",
      trigger: "some trigger",
      wrong_pattern: "",
      correct_pattern: "do the right thing",
      reasoning: "because",
      confidence: 0.8,
      enforcement: "suggest",
      status: "active",
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
      created_at: NOW,
      last_hit_at: "",
      last_validated_at: NOW,
      source: "user",
      conflict_with: [],
      current_tier: "experimental" as const,
      max_tier_ever: "experimental" as const,
      tier_entered_at: "",
      demerit: 0,
      demerit_last_updated: "",
      resurrect_count: 0,
      channel: "passive-knowledge",
      ...overrides,
    };
  }

  it("with presetOnly=true, only includes source=preset entries", () => {
    const entries = [
      makeEntry({ id: "user-rule", source: "user", correct_pattern: "user rule" }),
      makeEntry({ id: "preset-rule", source: "preset", correct_pattern: "preset rule" }),
    ];
    const block = compileMarkdownBlock(entries, NOW, { presetOnly: true });
    expect(block).toContain("preset rule");
    expect(block).not.toContain("user rule");
  });

  it("with presetOnly=true, header says TeamAgent 元原则", () => {
    const entries = [makeEntry({ source: "preset" })];
    const block = compileMarkdownBlock(entries, NOW, { presetOnly: true });
    expect(block).toContain("## TeamAgent 元原则");
  });

  it("without presetOnly, includes all active entries (existing behavior)", () => {
    const entries = [
      makeEntry({ id: "user-rule", source: "user", correct_pattern: "user rule" }),
      makeEntry({ id: "preset-rule", source: "preset", correct_pattern: "preset rule" }),
    ];
    const block = compileMarkdownBlock(entries, NOW);
    expect(block).toContain("user rule");
    expect(block).toContain("preset rule");
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd C:/bzli/teamagent && pnpm test packages/core/src/compiler/__tests__/markdown.test.ts
```

Expected: FAIL — `presetOnly` option not recognized.

- [ ] **Step 2.3: Add `presetOnly` to `CompileMarkdownOptions` and `compileMarkdownBlock`**

In `packages/core/src/compiler/markdown.ts`:

1. Add to `CompileMarkdownOptions` interface (after `diversityThreshold`):

```typescript
/**
 * 只编译 source='preset' 的条目（元原则模式）。
 * 启用时 header 改为"TeamAgent 元原则"，忽略 limit/tokenBudget/tierFilter。
 */
presetOnly?: boolean;
```

2. In `compileMarkdownBlock`, add the presetOnly path immediately after `const active = entries.filter(...)`:

```typescript
// presetOnly: only include preset entries, render as 元原则 block
if (options.presetOnly) {
  const presets = entries.filter((e) => e.source === "preset" && e.status === "active");
  if (presets.length === 0) {
    return [BLOCK_START, "## TeamAgent 元原则", "（无元原则）", BLOCK_END].join("\n");
  }
  const lines = presets.map((e) => formatEntry(e));
  return [BLOCK_START, "## TeamAgent 元原则", ...lines, BLOCK_END].join("\n");
}
```

This goes right after:
```typescript
const active = entries.filter((e) => e.status === "active");
```

- [ ] **Step 2.4: Run test to verify it passes**

```bash
cd C:/bzli/teamagent && pnpm test packages/core/src/compiler/__tests__/markdown.test.ts
```

Expected: all tests PASS including the 3 new ones.

- [ ] **Step 2.5: Wire `presetOnly: true` in the compile command**

In `packages/cli/src/commands/compile.ts`, find where `MarkdownCompiler` is instantiated:

```typescript
const markdownCompiler = opts.skillsOnly
  ? makeNoopMarkdownCompiler()
  : new MarkdownCompiler(paths.claudeMdPath);
```

`MarkdownCompiler` constructor accepts an optional `compileOptions`. Pass `presetOnly: true`:

```typescript
const markdownCompiler = opts.skillsOnly
  ? makeNoopMarkdownCompiler()
  : new MarkdownCompiler(paths.claudeMdPath, { compileOptions: { presetOnly: true } });
```

Check the `MarkdownCompiler` constructor signature in `packages/adapters/src/compiler/markdown-compiler.ts` — it accepts `{ compileOptions?: CompileMarkdownOptions }`. Pass as second argument object accordingly.

- [ ] **Step 2.6: Run full compile test**

```bash
cd C:/bzli/teamagent && pnpm test packages/cli/src/__tests__/compile.test.ts
```

Expected: PASS. If any test snapshot expects the old header "TeamAgent 经验", update it to "TeamAgent 元原则".

- [ ] **Step 2.7: Commit**

```bash
cd C:/bzli/teamagent && git add packages/core/src/compiler/markdown.ts packages/core/src/compiler/__tests__/markdown.test.ts packages/cli/src/commands/compile.ts
git commit -m "feat(m5): compile CLAUDE.md as preset-only meta-principles block"
```

---

## Task 3: Confidence Re-Ranking Utility

**Files:**
- Create: `packages/core/src/ranking/confidence-rank.ts`
- Create: `packages/core/src/ranking/__tests__/confidence-rank.test.ts`
- Modify: `packages/core/src/index.ts` (add export)

- [ ] **Step 3.1: Write failing test**

Create `packages/core/src/ranking/__tests__/confidence-rank.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { rerankByConfidence, confidenceWeight } from "../confidence-rank.js";
import type { KnowledgeEntry } from "@teamagent/types";
import type { SemanticMatch } from "../../matcher/semantic-matcher.js";

function makeRule(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "r1",
    scope: { level: "global" },
    category: "S",
    tags: [],
    type: "practice",
    nature: "subjective",
    trigger: "t",
    wrong_pattern: "",
    correct_pattern: "c",
    reasoning: "r",
    confidence: 0.8,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-01-01T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-01-01T00:00:00Z",
    source: "user",
    conflict_with: [],
    current_tier: "canonical",
    max_tier_ever: "canonical",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "passive-knowledge",
    ...overrides,
  } as KnowledgeEntry;
}

function makeMatch(rule: KnowledgeEntry, score: number): SemanticMatch {
  return { rule, score, triggerSim: score, patternSim: score, hardNegSim: 0 };
}

describe("confidenceWeight", () => {
  it("archived → 0", () => {
    expect(confidenceWeight(makeRule({ status: "archived" }))).toBe(0);
  });

  it("experimental × 0.5", () => {
    const w = confidenceWeight(makeRule({ current_tier: "experimental", confidence: 0.8 }));
    expect(w).toBeCloseTo(0.4);
  });

  it("probation × 0.7", () => {
    const w = confidenceWeight(makeRule({ current_tier: "probation", confidence: 0.8 }));
    expect(w).toBeCloseTo(0.56);
  });

  it("canonical × 1.0", () => {
    const w = confidenceWeight(makeRule({ current_tier: "canonical", confidence: 0.9 }));
    expect(w).toBeCloseTo(0.9);
  });
});

describe("rerankByConfidence", () => {
  it("higher-confidence rule ranks above lower-confidence with same score", () => {
    const low = makeMatch(makeRule({ id: "low", confidence: 0.5, current_tier: "canonical" }), 0.8);
    const high = makeMatch(makeRule({ id: "high", confidence: 0.95, current_tier: "canonical" }), 0.8);
    const [first] = rerankByConfidence([low, high]);
    expect(first?.rule.id).toBe("high");
  });

  it("archived rule is moved to end (adjusted score 0)", () => {
    const archived = makeMatch(makeRule({ id: "arch", status: "archived", confidence: 0.99 }), 0.9);
    const active = makeMatch(makeRule({ id: "active", confidence: 0.5, current_tier: "canonical" }), 0.6);
    const [first, second] = rerankByConfidence([archived, active]);
    expect(first?.rule.id).toBe("active");
    expect(second?.rule.id).toBe("arch");
  });

  it("returns new array with adjusted scores, does not mutate input", () => {
    const match = makeMatch(makeRule({ confidence: 0.8, current_tier: "canonical" }), 0.9);
    const original = match.score;
    const result = rerankByConfidence([match]);
    expect(match.score).toBe(original); // not mutated
    expect(result[0]?.score).not.toBe(original); // adjusted
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
cd C:/bzli/teamagent && pnpm test packages/core/src/ranking/__tests__/confidence-rank.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3.3: Create `packages/core/src/ranking/confidence-rank.ts`**

```typescript
import type { KnowledgeEntry } from "@teamagent/types";
import type { SemanticMatch } from "../matcher/semantic-matcher.js";

const TIER_FACTOR: Record<string, number> = {
  canonical: 1.0,
  enforced: 1.0,
  full: 1.0,
  stable: 0.9,
  probation: 0.7,
  experimental: 0.5,
};

/**
 * Returns a weight in [0, 1] that scales a semantic score by rule health.
 * Archived rules return 0 so they never surface in dynamic injection.
 */
export function confidenceWeight(rule: KnowledgeEntry): number {
  if (rule.status === "archived") return 0;
  const tier = TIER_FACTOR[rule.current_tier] ?? 0.6;
  return rule.confidence * tier;
}

/**
 * Re-ranks SemanticMatch results by adjustedScore = score × confidenceWeight.
 * Does not mutate input array or match objects.
 */
export function rerankByConfidence(matches: SemanticMatch[]): SemanticMatch[] {
  return matches
    .map((m) => ({ ...m, score: m.score * confidenceWeight(m.rule) }))
    .sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 3.4: Run test to verify it passes**

```bash
cd C:/bzli/teamagent && pnpm test packages/core/src/ranking/__tests__/confidence-rank.test.ts
```

Expected: PASS (all 7 assertions green).

- [ ] **Step 3.5: Export from `packages/core/src/index.ts`**

Add to `packages/core/src/index.ts`:

```typescript
export { rerankByConfidence, confidenceWeight } from "./ranking/confidence-rank.js";
```

- [ ] **Step 3.6: Run full core tests**

```bash
cd C:/bzli/teamagent && pnpm test packages/core
```

Expected: PASS.

- [ ] **Step 3.7: Commit**

```bash
cd C:/bzli/teamagent && git add packages/core/src/ranking/ packages/core/src/index.ts
git commit -m "feat(m5): add confidence-weighted re-ranking for semantic matches"
```

---

## Task 4: Session-Injected Rule Tracker

**Files:**
- Create: `packages/cli/src/session-rule-injected.ts`
- Create: `packages/cli/src/__tests__/session-rule-injected.test.ts`

- [ ] **Step 4.1: Write failing test**

Create `packages/cli/src/__tests__/session-rule-injected.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  readSessionInjected,
  appendSessionInjected,
  isFirstPrompt,
} from "../session-rule-injected.js";

const TMP = path.join(os.tmpdir(), `ta-test-session-${Date.now()}`);

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("readSessionInjected", () => {
  it("returns empty set when file does not exist", () => {
    const result = readSessionInjected(TMP, "sess-1");
    expect(result.size).toBe(0);
  });
});

describe("isFirstPrompt", () => {
  it("returns true when no session file exists", () => {
    expect(isFirstPrompt(TMP, "sess-new")).toBe(true);
  });

  it("returns false after appendSessionInjected has been called", () => {
    appendSessionInjected(TMP, "sess-1", ["r1"]);
    expect(isFirstPrompt(TMP, "sess-1")).toBe(false);
  });
});

describe("appendSessionInjected", () => {
  it("creates file and stores ids on first append", () => {
    appendSessionInjected(TMP, "sess-1", ["r1", "r2"]);
    const result = readSessionInjected(TMP, "sess-1");
    expect(result.has("r1")).toBe(true);
    expect(result.has("r2")).toBe(true);
  });

  it("accumulates across multiple appends", () => {
    appendSessionInjected(TMP, "sess-1", ["r1"]);
    appendSessionInjected(TMP, "sess-1", ["r2", "r3"]);
    const result = readSessionInjected(TMP, "sess-1");
    expect(result.size).toBe(3);
    expect(result.has("r1")).toBe(true);
    expect(result.has("r3")).toBe(true);
  });

  it("does not duplicate ids", () => {
    appendSessionInjected(TMP, "sess-1", ["r1"]);
    appendSessionInjected(TMP, "sess-1", ["r1", "r2"]);
    const result = readSessionInjected(TMP, "sess-1");
    expect(result.size).toBe(2);
  });

  it("is a no-op when ids array is empty", () => {
    appendSessionInjected(TMP, "sess-1", []);
    expect(isFirstPrompt(TMP, "sess-1")).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
cd C:/bzli/teamagent && pnpm test packages/cli/src/__tests__/session-rule-injected.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4.3: Create `packages/cli/src/session-rule-injected.ts`**

```typescript
/**
 * Per-session injected rule ID tracker.
 *
 * Prevents the same rule from being re-injected every turn.
 * File: ~/.teamagent/sessions/{sessionId}_session_injected.json
 *       Stored as a JSON array of rule ID strings.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

function filePath(sessionsDir: string, sessionId: string): string {
  return path.join(sessionsDir, `${sessionId}_session_injected.json`);
}

/** Returns the set of rule IDs already injected this session. */
export function readSessionInjected(sessionsDir: string, sessionId: string): Set<string> {
  const fp = filePath(sessionsDir, sessionId);
  if (!existsSync(fp)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(fp, "utf-8"));
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

/**
 * Returns true when no session_injected file exists yet (= first prompt of session).
 * Tier-1 tech-stack injection should only happen on first prompt.
 */
export function isFirstPrompt(sessionsDir: string, sessionId: string): boolean {
  return !existsSync(filePath(sessionsDir, sessionId));
}

/**
 * Appends new rule IDs to the session tracker. Creates the file if needed.
 * No-op when ids is empty (avoids creating a file that would mark session as non-first).
 */
export function appendSessionInjected(
  sessionsDir: string,
  sessionId: string,
  ids: string[],
): void {
  if (ids.length === 0) return;
  const fp = filePath(sessionsDir, sessionId);
  const existing = readSessionInjected(sessionsDir, sessionId);
  for (const id of ids) existing.add(id);
  try {
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(fp, JSON.stringify([...existing]));
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 4.4: Run test to verify it passes**

```bash
cd C:/bzli/teamagent && pnpm test packages/cli/src/__tests__/session-rule-injected.test.ts
```

Expected: PASS (all 7 assertions green).

- [ ] **Step 4.5: Commit**

```bash
cd C:/bzli/teamagent && git add packages/cli/src/session-rule-injected.ts packages/cli/src/__tests__/session-rule-injected.test.ts
git commit -m "feat(m5): add session-injected rule tracker for per-turn dedup"
```

---

## Task 5: UserPromptSubmit Rule Retriever

**Files:**
- Create: `packages/cli/src/user-prompt-rule-retriever.ts`
- Create: `packages/cli/src/__tests__/user-prompt-rule-retriever.test.ts`
- Modify: `packages/cli/src/bin-user-prompt-submit.ts`

- [ ] **Step 5.1: Write failing test**

Create `packages/cli/src/__tests__/user-prompt-rule-retriever.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { formatRuleInjection, buildTechStackText } from "../user-prompt-rule-retriever.js";
import type { KnowledgeEntry } from "@teamagent/types";

function makeRule(id: string, trigger: string, correct: string, conf = 0.9): KnowledgeEntry {
  return {
    id,
    scope: { level: "global" },
    category: "S",
    tags: [],
    type: "practice",
    nature: "subjective",
    trigger,
    wrong_pattern: "",
    correct_pattern: correct,
    reasoning: "test",
    confidence: conf,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-01-01T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-01-01T00:00:00Z",
    source: "user",
    conflict_with: [],
    current_tier: "canonical",
    max_tier_ever: "canonical",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "passive-knowledge",
  } as KnowledgeEntry;
}

describe("formatRuleInjection", () => {
  it("returns empty string for empty rules array", () => {
    expect(formatRuleInjection([], "T2")).toBe("");
  });

  it("includes header and each rule's trigger + correct_pattern", () => {
    const rules = [
      makeRule("r1", "开始实现功能时", "先写测试"),
      makeRule("r2", "提交代码时", "一次一件事"),
    ];
    const text = formatRuleInjection(rules, "T2");
    expect(text).toContain("TeamAgent");
    expect(text).toContain("先写测试");
    expect(text).toContain("一次一件事");
  });

  it("marks Tier-1 and Tier-2 differently in header", () => {
    const rules = [makeRule("r1", "t", "c")];
    expect(formatRuleInjection(rules, "T1")).toContain("T1");
    expect(formatRuleInjection(rules, "T2")).toContain("T2");
  });
});

describe("buildTechStackText", () => {
  it("returns a non-empty string given a cwd", () => {
    const text = buildTechStackText(process.cwd());
    expect(typeof text).toBe("string");
    // At minimum returns a fallback string
    expect(text.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
cd C:/bzli/teamagent && pnpm test packages/cli/src/__tests__/user-prompt-rule-retriever.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5.3: Create `packages/cli/src/user-prompt-rule-retriever.ts`**

```typescript
/**
 * Tier-1 / Tier-2 rule retrieval for UserPromptSubmit hook.
 *
 * Tier-1 (first prompt of session): embed tech-stack text → top-3 confidence-reranked rules
 * Tier-2 (every prompt): embed user message → top-3 confidence-reranked rules, dedup against session
 */
import fs from "node:fs";
import path from "node:path";
import type { KnowledgeEntry } from "@teamagent/types";
import { detectStack } from "@teamagent/core";
import { rerankByConfidence } from "@teamagent/core";
import {
  XenovaRuleEmbedder,
  SqliteSemanticRetriever,
  openDb,
} from "@teamagent/adapters";
import { semanticMatch } from "@teamagent/core";

const TOP_K = 3;
const MIN_SCORE = 0.35;

export interface RetrieveRulesArgs {
  userMessage: string;
  cwd: string;
  projectDbPath: string;
  globalDbPath: string;
  sessionSeenIds: Set<string>;
  isFirstPrompt: boolean;
  embedder?: XenovaRuleEmbedder;
}

export interface RuleRetrievalResult {
  tier1Rules: KnowledgeEntry[];
  tier2Rules: KnowledgeEntry[];
  injectionText: string;
  allInjectedIds: string[];
}

/**
 * Builds a short text describing the project's tech stack for embedding.
 * Falls back to "software project" if detection yields nothing.
 */
export function buildTechStackText(cwd: string): string {
  const presence = {
    exists: (rel: string) => {
      try { return fs.existsSync(path.join(cwd, rel)); } catch { return false; }
    },
    read: (rel: string) => {
      try { return fs.readFileSync(path.join(cwd, rel), "utf-8"); } catch { return undefined; }
    },
  };
  try {
    const stack = detectStack(presence);
    const parts = [
      ...stack.languages,
      ...stack.frameworks,
      ...stack.packageManagers,
      ...stack.testRunners,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "software project";
  } catch {
    return "software project";
  }
}

/**
 * Formats an array of KnowledgeEntry rules into an injection text block.
 */
export function formatRuleInjection(rules: KnowledgeEntry[], tier: "T1" | "T2"): string {
  if (rules.length === 0) return "";
  const lines = [
    `◈ TeamAgent 相关经验（语义检索 ${tier}）`,
  ];
  for (const r of rules) {
    const conf = r.confidence.toFixed(2);
    lines.push(`- [${r.trigger.slice(0, 50)}] → ${r.correct_pattern.slice(0, 80)} (conf ${conf})`);
  }
  return lines.join("\n");
}

async function queryRules(
  text: string,
  embedder: XenovaRuleEmbedder,
  projectDbPath: string,
  globalDbPath: string,
  excludeIds: Set<string>,
): Promise<KnowledgeEntry[]> {
  const dbs: ReturnType<typeof openDb>[] = [];
  const hits: import("@teamagent/core").SemanticMatch[] = [];

  try {
    for (const dbPath of [projectDbPath, globalDbPath]) {
      if (!fs.existsSync(dbPath)) continue;
      const db = openDb(dbPath);
      dbs.push(db);
      const retriever = new SqliteSemanticRetriever(db);
      const matches = await semanticMatch({
        contextText: text,
        actionText: text,
        embedder,
        retriever,
        scope: { level: "global" },
        topK: TOP_K * 3,
      });
      hits.push(...matches);
    }
  } finally {
    for (const db of dbs) { try { db.close(); } catch { /* ok */ } }
  }

  const reranked = rerankByConfidence(hits);
  const seen = new Set<string>();
  const result: KnowledgeEntry[] = [];
  for (const m of reranked) {
    if (m.score < MIN_SCORE) continue;
    if (excludeIds.has(m.rule.id)) continue;
    if (seen.has(m.rule.id)) continue;
    seen.add(m.rule.id);
    result.push(m.rule);
    if (result.length >= TOP_K) break;
  }
  return result;
}

export async function retrieveRulesForPrompt(
  args: RetrieveRulesArgs,
): Promise<RuleRetrievalResult> {
  const embedder = args.embedder ?? new XenovaRuleEmbedder();
  const allSeen = new Set(args.sessionSeenIds);

  let tier1Rules: KnowledgeEntry[] = [];
  if (args.isFirstPrompt) {
    const techText = buildTechStackText(args.cwd);
    tier1Rules = await queryRules(techText, embedder, args.projectDbPath, args.globalDbPath, allSeen);
    for (const r of tier1Rules) allSeen.add(r.id);
  }

  const tier2Rules = await queryRules(
    args.userMessage,
    embedder,
    args.projectDbPath,
    args.globalDbPath,
    allSeen,
  );

  const blocks: string[] = [];
  const t1text = formatRuleInjection(tier1Rules, "T1");
  if (t1text) blocks.push(t1text);
  const t2text = formatRuleInjection(tier2Rules, "T2");
  if (t2text) blocks.push(t2text);

  const allInjectedIds = [
    ...tier1Rules.map((r) => r.id),
    ...tier2Rules.map((r) => r.id),
  ];

  return {
    tier1Rules,
    tier2Rules,
    injectionText: blocks.join("\n\n"),
    allInjectedIds,
  };
}
```

- [ ] **Step 5.4: Run test to verify it passes**

```bash
cd C:/bzli/teamagent && pnpm test packages/cli/src/__tests__/user-prompt-rule-retriever.test.ts
```

Expected: PASS.

- [ ] **Step 5.5: Wire into `bin-user-prompt-submit.ts`**

In `packages/cli/src/bin-user-prompt-submit.ts`, add the following imports at the top (after existing imports):

```typescript
import os from "node:os";
import {
  retrieveRulesForPrompt,
} from "./user-prompt-rule-retriever.js";
import {
  isFirstPrompt,
  appendSessionInjected,
  readSessionInjected,
} from "./session-rule-injected.js";
```

Then in the `main()` function, after the existing M4-A injection block (after the `try { ... } catch { ... }` block that handles pending warnings), add a new try-catch block:

```typescript
  // Rule semantic retrieval (Tier-1 / Tier-2)
  try {
    const sessionId = input.session_id ?? "";
    if (sessionId && prompt) {
      const sessionsDir = path.join(os.homedir(), ".teamagent", "sessions");
      const globalDbPath = path.join(os.homedir(), ".teamagent", "global.db");
      const firstPrompt = isFirstPrompt(sessionsDir, sessionId);
      const seenIds = readSessionInjected(sessionsDir, sessionId);

      const result = await Promise.race([
        retrieveRulesForPrompt({
          userMessage: prompt,
          cwd,
          projectDbPath: dbPath,
          globalDbPath,
          sessionSeenIds: seenIds,
          isFirstPrompt: firstPrompt,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), HOOK_TIMEOUT_MS)),
      ]);

      if (result && result.injectionText) {
        blocks.push(result.injectionText);
        appendSessionInjected(sessionsDir, sessionId, result.allInjectedIds);
      }
    }
  } catch {
    // rule retrieval is best-effort — never block user input
  }
```

This block goes after the existing M4-A try-catch but before the wiki injection (`const result = await Promise.race([runPipeline(...), ...])`).

- [ ] **Step 5.6: Run full CLI tests**

```bash
cd C:/bzli/teamagent && pnpm test packages/cli
```

Expected: PASS. Any failures likely from import errors — fix imports as needed.

- [ ] **Step 5.7: Typecheck**

```bash
cd C:/bzli/teamagent && pnpm typecheck
```

Expected: no errors. Fix any type issues in `user-prompt-rule-retriever.ts` (e.g., `SemanticMatch` import path).

- [ ] **Step 5.8: Commit**

```bash
cd C:/bzli/teamagent && git add packages/cli/src/user-prompt-rule-retriever.ts packages/cli/src/__tests__/user-prompt-rule-retriever.test.ts packages/cli/src/bin-user-prompt-submit.ts packages/cli/src/session-rule-injected.ts packages/cli/src/__tests__/session-rule-injected.test.ts
git commit -m "feat(m5): wire Tier-1/2 semantic rule retrieval into UserPromptSubmit hook"
```

---

## Task 6: Full Integration Verify

**Files:** no changes — verify only

- [ ] **Step 6.1: Run all tests**

```bash
cd C:/bzli/teamagent && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 6.2: Typecheck all packages**

```bash
cd C:/bzli/teamagent && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6.3: Manual smoke test — compile**

```bash
cd C:/bzli/teamagent && pnpm teamagent compile --dry-run
```

Expected: output mentions "TeamAgent 元原则" and lists only preset rules (8 lines, not 28+).

- [ ] **Step 6.4: Manual smoke test — skeleton-demo**

```bash
cd C:/bzli/teamagent && pnpm teamagent skeleton-demo
```

Expected: runs without error.

- [ ] **Step 6.5: Final commit**

```bash
cd C:/bzli/teamagent && git add .
git commit -m "feat(m5): finalize tiered dynamic rule injection + meta-principles v2"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|------------|------|
| 8-preset meta-principles | Task 1 |
| CLAUDE.md → presetOnly output | Task 2 |
| Confidence-weighted re-ranking | Task 3 |
| Session dedup tracker | Task 4 |
| Tier-1 tech-stack retrieval (first prompt) | Task 5 |
| Tier-2 per-prompt semantic retrieval | Task 5 |
| Wire into UserPromptSubmit | Task 5 |
| Integration verify | Task 6 |

**Placeholder scan:** No TBDs, all code blocks contain actual implementation.

**Type consistency:** `SemanticMatch` used from `@teamagent/core` export path — verify the exact import in Task 3/5 since it's currently in `packages/core/src/matcher/semantic-matcher.ts`. If it's not re-exported from `packages/core/src/index.ts`, add the export in Task 3.5.
