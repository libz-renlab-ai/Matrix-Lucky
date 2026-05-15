# PreToolUse 语义检索 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PreToolUse hook 能通过语义向量检索命中规则，而不是只靠关键词匹配；核心做法是：录入规则时用 Haiku 异步生成"工具操作视角"描述并入库，PreToolUse 查询时把工具 JSON 翻译成自然语言摘要再做向量搜索。

**Architecture:** 新增独立的 `tool_context_description` 字段和 `knowledge_tool_vec` 向量表（V7 迁移），与现有 `trigger_description` / `knowledge_trigger_vec`（UserPromptSubmit 用）完全分离。PreToolUse 侧新增 `buildToolActionSummary` 纯函数把工具调用翻译成自然语言，再用新的 `SqliteToolRetriever` 查 `knowledge_tool_vec`。pitfall 录入时异步调用 Haiku 生成 `tool_context_description` 并同步向量，不阻塞用户。

**Tech Stack:** Node.js + TypeScript + vitest + sqlite-vec + XenovaRuleEmbedder（multilingual-e5-small）+ ClaudeCodeLLMClient（haiku）

---

## 文件变更清单

| 文件 | 变更类型 | 职责 |
|------|---------|------|
| `packages/adapters/src/storage/sqlite/schema.ts` | 修改 | V7 迁移：新增 `tool_context_description` 列 + `knowledge_tool_vec` vec0 表 |
| `packages/adapters/src/storage/sqlite/vec-sync.ts` | 修改 | 新增 `syncToolVector(db, id, vec)` |
| `packages/adapters/src/retriever/sqlite-tool-retriever.ts` | 新建 | 查 `knowledge_tool_vec`，实现 `SemanticRetriever` 接口 |
| `packages/adapters/src/index.ts` | 修改 | 导出 `SqliteToolRetriever` |
| `packages/cli/src/pre-tool-use-context.ts` | 新建 | 纯函数 `buildToolActionSummary(toolName, toolInput)` |
| `packages/cli/src/commands/pitfall.ts` | 修改 | 异步触发 Haiku 生成 `tool_context_description` + 向量同步 |
| `packages/cli/src/commands/migrate-v7.ts` | 新建 | 给存量规则批量生成 `tool_context_description` |
| `packages/cli/src/bin.ts` | 修改 | 注册 `migrate-v7` 命令 |
| `packages/cli/src/bin-pre-tool-use.ts` | 修改 | 使用 `buildToolActionSummary` + `SqliteToolRetriever` 做语义检索 |
| `packages/cli/src/__tests__/pre-tool-use-context.test.ts` | 新建 | `buildToolActionSummary` 单元测试 |
| `packages/adapters/src/retriever/__tests__/sqlite-tool-retriever.test.ts` | 新建 | `SqliteToolRetriever` 集成测试 |

---

## Task 1: V7 Schema 迁移 — 新增 `tool_context_description` 列和 `knowledge_tool_vec` 表

**Files:**
- Modify: `packages/adapters/src/storage/sqlite/schema.ts`

- [ ] **Step 1: 在 `schema.ts` 里加 V7 迁移常量**

在 `CURRENT_SCHEMA_VERSION = 6` 所在行附近（约 159 行），做如下修改：

```typescript
// 把这行
export const CURRENT_SCHEMA_VERSION = 6;

// 改为
export const CURRENT_SCHEMA_VERSION = 7;

// 在 applyV6Migration 函数之后（约 229 行）新增：
const V7_ALTER_COLUMNS = [
  "tool_context_description TEXT DEFAULT ''",
];

function applyV7Migration(db: DatabaseSync): void {
  const existing = new Set(
    (db.prepare("PRAGMA table_info(knowledge)").all() as Array<{ name: string }>)
      .map((c) => c.name),
  );
  for (const colDef of V7_ALTER_COLUMNS) {
    const colName = colDef.split(/\s+/)[0];
    if (!colName) continue;
    if (!existing.has(colName)) {
      db.exec(`ALTER TABLE knowledge ADD COLUMN ${colDef}`);
    }
  }
  if (_sqliteVecLoad) {
    try {
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_tool_vec USING vec0(
        id TEXT PRIMARY KEY,
        vec FLOAT[384]
      )`);
    } catch { /* vec0 not available */ }
  }
}
```

- [ ] **Step 2: 在 `openDb` 里调用 `applyV7Migration`**

在 `openDb` 函数体内找到 `applyV6Migration(db)` 的调用位置（约 304 和 309 行），在每处调用之后各加一行：

```typescript
applyV6Migration(db);
applyV7Migration(db);   // ← 新增
```

（schema.ts 里有两处 applyV6Migration 调用，都要跟上 applyV7Migration）

- [ ] **Step 3: 跑全量测试确认无破坏**

```bash
pnpm test
```

期望：全部通过，无新失败。

- [ ] **Step 4: commit**

```bash
git add packages/adapters/src/storage/sqlite/schema.ts
git commit -m "feat(m6): V7 schema — add tool_context_description column + knowledge_tool_vec table"
```

---

## Task 2: `syncToolVector` — 写入工具向量表

**Files:**
- Modify: `packages/adapters/src/storage/sqlite/vec-sync.ts`

- [ ] **Step 1: 在 vec-sync.ts 末尾新增函数**

打开 `packages/adapters/src/storage/sqlite/vec-sync.ts`，在文件末尾 `deleteRuleVectors` 函数之后追加：

```typescript
/** 把规则的 tool_context 向量写到 knowledge_tool_vec 虚表。幂等。 */
export function syncToolVector(
  db: DatabaseSync,
  ruleId: string,
  vec: Float32Array,
): void {
  db.prepare("DELETE FROM knowledge_tool_vec WHERE id = ?").run(ruleId);
  db.prepare(
    "INSERT INTO knowledge_tool_vec(id, vec) VALUES (?, ?)",
  ).run(ruleId, new Uint8Array(vec.buffer));
}
```

- [ ] **Step 2: 从 adapters index.ts 导出新函数**

打开 `packages/adapters/src/index.ts`，找到 `syncRuleVectors` 的导出行，在同行或紧邻位置加：

```typescript
export { syncRuleVectors, syncToolVector, deleteRuleVectors } from "./storage/sqlite/vec-sync.js";
```

（如果原来是分开导出的，只需在已有的行里补上 `syncToolVector`）

- [ ] **Step 3: 跑测试**

```bash
pnpm test packages/adapters/src/storage/sqlite/__tests__/vec-sync.test.ts
```

期望：通过（暂无新测试，只验证编译和现有测试不破坏）。

- [ ] **Step 4: commit**

```bash
git add packages/adapters/src/storage/sqlite/vec-sync.ts packages/adapters/src/index.ts
git commit -m "feat(m6): add syncToolVector for knowledge_tool_vec"
```

---

## Task 3: `buildToolActionSummary` — 工具调用→自然语言纯函数

**Files:**
- Create: `packages/cli/src/pre-tool-use-context.ts`
- Create: `packages/cli/src/__tests__/pre-tool-use-context.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `packages/cli/src/__tests__/pre-tool-use-context.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { buildToolActionSummary } from "../pre-tool-use-context.js";

describe("buildToolActionSummary", () => {
  it("Bash: extracts command text", () => {
    const s = buildToolActionSummary("Bash", { command: "git push --force origin main" });
    expect(s).toContain("git push --force origin main");
    expect(s).not.toBe("");
  });

  it("Edit: includes file path and content snippet", () => {
    const s = buildToolActionSummary("Edit", {
      file_path: "src/auth.ts",
      old_string: "old",
      new_string: "const hash = bcrypt.hash(password)",
    });
    expect(s).toContain("auth.ts");
    expect(s).toContain("bcrypt");
  });

  it("Write: includes file path and content snippet", () => {
    const s = buildToolActionSummary("Write", {
      file_path: "migration.sql",
      content: "DROP TABLE users;",
    });
    expect(s).toContain("migration.sql");
    expect(s).toContain("DROP TABLE");
  });

  it("Read: includes file path", () => {
    const s = buildToolActionSummary("Read", { file_path: "CLAUDE.md" });
    expect(s).toContain("CLAUDE.md");
  });

  it("Grep: includes pattern", () => {
    const s = buildToolActionSummary("Grep", { pattern: "dangerously-skip" });
    expect(s).toContain("dangerously-skip");
  });

  it("unknown tool: falls back to tool name + json snippet", () => {
    const s = buildToolActionSummary("UnknownTool", { foo: "bar" });
    expect(s).toContain("UnknownTool");
  });

  it("Bash: very long command is truncated to 200 chars", () => {
    const longCmd = "a".repeat(300);
    const s = buildToolActionSummary("Bash", { command: longCmd });
    expect(s.length).toBeLessThan(300);
  });
});
```

- [ ] **Step 2: 运行确认红**

```bash
pnpm test packages/cli/src/__tests__/pre-tool-use-context.test.ts
```

期望：全部 FAIL（函数不存在）。

- [ ] **Step 3: 实现 `buildToolActionSummary`**

新建 `packages/cli/src/pre-tool-use-context.ts`：

```typescript
/**
 * 将工具调用 (toolName + toolInput) 转换为自然语言摘要，用于 PreToolUse 语义检索。
 * 纯函数，无 IO，无副作用。
 */
export function buildToolActionSummary(toolName: string, toolInput: unknown): string {
  const inp = (
    typeof toolInput === "object" && toolInput !== null ? toolInput : {}
  ) as Record<string, unknown>;

  if (toolName === "Bash") {
    const cmd = String(inp["command"] ?? "").trim();
    if (!cmd) return "执行终端命令";
    return `执行终端命令: ${cmd.slice(0, 200)}`;
  }

  if (toolName === "Edit") {
    const fp = String(inp["file_path"] ?? "");
    const content = String(inp["new_string"] ?? "").slice(0, 120);
    return `编辑文件 ${fp}: ${content}`;
  }

  if (toolName === "Write") {
    const fp = String(inp["file_path"] ?? "");
    const content = String(inp["content"] ?? "").slice(0, 120);
    return `写入文件 ${fp}: ${content}`;
  }

  if (toolName === "Read") {
    const fp = String(inp["file_path"] ?? "");
    return `读取文件 ${fp}`;
  }

  if (toolName === "Grep") {
    const pattern = String(inp["pattern"] ?? "");
    const path = String(inp["path"] ?? "");
    return `在 ${path || "项目"} 中搜索 ${pattern}`;
  }

  if (toolName === "Glob") {
    const pattern = String(inp["pattern"] ?? "");
    return `查找文件 ${pattern}`;
  }

  // 通用兜底
  return `${toolName}: ${JSON.stringify(toolInput).slice(0, 200)}`;
}
```

- [ ] **Step 4: 运行确认绿**

```bash
pnpm test packages/cli/src/__tests__/pre-tool-use-context.test.ts
```

期望：全部 PASS。

- [ ] **Step 5: commit**

```bash
git add packages/cli/src/pre-tool-use-context.ts packages/cli/src/__tests__/pre-tool-use-context.test.ts
git commit -m "feat(m6): add buildToolActionSummary — convert tool call to NL for semantic search"
```

---

## Task 4: `SqliteToolRetriever` — 查询 `knowledge_tool_vec`

**Files:**
- Create: `packages/adapters/src/retriever/sqlite-tool-retriever.ts`
- Create: `packages/adapters/src/retriever/__tests__/sqlite-tool-retriever.test.ts`
- Modify: `packages/adapters/src/index.ts`

- [ ] **Step 1: 写失败测试**

新建 `packages/adapters/src/retriever/__tests__/sqlite-tool-retriever.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, syncToolVector } from "../../index.js";
import { SqliteToolRetriever } from "../sqlite-tool-retriever.js";

// 确定性 stub embedder
const stubEmbed = (text: string): Float32Array => {
  const v = new Array(384).fill(0.5);
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h * 31 + text.charCodeAt(i)) & 0xffff);
  v[h % 384] += 0.5;
  const n = Math.sqrt(v.reduce((s: number, x: number) => s + x * x, 0));
  return new Float32Array(v.map((x: number) => x / n));
};

function mkRule(id: string) {
  return {
    id,
    scope: { level: "personal" as const },
    category: "E" as const,
    tags: [],
    type: "avoidance" as const,
    nature: "objective" as const,
    trigger: "test trigger",
    wrong_pattern: "bad",
    correct_pattern: "good",
    reasoning: "",
    confidence: 0.9,
    enforcement: "warn" as const,
    status: "active" as const,
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: new Date().toISOString(),
    last_hit_at: "",
    last_validated_at: new Date().toISOString(),
    source: "accumulated" as const,
    conflict_with: [],
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    fire_threshold: 0.1,
    threshold_alpha: 1.0,
    threshold_beta: 1.0,
    embedder_model_id: "stub",
    trigger_description: "",
    pattern_description: "",
    tool_context_description: "在终端执行 git push --force 命令",
  };
}

describe("SqliteToolRetriever", () => {
  it("finds rule whose tool_context_description matches query vec", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-ret-"));
    try {
      const db = openDb(join(dir, "t.db"));

      // 插入规则
      const rule = mkRule("rule-1");
      db.prepare(`
        INSERT INTO knowledge (
          id, scope_level, category, tags, type, nature,
          trigger, wrong_pattern, correct_pattern, reasoning,
          confidence, enforcement, status, hit_count, success_count,
          override_count, evidence, source, conflict_with,
          created_at, last_hit_at, last_validated_at,
          current_tier, max_tier_ever, tier_entered_at,
          demerit, demerit_last_updated, resurrect_count,
          fire_threshold, threshold_alpha, threshold_beta,
          embedder_model_id, trigger_description, pattern_description,
          tool_context_description
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        rule.id, rule.scope.level, rule.category, JSON.stringify(rule.tags),
        rule.type, rule.nature, rule.trigger, rule.wrong_pattern, rule.correct_pattern,
        rule.reasoning, rule.confidence, rule.enforcement, rule.status,
        rule.hit_count, rule.success_count, rule.override_count,
        JSON.stringify(rule.evidence), rule.source, JSON.stringify(rule.conflict_with),
        rule.created_at, rule.last_hit_at, rule.last_validated_at,
        rule.current_tier, rule.max_tier_ever, rule.tier_entered_at,
        rule.demerit, rule.demerit_last_updated, rule.resurrect_count,
        rule.fire_threshold, rule.threshold_alpha, rule.threshold_beta,
        rule.embedder_model_id, rule.trigger_description, rule.pattern_description,
        rule.tool_context_description,
      );

      // 同步工具向量（用 tool_context_description 的 embedding）
      const toolVec = stubEmbed(rule.tool_context_description);
      syncToolVector(db, rule.id, toolVec);

      const retriever = new SqliteToolRetriever(db);
      // 用同文本的向量查，余弦相似度 = 1.0
      const queryVec = stubEmbed(rule.tool_context_description);
      const candidates = await retriever.retrieve({
        contextText: rule.tool_context_description,
        actionText: rule.tool_context_description,
        contextVec: queryVec,
        actionVec: queryVec,
        scope: { level: "personal" },
      });

      expect(candidates.length).toBeGreaterThanOrEqual(1);
      expect(candidates.map(c => c.rule.id)).toContain("rule-1");
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scope filter: personal query does not return global rules", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-ret-scope-"));
    try {
      const db = openDb(join(dir, "t.db"));
      const rule = mkRule("global-rule");
      const globalRule = { ...rule, scope: { level: "global" as const } };
      db.prepare(`
        INSERT INTO knowledge (
          id, scope_level, category, tags, type, nature,
          trigger, wrong_pattern, correct_pattern, reasoning,
          confidence, enforcement, status, hit_count, success_count,
          override_count, evidence, source, conflict_with,
          created_at, last_hit_at, last_validated_at,
          current_tier, max_tier_ever, tier_entered_at,
          demerit, demerit_last_updated, resurrect_count,
          fire_threshold, threshold_alpha, threshold_beta,
          embedder_model_id, trigger_description, pattern_description,
          tool_context_description
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        globalRule.id, "global", globalRule.category, JSON.stringify(globalRule.tags),
        globalRule.type, globalRule.nature, globalRule.trigger, globalRule.wrong_pattern,
        globalRule.correct_pattern, globalRule.reasoning, globalRule.confidence,
        globalRule.enforcement, globalRule.status, globalRule.hit_count,
        globalRule.success_count, globalRule.override_count,
        JSON.stringify(globalRule.evidence), globalRule.source,
        JSON.stringify(globalRule.conflict_with), globalRule.created_at,
        globalRule.last_hit_at, globalRule.last_validated_at,
        globalRule.current_tier, globalRule.max_tier_ever, globalRule.tier_entered_at,
        globalRule.demerit, globalRule.demerit_last_updated, globalRule.resurrect_count,
        globalRule.fire_threshold, globalRule.threshold_alpha, globalRule.threshold_beta,
        globalRule.embedder_model_id, globalRule.trigger_description,
        globalRule.pattern_description, globalRule.tool_context_description,
      );
      const vec = stubEmbed(globalRule.tool_context_description);
      syncToolVector(db, globalRule.id, vec);

      const retriever = new SqliteToolRetriever(db);
      const results = await retriever.retrieve({
        contextText: "git push --force",
        actionText: "git push --force",
        contextVec: vec,
        actionVec: vec,
        scope: { level: "personal" },  // personal query should not see global rule
      });

      expect(results.map(c => c.rule.id)).not.toContain("global-rule");
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: 运行确认红**

```bash
pnpm test packages/adapters/src/retriever/__tests__/sqlite-tool-retriever.test.ts
```

期望：FAIL（`SqliteToolRetriever` 不存在）。

- [ ] **Step 3: 实现 `SqliteToolRetriever`**

新建 `packages/adapters/src/retriever/sqlite-tool-retriever.ts`：

```typescript
import { createRequire } from "node:module";
import type { SemanticRetriever, SemanticCandidate } from "@teamagent/ports";
import { deserializeRow, type KnowledgeRow } from "../storage/sqlite/sqlite-knowledge-store.js";

const require = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = require("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSyncCtor>;

const DEFAULT_TOP_K = 20;
const RRF_K = 60;

/**
 * 专供 PreToolUse 使用的语义检索器：只查 knowledge_tool_vec。
 * 用 actionVec（buildToolActionSummary 的 embedding）做 kNN 搜索。
 */
export class SqliteToolRetriever implements SemanticRetriever {
  constructor(private readonly db: DatabaseSync) {}

  async retrieve(args: {
    contextText: string;
    actionText: string;
    contextVec: Float32Array;
    actionVec: Float32Array;
    scope: { level: "personal" | "team" | "global"; project?: string };
    topK?: number;
  }): Promise<SemanticCandidate[]> {
    const topK = args.topK ?? DEFAULT_TOP_K;
    const scores = new Map<string, { rrf: number; toolSim: number }>();

    // kNN on knowledge_tool_vec using actionVec
    try {
      const rows = this.db
        .prepare(
          `SELECT id, distance
           FROM knowledge_tool_vec
           WHERE vec MATCH ?
           ORDER BY distance
           LIMIT ?`,
        )
        .all(new Uint8Array(args.actionVec.buffer), topK) as Array<{
        id: string;
        distance: number;
      }>;
      rows.forEach((r, i) => {
        const sim = 1 - r.distance;
        scores.set(r.id, {
          rrf: 1 / (RRF_K + i + 1),
          toolSim: sim,
        });
      });
    } catch {
      /* knowledge_tool_vec not available */
    }

    if (scores.size === 0) return [];

    // Fetch full rows + scope filter
    const ids = [...scores.keys()];
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT * FROM knowledge
         WHERE id IN (${placeholders})
           AND status = 'active'
           AND scope_level = ?`,
      )
      .all(...ids, args.scope.level) as unknown as KnowledgeRow[];

    return rows
      .map((r) => {
        const s = scores.get(r.id)!;
        const sim = s.toolSim;
        return {
          rule: deserializeRow(r),
          bm25Score: -1,
          triggerSim: sim,   // 用 toolSim 填充，供 scoreSoftAnd 计算
          patternSim: sim,   // 同上
          rrfScore: s.rrf,
        };
      })
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, topK);
  }
}
```

- [ ] **Step 4: 导出 `SqliteToolRetriever`**

在 `packages/adapters/src/index.ts` 找到 `SqliteSemanticRetriever` 的导出行，在同行或相邻位置加：

```typescript
export { SqliteSemanticRetriever } from "./retriever/sqlite-semantic-retriever.js";
export { SqliteToolRetriever } from "./retriever/sqlite-tool-retriever.js";
```

- [ ] **Step 5: 运行确认绿**

```bash
pnpm test packages/adapters/src/retriever/__tests__/sqlite-tool-retriever.test.ts
```

期望：全部 PASS。

- [ ] **Step 6: 跑全量确认无回归**

```bash
pnpm test
```

- [ ] **Step 7: commit**

```bash
git add packages/adapters/src/retriever/sqlite-tool-retriever.ts \
        packages/adapters/src/retriever/__tests__/sqlite-tool-retriever.test.ts \
        packages/adapters/src/index.ts
git commit -m "feat(m6): add SqliteToolRetriever — kNN search on knowledge_tool_vec"
```

---

## Task 5: PreToolUse hook — 接入语义工具检索

**Files:**
- Modify: `packages/cli/src/bin-pre-tool-use.ts`

- [ ] **Step 1: 修改 `bin-pre-tool-use.ts`**

找到 `bin-pre-tool-use.ts` 顶部的 import 块，新增两行：

```typescript
import { SqliteToolRetriever } from "@teamagent/adapters";
import { buildToolActionSummary } from "./pre-tool-use-context.js";
```

找到语义路径里 `actionText` 的赋值（约 87 行）：

```typescript
// 原来：
const actionText = `tool=${tool_name}\n${JSON.stringify(tool_input).slice(0, 500)}`;
const contextText = actionText;

// 改为：
const actionText = buildToolActionSummary(tool_name, tool_input);
const contextText = actionText;
```

找到 `semanticMatch` 的三个并发调用（约 102 行），在三个调用之后、`mergeSemanticAndLegacyMatches` 之前，新增工具检索路径：

```typescript
// 现有三个 semanticMatch 调用（personal/team/global）之后...
let toolResults: import("@teamagent/core").SemanticMatch[] = [];
try {
  const toolProjectDb = openDb(projectDbPath);
  const toolGlobalDb = openDb(globalDbPath);
  const toolProjectRetriever = new SqliteToolRetriever(toolProjectDb);
  const toolGlobalRetriever = new SqliteToolRetriever(toolGlobalDb);
  try {
    const [tpRes, tgRes] = await Promise.all([
      semanticMatch({
        contextText,
        actionText,
        embedder,
        retriever: toolProjectRetriever,
        scope: { level: "personal" },
      }),
      semanticMatch({
        contextText,
        actionText,
        embedder,
        retriever: toolGlobalRetriever,
        scope: { level: "global" },
      }),
    ]);
    toolResults = [...tpRes, ...tgRes];
  } finally {
    try { toolProjectDb.close(); } catch { /* ok */ }
    try { toolGlobalDb.close(); } catch { /* ok */ }
  }
} catch { /* tool retrieval best-effort */ }

const allSemanticMatches = [
  ...projectPersonalResults,
  ...projectTeamResults,
  ...globalResults,
  ...toolResults,   // ← 加入工具检索结果
];
```

（注意：`allSemanticMatches` 这个变量名是之前的 bug fix 已经用上的，只需在合并时加上 `...toolResults`）

- [ ] **Step 2: 跑全量测试确认无回归**

```bash
pnpm test
```

期望：全部通过。

- [ ] **Step 3: 用 hook 验证（需要向量入库后才有命中）**

```bash
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push --force origin main"},"cwd":"C:/bzli/teamagent","tool_use_id":"test-001"}' \
  | TEAMAGENT_VISIBILITY=verbose npx tsx packages/cli/src/bin-pre-tool-use.ts 2>/dev/null \
  | node --input-type=module -e "
import { createInterface } from 'node:readline';
let raw = '';
createInterface({input:process.stdin}).on('line',l=>raw+=l).on('close',()=>{
  const o = JSON.parse(raw);
  console.log(o.systemMessage ?? o.hookSpecificOutput?.permissionDecisionReason ?? '(empty)');
});"
```

此时仍然可能"无命中"，因为 `tool_context_description` 还没写入。Task 6 完成后才会有命中。

- [ ] **Step 4: commit**

```bash
git add packages/cli/src/bin-pre-tool-use.ts
git commit -m "feat(m6): PreToolUse uses buildToolActionSummary + SqliteToolRetriever for semantic search"
```

---

## Task 6: pitfall 录入时异步生成 `tool_context_description`

**Files:**
- Modify: `packages/cli/src/commands/pitfall.ts`

- [ ] **Step 1: 在 `pitfall.ts` 里新增异步生成函数**

在 `pitfall.ts` 顶部 import 块追加：

```typescript
import { syncToolVector } from "@teamagent/adapters";
```

在文件末尾（`PitfallValidationError` class 之前）新增私有函数：

```typescript
/** 生成工具操作视角描述的 LLM prompt */
function buildToolContextPrompt(entry: KnowledgeEntry): string {
  return [
    "你是代码质量规则分析助手。给定一条编程规则，描述当 AI 使用工具时，什么样的具体工具操作（Bash命令、文件编辑等）会触发这条规则。",
    "",
    "规则信息：",
    `- 触发场景: ${entry.trigger}`,
    `- 错误做法: ${entry.wrong_pattern || "(无)"}`,
    `- 正确做法: ${entry.correct_pattern}`,
    `- 原因: ${entry.reasoning}`,
    "",
    "用1-2句话描述：AI 会执行什么样的具体工具操作（如 Bash 命令、写入什么文件、编辑什么代码）才会触发这条规则？",
    "只描述工具操作，不要说场景或原因。直接输出描述，不加引号。",
  ].join("\n");
}

/**
 * 异步生成 tool_context_description 并同步向量。
 * 不阻塞 pitfall 主流程，fire-and-forget。
 */
async function generateToolContextAsync(
  entry: KnowledgeEntry,
  projectDbPath: string,
): Promise<void> {
  const { ClaudeCodeLLMClient, XenovaRuleEmbedder, openDb } = await import("@teamagent/adapters");
  const llm = new ClaudeCodeLLMClient({ model: "haiku" });
  const desc = await llm.complete(buildToolContextPrompt(entry));
  if (!desc || desc.trim().length < 5) return;

  const embedder = new XenovaRuleEmbedder();
  const [vec] = await embedder.embed([desc.trim()]);
  if (!vec) return;

  const db = openDb(projectDbPath);
  try {
    db.prepare(
      "UPDATE knowledge SET tool_context_description = ? WHERE id = ?",
    ).run(desc.trim(), entry.id);
    syncToolVector(db, entry.id, new Float32Array(vec));
  } finally {
    db.close();
  }
}
```

- [ ] **Step 2: 在 `executePitfall` 末尾触发异步生成**

找到 `executePitfall` 里现有的向量同步块（包裹在 `try/catch` 的那段），在其之后、`return renderer.render(...)` 之前加一行：

```typescript
// 异步生成 tool_context_description（不阻塞，2-3 秒后后台写入）
generateToolContextAsync(entry, paths.projectDbPath).catch(() => {/* best-effort */});
```

- [ ] **Step 3: 写测试（验证 pitfall 录入后 tool_context_description 可被注入）**

在 `packages/cli/src/__tests__/pitfall.test.ts` 的 "自动向量同步" describe 块中追加：

```typescript
it("异步生成不阻塞 pitfall：返回后 tool_context_description 可能为空（异步）", async () => {
  // 这个测试只验证 pitfall 本身不会因为 generateToolContextAsync 抛出而崩溃
  // tool_context_description 的最终内容依赖异步 LLM，这里不断言其值
  await expect(
    executePitfall(
      { trigger: "git push --force 到主分支", wrong: "--force", correct: "PR 流程", reason: "保护主分支历史" },
      { cwd: tmp.cwd, homeDir: tmp.home, now: () => fixedNow, env: {}, embedder: stubEmbedder },
    ),
  ).resolves.not.toThrow();
});
```

- [ ] **Step 4: 跑测试确认绿**

```bash
pnpm test packages/cli/src/__tests__/pitfall.test.ts
```

- [ ] **Step 5: 手动验证（等 2-3 秒）**

```bash
# 录入一条规则
pnpm teamagent pitfall --non-interactive \
  --trigger="在 Bash 中执行 git push --force 时" \
  --wrong="--force" \
  --correct="先 PR 后 merge" \
  --reason="保护主分支"

# 等几秒后查看是否写入
sleep 5
node --input-type=module << 'EOF'
import { createRequire } from 'node:module';
const r = createRequire(import.meta.url);
const { DatabaseSync } = r('node:sqlite');
const db = new DatabaseSync('C:/bzli/teamagent/.teamagent/knowledge.db');
const rows = db.prepare("SELECT id, tool_context_description FROM knowledge ORDER BY created_at DESC LIMIT 1").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
EOF
```

期望：最新规则的 `tool_context_description` 非空。

- [ ] **Step 6: commit**

```bash
git add packages/cli/src/commands/pitfall.ts
git commit -m "feat(m6): pitfall async-generates tool_context_description via Haiku + syncs to knowledge_tool_vec"
```

---

## Task 7: `migrate-v7` — 给存量规则批量补充 `tool_context_description`

**Files:**
- Create: `packages/cli/src/commands/migrate-v7.ts`
- Modify: `packages/cli/src/bin.ts`

- [ ] **Step 1: 新建 `migrate-v7.ts`**

新建 `packages/cli/src/commands/migrate-v7.ts`：

```typescript
import path from "node:path";
import os from "node:os";
import { openDb, syncToolVector, XenovaRuleEmbedder } from "@teamagent/adapters";
import type { LLMClient } from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";

function buildToolContextPrompt(entry: { trigger: string; wrong_pattern: string; correct_pattern: string; reasoning: string }): string {
  return [
    "你是代码质量规则分析助手。给定一条编程规则，描述当 AI 使用工具时，什么样的具体工具操作（Bash命令、文件编辑等）会触发这条规则。",
    "",
    "规则信息：",
    `- 触发场景: ${entry.trigger}`,
    `- 错误做法: ${entry.wrong_pattern || "(无)"}`,
    `- 正确做法: ${entry.correct_pattern}`,
    `- 原因: ${entry.reasoning}`,
    "",
    "用1-2句话描述：AI 会执行什么样的具体工具操作（如 Bash 命令、写入什么文件、编辑什么代码）才会触发这条规则？",
    "只描述工具操作，不要说场景或原因。直接输出描述，不加引号。",
  ].join("\n");
}

export async function executeMigrateV7(opts: {
  dryRun: boolean;
  dbPath?: string;
  limit?: number;
  llmClient?: LLMClient;
  cwd?: string;
}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const dbPath = opts.dbPath ?? path.join(cwd, ".teamagent", "knowledge.db");
  const db = openDb(dbPath);

  const rows = db.prepare(`
    SELECT id, trigger, wrong_pattern, correct_pattern, reasoning
    FROM knowledge
    WHERE status != 'archived'
      AND (tool_context_description IS NULL OR tool_context_description = '')
    ${opts.limit ? `LIMIT ${opts.limit}` : ""}
  `).all() as Array<{ id: string; trigger: string; wrong_pattern: string; correct_pattern: string; reasoning: string }>;

  process.stdout.write(`Migrating ${rows.length} rules (dryRun=${opts.dryRun})...\n`);

  if (rows.length === 0) { db.close(); return; }

  const { ClaudeCodeLLMClient } = await import("@teamagent/adapters");
  const llm = opts.llmClient ?? new ClaudeCodeLLMClient({ model: "haiku" });
  const embedder = new XenovaRuleEmbedder();
  let migrated = 0;

  for (const row of rows) {
    try {
      const desc = await llm.complete(buildToolContextPrompt(row));
      if (!desc || desc.trim().length < 5) continue;

      if (opts.dryRun) {
        process.stdout.write(`[dry] ${row.id}: ${desc.trim().slice(0, 60)}\n`);
        migrated++;
        continue;
      }

      const [vec] = await embedder.embed([desc.trim()]);
      if (!vec) continue;

      db.prepare("UPDATE knowledge SET tool_context_description = ? WHERE id = ?")
        .run(desc.trim(), row.id);
      syncToolVector(db, row.id, new Float32Array(vec));
      migrated++;
      process.stdout.write(`\r  已迁移 ${migrated}/${rows.length}`);
    } catch {
      /* 单条失败继续 */
    }
  }

  process.stdout.write(`\nmigrated=${migrated} skipped=${rows.length - migrated}\n`);
  db.close();
}
```

- [ ] **Step 2: 在 `bin.ts` 注册 `migrate-v7` 命令**

打开 `packages/cli/src/bin.ts`，找到 `case "migrate-v6":` 的 case 块，在其后面加：

```typescript
case "migrate-v7": {
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : undefined;
  const dbArg = args.find((a) => a.startsWith("--db="));
  const dbPath = dbArg ? dbArg.split("=")[1] : undefined;
  const { executeMigrateV7 } = await import("./commands/migrate-v7.js");
  await executeMigrateV7({ dryRun, dbPath, limit, cwd: normalizeCwd(process.cwd()) });
  break;
}
```

- [ ] **Step 3: 跑全量测试**

```bash
pnpm test
```

期望：全部通过。

- [ ] **Step 4: 给存量规则跑迁移**

```bash
# 先干跑看会生成什么
pnpm teamagent migrate-v7 --dry-run --limit=3

# 确认输出合理后正式跑
pnpm teamagent migrate-v7
```

- [ ] **Step 5: 验证 PreToolUse 现在能命中规则**

```bash
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push --force origin main"},"cwd":"C:/bzli/teamagent","tool_use_id":"verify-001"}' \
  | TEAMAGENT_VISIBILITY=verbose npx tsx packages/cli/src/bin-pre-tool-use.ts 2>/dev/null \
  | node --input-type=module -e "
import { createInterface } from 'node:readline';
let raw = '';
createInterface({input:process.stdin}).on('line',l=>raw+=l).on('close',()=>{
  const o = JSON.parse(raw);
  console.log(o.systemMessage ?? o.hookSpecificOutput?.permissionDecisionReason ?? '(empty)');
});"
```

期望输出包含规则名或"语义命中 N 条"。

- [ ] **Step 6: commit**

```bash
git add packages/cli/src/commands/migrate-v7.ts packages/cli/src/bin.ts
git commit -m "feat(m6): add migrate-v7 command — batch-generate tool_context_description for existing rules"
```

---

## 自检

**Spec 覆盖：**
- ✅ PreToolUse 语义检索：Task 5 接入 `SqliteToolRetriever`
- ✅ 工具调用翻译为自然语言：Task 3 `buildToolActionSummary`
- ✅ 新 DB 字段 + 向量表：Task 1 V7 迁移
- ✅ pitfall 录入时异步生成：Task 6
- ✅ 存量规则迁移：Task 7
- ✅ UserPromptSubmit 通道不变：没有碰 `user-prompt-rule-retriever.ts`

**Placeholder 检查：** 无 TBD/TODO。每步均有代码。

**类型一致性：**
- `syncToolVector` 在 Task 2 定义，Task 4/6/7 使用 — 签名一致 `(db, ruleId, vec: Float32Array)`
- `SqliteToolRetriever` 在 Task 4 定义，Task 5 使用 — import 路径一致
- `buildToolContextPrompt` 在 Task 6 和 Task 7 各自本地定义（相同实现），避免跨包引用复杂度
