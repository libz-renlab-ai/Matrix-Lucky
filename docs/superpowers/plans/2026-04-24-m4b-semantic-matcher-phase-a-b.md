# M4-B 语义匹配引擎 — Phase A+B 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 BM25 + 密集向量 RRF 融合 + soft-AND 打分替换现有 substring matcher，让 297 条规则（含 140 条 passive-knowledge）都能参与运行时匹配；固定阈值版本上线（Phase C 的 Thompson/CONFLARE 自适应另起一份 plan）。

**Architecture:** 复用现有 `@xenova/transformers` + `sqlite-vec` 依赖栈。新增 `RuleEmbedder` port，独立于 `WikiEmbedderPort`。Schema v6 加 `trigger_vec` / `pattern_vec` BLOB 列 + FTS5 虚表 + vec0 虚表。匹配流水线：BM25 取 top-20 ∪ 密集 kNN 取 top-20 → RRF 融合 → soft-AND 打分 → 最高分 > 阈值即触发。旧 substring matcher 移到 `legacy/` 通过 env `TEAMAGENT_MATCHER=legacy` 可切回。

**Tech Stack:** TypeScript + pnpm workspace + vitest + `@xenova/transformers` 2.17 + `sqlite-vec` 0.1.6 + Node 22 内置 `node:sqlite`

**父 spec:** [`2026-04-24-m4b-semantic-matcher-design.md`](../specs/2026-04-24-m4b-semantic-matcher-design.md)

**Phase 关系:**
- 本 plan = Phase A + Phase B（matcher 替换 + 基建 + 存量迁移）
- Phase C 另起 plan（Thompson + CONFLARE + AutoManual 校准器重写）
- Phase D 在 Phase A+B 线上稳定 ≥4 周后触发（清理 legacy 代码）

---

## Phase A — 基础设施、schema v6、存量规则迁移

### Task A0: 延迟基线 spike（Phase A 第一件事，spec §10.1 要求）

**目标**: 在本机实测 Xenova MiniLM / multilingual-e5-small embedding 的 p50/p99 延迟；决定 embedding 模型最终选型；若实测 >100ms 触发降级路径。

**Files:**
- Create: `scripts/bench-embedding-latency.ts`
- Create: `scripts/out/embedding-latency-report.md`

- [ ] **Step 1: 写 bench 脚本**

`scripts/bench-embedding-latency.ts`:
```typescript
import { pipeline } from "@xenova/transformers";

const MODELS = [
  "Xenova/all-MiniLM-L6-v2",         // 现有 wiki embedder 用的，英文 only
  "Xenova/multilingual-e5-small",    // 多语言 baseline
  "Xenova/bge-m3",                    // 可选高端
];

const SAMPLES = [
  "Bash command: rm -rf node_modules",
  "在 packages/core/ 目录下的代码里需要复用 adapter 层的逻辑",
  "需要发起 HTTP 请求",
  "Write tool, file_path=/tmp/test.md, content='# Hello\\n\\nWorld'",
  "Edit tool 在 packages/adapters/src/storage/sqlite/schema.ts 改 INIT_SQL",
];

async function bench(modelId: string): Promise<{ p50: number; p99: number }> {
  const extractor = await pipeline("feature-extraction", modelId);
  // warm up
  for (let i = 0; i < 3; i++) await extractor(SAMPLES[0], { pooling: "mean", normalize: true });
  const latencies: number[] = [];
  for (let i = 0; i < 20; i++) {
    for (const s of SAMPLES) {
      const t0 = performance.now();
      await extractor(s, { pooling: "mean", normalize: true });
      latencies.push(performance.now() - t0);
    }
  }
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  return { p50, p99 };
}

for (const m of MODELS) {
  try {
    const { p50, p99 } = await bench(m);
    console.log(`${m}: p50=${p50.toFixed(1)}ms p99=${p99.toFixed(1)}ms`);
  } catch (e) {
    console.log(`${m}: FAILED — ${(e as Error).message}`);
  }
}
```

- [ ] **Step 2: 运行 bench**

Run: `pnpm tsx scripts/bench-embedding-latency.ts`
Expected: 三个模型各自打印 p50/p99；首次运行会下载模型（每个 90-250MB）。

- [ ] **Step 3: 写报告 + 决策**

把输出粘到 `scripts/out/embedding-latency-report.md`，按下列规则决策并记录：

| 实测 p99 | 决策 |
|---|---|
| multilingual-e5-small <60ms | 选它作为 M4-B 主模型 |
| multilingual-e5-small 60-120ms | 仍选它，但设计里 §3.4 更新为"p99 <120ms"并接受 |
| multilingual-e5-small >120ms | 降级到 all-MiniLM-L6（英文 only，中文走 Haiku 机翻到英文再 embed） |
| 全部 >150ms | 暂停 M4-B，回 §10.1 讨论 |

- [ ] **Step 4: Commit**

```bash
git add scripts/bench-embedding-latency.ts scripts/out/embedding-latency-report.md
git commit -m "bench(m4b): embedding latency baseline on local CPU"
```

---

### Task A1: 新增 RuleEmbedder port + 契约测试

**Files:**
- Create: `packages/ports/src/rule-embedder.ts`
- Create: `packages/ports/src/__tests__/rule-embedder-contract.ts`
- Modify: `packages/ports/src/index.ts`

- [ ] **Step 1: 定义 port 接口**

`packages/ports/src/rule-embedder.ts`:
```typescript
/**
 * RuleEmbedder — M4-B 语义匹配引擎用。
 *
 * 不复用 WikiEmbedderPort：wiki embedder 的维度(384)和任务特性可能与规则匹配不同。
 * 分两个 port 是为了日后可独立切换实现。
 */
export interface RuleEmbedder {
  /** 返回归一化后的向量；每次一定是同一模型同一维度。 */
  embed(texts: string[]): Promise<number[][]>;
  /** 维度——调用方可查询以匹配 schema。 */
  readonly dim: number;
  /** 模型指纹——更换模型时用来判断是否要全量重 embed。 */
  readonly modelId: string;
}
```

- [ ] **Step 2: 写契约测试**

`packages/ports/src/__tests__/rule-embedder-contract.ts`:
```typescript
import { describe, expect, it } from "vitest";
import type { RuleEmbedder } from "../rule-embedder.js";

export function ruleEmbedderContractSuite(factory: () => RuleEmbedder): void {
  describe("RuleEmbedder contract", () => {
    it("reports stable dim and modelId", () => {
      const e = factory();
      expect(e.dim).toBeGreaterThan(0);
      expect(e.modelId).toBeTruthy();
    });

    it("returns vectors with declared dim", async () => {
      const e = factory();
      const [v] = await e.embed(["hello world"]);
      expect(v).toHaveLength(e.dim);
    });

    it("returns normalized vectors (L2 norm ≈ 1)", async () => {
      const e = factory();
      const [v] = await e.embed(["hello"]);
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 2);
    });

    it("batch and single give the same vector", async () => {
      const e = factory();
      const [vBatch] = await e.embed(["test input", "other"]);
      const [vSingle] = await e.embed(["test input"]);
      for (let i = 0; i < e.dim; i++) {
        expect(vBatch[i]).toBeCloseTo(vSingle[i], 5);
      }
    });

    it("empty input returns empty array", async () => {
      const e = factory();
      const out = await e.embed([]);
      expect(out).toEqual([]);
    });
  });
}
```

- [ ] **Step 3: 在 ports index 导出**

Modify `packages/ports/src/index.ts`, add:
```typescript
export type { RuleEmbedder } from "./rule-embedder.js";
```

- [ ] **Step 4: 跑测试验证契约 suite 本身可加载**

Run: `pnpm -C packages/ports test`
Expected: 契约测试文件编译通过但无实例可测（suite 是导出函数）。

- [ ] **Step 5: Commit**

```bash
git add packages/ports/src/rule-embedder.ts packages/ports/src/__tests__/rule-embedder-contract.ts packages/ports/src/index.ts
git commit -m "feat(ports): RuleEmbedder port + contract suite (m4b)"
```

---

### Task A2: Xenova RuleEmbedder adapter 实现

**Files:**
- Create: `packages/adapters/src/embedding/xenova-rule-embedder.ts`
- Create: `packages/adapters/src/embedding/__tests__/xenova-rule-embedder.test.ts`
- Modify: `packages/adapters/package.json` (确认 @xenova/transformers 依赖存在——已有)
- Modify: `packages/adapters/src/index.ts` (导出新 adapter)

模型选择：按 Task A0 输出决定。默认 `Xenova/multilingual-e5-small`（384 dim，多语言）。

- [ ] **Step 1: 写测试**

`packages/adapters/src/embedding/__tests__/xenova-rule-embedder.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { XenovaRuleEmbedder } from "../xenova-rule-embedder.js";
import { ruleEmbedderContractSuite } from "@teamagent/ports/src/__tests__/rule-embedder-contract.js";

describe("XenovaRuleEmbedder", () => {
  ruleEmbedderContractSuite(() => new XenovaRuleEmbedder());

  it("gives higher cosine sim to semantically close pairs than distant", async () => {
    const e = new XenovaRuleEmbedder();
    const [a, b, c] = await e.embed([
      "需要发起 HTTP 请求",
      "使用 fetch 发请求",
      "删除文件系统",
    ]);
    const sim = (x: number[], y: number[]) =>
      x.reduce((s, v, i) => s + v * y[i], 0);
    expect(sim(a, b)).toBeGreaterThan(sim(a, c));
  });
}, { timeout: 60000 }); // 模型首次下载慢
```

- [ ] **Step 2: 写实现**

`packages/adapters/src/embedding/xenova-rule-embedder.ts`:
```typescript
import type { RuleEmbedder } from "@teamagent/ports";

type XenovaPipeline = (
  texts: string | string[],
  opts?: Record<string, unknown>,
) => Promise<{ tolist(): number[][] }>;

const DEFAULT_MODEL = "Xenova/multilingual-e5-small";
const DEFAULT_DIM = 384;

export class XenovaRuleEmbedder implements RuleEmbedder {
  readonly modelId: string;
  readonly dim: number;

  private pipeline: XenovaPipeline | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(
    opts: { modelId?: string; dim?: number } = {},
  ) {
    this.modelId = opts.modelId ?? DEFAULT_MODEL;
    this.dim = opts.dim ?? DEFAULT_DIM;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    await this.ensureLoaded();
    // multilingual-e5 要求前缀 "query: " 或 "passage: "；规则和查询都当 passage
    const prefixed = texts.map((t) => `passage: ${t}`);
    const output = await this.pipeline!(prefixed, {
      pooling: "mean",
      normalize: true,
    });
    return output.tolist();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.pipeline) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadModel();
    return this.loadPromise;
  }

  private async loadModel(): Promise<void> {
    const { pipeline } = await import("@xenova/transformers");
    console.error(`⏳ Loading rule embedder: ${this.modelId}...`);
    this.pipeline = (await pipeline(
      "feature-extraction",
      this.modelId,
    )) as unknown as XenovaPipeline;
    console.error(`✓ Rule embedder ready (${this.modelId}, dim=${this.dim}).`);
  }
}
```

- [ ] **Step 3: 跑测试**

Run: `pnpm -C packages/adapters test embedding`
Expected: 契约 suite 4 条通过 + 语义距离测试通过（首次运行下载模型 ~30s-2min）。

- [ ] **Step 4: 在 adapters index 导出**

Modify `packages/adapters/src/index.ts`, add:
```typescript
export { XenovaRuleEmbedder } from "./embedding/xenova-rule-embedder.js";
```

并在 `packages/adapters/package.json` exports 字段加：
```json
"./embedding/xenova-rule-embedder": "./src/embedding/xenova-rule-embedder.ts",
```

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/embedding/ packages/adapters/src/index.ts packages/adapters/package.json
git commit -m "feat(adapters): XenovaRuleEmbedder using multilingual-e5-small (m4b)"
```

---

### Task A3: Schema v6 迁移——新增向量列 + FTS5 + vec0 虚表

**Files:**
- Modify: `packages/adapters/src/storage/sqlite/schema.ts`
- Create: `packages/adapters/src/storage/sqlite/__tests__/schema-v6.test.ts`

- [ ] **Step 1: 写测试**

`packages/adapters/src/storage/sqlite/__tests__/schema-v6.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../schema.js";

describe("Schema v6 migration", () => {
  let dbPath: string;
  beforeEach(() => {
    dbPath = join(mkdtempSync(join(tmpdir(), "m4b-schema-")), "test.db");
  });

  it("adds trigger_description and pattern_description columns", () => {
    const db = openDb(dbPath);
    const cols = db
      .prepare("PRAGMA table_info(knowledge)")
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("trigger_description");
    expect(names).toContain("pattern_description");
    expect(names).toContain("fire_threshold");
  });

  it("creates knowledge_fts virtual table for BM25", () => {
    const db = openDb(dbPath);
    const tbl = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_fts'",
      )
      .get();
    expect(tbl).toBeTruthy();
  });

  it("creates knowledge_trigger_vec and knowledge_pattern_vec vec0 tables", () => {
    const db = openDb(dbPath);
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name LIKE 'knowledge_%_vec'",
      )
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("knowledge_trigger_vec");
    expect(names).toContain("knowledge_pattern_vec");
  });

  it("is idempotent: reopening existing db does not error", () => {
    openDb(dbPath);
    openDb(dbPath); // 第二次打开应无异常
  });
});
```

- [ ] **Step 2: 跑测试看到失败**

Run: `pnpm -C packages/adapters test schema-v6`
Expected: 全部 FAIL（列不存在 / 虚表不存在）。

- [ ] **Step 3: 修改 schema.ts，加 v6 DDL**

在 `INIT_SQL` 末尾追加（注意：新增列用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 的替代——sqlite 不支持 IF NOT EXISTS on ALTER，要先查 pragma。改成 `openDb()` 里做显式迁移）。

修改 `packages/adapters/src/storage/sqlite/schema.ts` 增加：
```typescript
const V6_ADDITIONS = `
-- M4-B schema v6：语义匹配字段
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  id UNINDEXED,
  trigger_description,
  pattern_description,
  tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_trigger_vec USING vec0(
  id TEXT PRIMARY KEY,
  vec FLOAT[384]
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_pattern_vec USING vec0(
  id TEXT PRIMARY KEY,
  vec FLOAT[384]
);
`;

const V6_ALTER_COLUMNS = [
  "trigger_description TEXT DEFAULT ''",
  "pattern_description TEXT DEFAULT ''",
  "hard_negatives BLOB",              // JSON array of base64'd float32[384] vectors
  "threshold_alpha REAL DEFAULT 1.0",
  "threshold_beta REAL DEFAULT 1.0",
  "fire_threshold REAL DEFAULT 0.55",
  "observation_window BLOB",          // JSON array of {outcome, ts} last 50
  "embedder_model_id TEXT DEFAULT ''",
];

function applyV6Migration(db: DatabaseSync): void {
  const existing = new Set(
    (db.prepare("PRAGMA table_info(knowledge)").all() as Array<{ name: string }>)
      .map((c) => c.name),
  );
  for (const colDef of V6_ALTER_COLUMNS) {
    const colName = colDef.split(/\s+/)[0];
    if (!existing.has(colName)) {
      db.exec(`ALTER TABLE knowledge ADD COLUMN ${colDef}`);
    }
  }
  // vec0 / fts5 表是 IF NOT EXISTS，可直接 exec（但先确认 sqlite-vec 已加载）
  if (_sqliteVecLoad) {
    db.exec(V6_ADDITIONS);
  } else {
    // 无 sqlite-vec：只建 FTS5（sqlite 内置），vec 表跳过，matcher 会降级到 BM25-only
    const ftsOnly = V6_ADDITIONS.split("CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_trigger_vec")[0];
    db.exec(ftsOnly);
    console.warn("⚠ sqlite-vec not available; vector search disabled, BM25-only fallback");
  }
}
```

在 `openDb()` 的 INIT_SQL 执行完毕后调用 `applyV6Migration(db)`。

- [ ] **Step 4: 跑测试看到通过**

Run: `pnpm -C packages/adapters test schema-v6`
Expected: 4 条测试全部 PASS。

- [ ] **Step 5: 跑原有全量测试无回归**

Run: `pnpm -C packages/adapters test`
Expected: 所有既有测试仍 PASS（schema v6 迁移对旧逻辑透明）。

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/storage/sqlite/
git commit -m "feat(adapters): schema v6 — semantic fields + FTS5 + vec0 tables (m4b)"
```

---

### Task A4: KnowledgeEntry 类型扩展

**Files:**
- Modify: `packages/types/src/knowledge-entry.ts`

- [ ] **Step 1: 添加新字段**

在 `KnowledgeEntry` interface 上加（已有字段前面保持不动）：
```typescript
export interface KnowledgeEntry {
  // ... 现有字段 ...

  // M4-B 语义匹配字段
  /** 触发场景的自然语言描述（替代 trigger 的口水化写法，用于 embedding） */
  trigger_description?: string;
  /** 错误行为的自然语言描述（替代 wrong_pattern 的字面关键词） */
  pattern_description?: string;
  /** 规则当前触发阈值（Thompson 采样会微调；固定阈值版本默认 0.55） */
  fire_threshold?: number;
  /** Thompson Beta(α, β)（Phase C 用；Phase A+B 写入默认值 1.0, 1.0 占位） */
  threshold_alpha?: number;
  threshold_beta?: number;
  /** 生成该规则向量的 embedder 模型指纹（更换模型时用来判断要重 embed） */
  embedder_model_id?: string;

  // 已废弃字段——保留列与读取但新代码不用
  /** @deprecated M4-B: replaced by pattern_description + semantic matching */
  wrong_pattern?: string;
  /** @deprecated M4-B: replaced by unified semantic matcher routing by trigger context */
  channel?: "tool-action" | "ai-narrative" | "user-input" | "passive-knowledge";
  /** @deprecated M4-B: all rules participate in semantic matching regardless of type */
  type?: "avoidance" | "practice";
}
```

- [ ] **Step 2: typecheck 通过**

Run: `pnpm -C packages/types typecheck`
Expected: 通过，无错误。

- [ ] **Step 3: 全项目 typecheck**

Run: `pnpm typecheck`
Expected: 通过——现有代码继续读老字段工作，新字段都是 optional 不强制。

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/knowledge-entry.ts
git commit -m "feat(types): KnowledgeEntry semantic fields (m4b)"
```

---

### Task A5: SQLite KnowledgeStore 读写新字段

**Files:**
- Modify: `packages/adapters/src/storage/sqlite/sqlite-knowledge-store.ts`
- Create: `packages/adapters/src/storage/sqlite/__tests__/sqlite-knowledge-store-v6.test.ts`

- [ ] **Step 1: 写测试**

`packages/adapters/src/storage/sqlite/__tests__/sqlite-knowledge-store-v6.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../schema.js";
import { SqliteKnowledgeStore } from "../sqlite-knowledge-store.js";
import type { KnowledgeEntry } from "@teamagent/types";

describe("SqliteKnowledgeStore v6 fields", () => {
  let store: SqliteKnowledgeStore;
  beforeEach(() => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "m4b-kstore-")), "t.db");
    store = new SqliteKnowledgeStore(openDb(dbPath));
  });

  it("persists trigger_description + pattern_description", async () => {
    const e = mkEntry({
      id: "r1",
      trigger_description: "需要发起 HTTP 请求",
      pattern_description: "使用 axios 库",
      fire_threshold: 0.6,
      embedder_model_id: "Xenova/multilingual-e5-small",
    });
    await store.add(e);
    const [got] = await store.byIds(["r1"]);
    expect(got?.trigger_description).toBe("需要发起 HTTP 请求");
    expect(got?.pattern_description).toBe("使用 axios 库");
    expect(got?.fire_threshold).toBeCloseTo(0.6);
    expect(got?.embedder_model_id).toBe("Xenova/multilingual-e5-small");
  });

  it("defaults fire_threshold to 0.55 when not provided", async () => {
    await store.add(mkEntry({ id: "r2" }));
    const [got] = await store.byIds(["r2"]);
    expect(got?.fire_threshold).toBeCloseTo(0.55);
  });

  it("reads old rows without new fields without error", async () => {
    // 老规则（Phase A 迁移前写入的）——用 raw SQL 模拟
    const db = (store as any).db; // 测试 escape
    db.prepare(`INSERT INTO knowledge (id, scope_level, category, tags, type, nature,
      trigger, correct_pattern, enforcement, source, created_at, tier_entered_at)
      VALUES ('old1','global','E','[]','avoidance','objective','x','y','warn','test',datetime('now'),datetime('now'))`).run();
    const [got] = await store.byIds(["old1"]);
    expect(got?.id).toBe("old1");
    expect(got?.trigger_description).toBe(""); // default
    expect(got?.fire_threshold).toBeCloseTo(0.55);
  });
});

function mkEntry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "r",
    scope: { level: "global" },
    category: "E",
    tags: [],
    type: "avoidance",
    nature: "objective",
    trigger: "x",
    wrong_pattern: "",
    correct_pattern: "y",
    reasoning: "",
    confidence: 0.7,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: new Date().toISOString(),
    last_hit_at: "",
    last_validated_at: new Date().toISOString(),
    source: "test",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: new Date().toISOString(),
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action",
    ...overrides,
  };
}
```

- [ ] **Step 2: 跑看失败**

Run: `pnpm -C packages/adapters test sqlite-knowledge-store-v6`
Expected: FAIL——store 当前 INSERT/SELECT 语句还没包含新列。

- [ ] **Step 3: 修改 store 的 CRUD SQL**

在 `sqlite-knowledge-store.ts` 里：

(a) INSERT 语句（`add()` 方法）末尾扩展列，在现有 `VALUES(...)` 后面追加新列：

```typescript
// 新 INSERT SQL —— 对比现版，追加 8 个新列
const INSERT_SQL = `
INSERT INTO knowledge (
  id, scope_level, scope_project, scope_paths, scope_file_types, scope_branches,
  category, tags, type, nature, trigger, wrong_pattern, correct_pattern,
  correct_pattern_code_example, correct_pattern_import_path, correct_pattern_tldr,
  reasoning, when_expression, confidence, demerit, demerit_last_updated,
  current_tier, max_tier_ever, tier_entered_at, enforcement, status,
  hit_count, success_count, override_count, resurrect_count, evidence,
  source, conflict_with, created_at, last_hit_at, last_validated_at, channel,
  /* M4-B */ trigger_description, pattern_description, hard_negatives,
  threshold_alpha, threshold_beta, fire_threshold, observation_window, embedder_model_id
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
```

对应 `add(entry)` 调用里追加绑定值：
```typescript
db.prepare(INSERT_SQL).run(
  /* ...existing 37 values... */,
  entry.trigger_description ?? "",
  entry.pattern_description ?? "",
  entry.hard_negatives ? JSON.stringify(entry.hard_negatives) : null,
  entry.threshold_alpha ?? 1.0,
  entry.threshold_beta ?? 1.0,
  entry.fire_threshold ?? 0.55,
  entry.observation_window ? JSON.stringify(entry.observation_window) : null,
  entry.embedder_model_id ?? "",
);
```

(b) SELECT 时用 `SELECT *`（已经是这样）——无需改 SQL，但 `rowToEntry(row)` helper 要填充新字段：

```typescript
function rowToEntry(row: any): KnowledgeEntry {
  return {
    // ... 现有字段映射不变 ...
    trigger_description: row.trigger_description ?? "",
    pattern_description: row.pattern_description ?? "",
    fire_threshold: row.fire_threshold ?? 0.55,
    threshold_alpha: row.threshold_alpha ?? 1.0,
    threshold_beta: row.threshold_beta ?? 1.0,
    embedder_model_id: row.embedder_model_id ?? "",
    hard_negatives: row.hard_negatives
      ? (typeof row.hard_negatives === "string"
          ? JSON.parse(row.hard_negatives)
          : JSON.parse(Buffer.from(row.hard_negatives).toString()))
      : [],
    observation_window: row.observation_window
      ? JSON.parse(typeof row.observation_window === "string"
          ? row.observation_window
          : Buffer.from(row.observation_window).toString())
      : [],
  };
}
```

(c) `update(entry)` 用 UPDATE SQL 同步加 8 个 SET 子句。

- [ ] **Step 4: 跑测试通过**

Run: `pnpm -C packages/adapters test sqlite-knowledge-store-v6`
Expected: 3 条测试 PASS。

- [ ] **Step 5: 全量回归**

Run: `pnpm -C packages/adapters test`
Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/storage/sqlite/sqlite-knowledge-store.ts packages/adapters/src/storage/sqlite/__tests__/sqlite-knowledge-store-v6.test.ts
git commit -m "feat(adapters): knowledge store reads/writes v6 semantic fields (m4b)"
```

---

### Task A6: Embedding 同步到 vec0 虚表

**Files:**
- Create: `packages/adapters/src/storage/sqlite/vec-sync.ts`
- Create: `packages/adapters/src/storage/sqlite/__tests__/vec-sync.test.ts`

- [ ] **Step 1: 写测试**

`__tests__/vec-sync.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../schema.js";
import { syncRuleVectors } from "../vec-sync.js";

describe("syncRuleVectors", () => {
  let db: ReturnType<typeof openDb>;
  beforeEach(() => {
    db = openDb(join(mkdtempSync(join(tmpdir(), "m4b-vec-")), "t.db"));
  });

  it("upserts trigger + pattern vectors for a rule", () => {
    const v1 = new Float32Array(384).fill(0.1);
    const v2 = new Float32Array(384).fill(0.2);
    syncRuleVectors(db, "r1", v1, v2);
    const row = db.prepare("SELECT id FROM knowledge_trigger_vec WHERE id='r1'").get();
    expect(row).toBeTruthy();
  });

  it("replaces existing vectors on re-sync", () => {
    const v = new Float32Array(384).fill(0.1);
    syncRuleVectors(db, "r1", v, v);
    syncRuleVectors(db, "r1", v, v); // 第二次调用不应报错
    const count = db.prepare("SELECT COUNT(*) as c FROM knowledge_trigger_vec WHERE id='r1'").get() as { c: number };
    expect(count.c).toBe(1);
  });
});
```

- [ ] **Step 2: 跑看失败**

Run: `pnpm -C packages/adapters test vec-sync`
Expected: FAIL——`vec-sync.ts` 不存在。

- [ ] **Step 3: 实现 syncRuleVectors**

`packages/adapters/src/storage/sqlite/vec-sync.ts`:
```typescript
import type { DatabaseSync } from "node:sqlite";

/** 把规则的 trigger + pattern 向量写到 vec0 虚表。幂等。 */
export function syncRuleVectors(
  db: DatabaseSync,
  ruleId: string,
  triggerVec: Float32Array,
  patternVec: Float32Array,
): void {
  // vec0 表 PRIMARY KEY=id，REPLACE 语义由 INSERT OR REPLACE 提供
  db.prepare(
    "INSERT OR REPLACE INTO knowledge_trigger_vec(id, vec) VALUES (?, ?)",
  ).run(ruleId, new Uint8Array(triggerVec.buffer));

  db.prepare(
    "INSERT OR REPLACE INTO knowledge_pattern_vec(id, vec) VALUES (?, ?)",
  ).run(ruleId, new Uint8Array(patternVec.buffer));
}

export function deleteRuleVectors(db: DatabaseSync, ruleId: string): void {
  db.prepare("DELETE FROM knowledge_trigger_vec WHERE id = ?").run(ruleId);
  db.prepare("DELETE FROM knowledge_pattern_vec WHERE id = ?").run(ruleId);
}
```

- [ ] **Step 4: 跑测试通过**

Run: `pnpm -C packages/adapters test vec-sync`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/storage/sqlite/vec-sync.ts packages/adapters/src/storage/sqlite/__tests__/vec-sync.test.ts
git commit -m "feat(adapters): syncRuleVectors for vec0 tables (m4b)"
```

---

### Task A7: 规则迁移 CLI：旧规则生成 description + 向量

**Files:**
- Create: `packages/cli/src/commands/migrate-v6.ts`
- Modify: `packages/cli/src/bin.ts` (注册 `teamagent migrate-v6` 命令)

**功能**: 扫 knowledge 表 → 对 `trigger_description` 为空的规则，用 LLM（现有 claude-agent-sdk 链路）基于老 trigger + wrong_pattern + correct_pattern + reasoning 生成新描述 → embedding → 同步到 vec0 表。dormant 规则 hit_count≥3 的恢复到 probation tier 并 reset Thompson 参数。

- [ ] **Step 1: 先写函数单元测试（不跑真 LLM）**

`packages/cli/src/commands/__tests__/migrate-v6.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildMigrationPrompt, shouldResurrectDormant } from "../migrate-v6.js";

describe("migrate-v6 helpers", () => {
  it("buildMigrationPrompt includes all 4 source fields", () => {
    const p = buildMigrationPrompt({
      trigger: "T", wrong_pattern: "W", correct_pattern: "C", reasoning: "R",
    });
    expect(p).toContain("T"); expect(p).toContain("W");
    expect(p).toContain("C"); expect(p).toContain("R");
  });

  it("resurrects dormant rules with hit_count >= 3", () => {
    expect(shouldResurrectDormant({ status: "dormant", hit_count: 3 })).toBe(true);
    expect(shouldResurrectDormant({ status: "dormant", hit_count: 2 })).toBe(false);
    expect(shouldResurrectDormant({ status: "active", hit_count: 100 })).toBe(false);
  });
});
```

- [ ] **Step 2: 跑看失败**

Run: `pnpm -C packages/cli test migrate-v6`
Expected: FAIL——函数不存在。

- [ ] **Step 3: 实现 migrate-v6 命令**

`packages/cli/src/commands/migrate-v6.ts`:
```typescript
import type { KnowledgeEntry } from "@teamagent/types";
import type { RuleEmbedder } from "@teamagent/ports";
import { XenovaRuleEmbedder } from "@teamagent/adapters";
import { openDb, SqliteKnowledgeStore, syncRuleVectors } from "@teamagent/adapters";
import { query } from "@anthropic-ai/claude-agent-sdk";

export function buildMigrationPrompt(r: {
  trigger: string;
  wrong_pattern: string;
  correct_pattern: string;
  reasoning: string;
}): string {
  return [
    "把下面这条旧知识规则转成新版双描述格式。",
    "",
    "【旧字段】",
    `trigger:         ${r.trigger}`,
    `wrong_pattern:   ${r.wrong_pattern}`,
    `correct_pattern: ${r.correct_pattern}`,
    `reasoning:       ${r.reasoning}`,
    "",
    "【新字段】生成 2 个字段，**只**输出 JSON：",
    `{`,
    `  "trigger_description": "用一两句话描述什么情境下这条规则该触发（完整的场景，用自然语言）",`,
    `  "pattern_description": "描述什么具体行为/代码/操作是错的（具体到行为，用自然语言）"`,
    `}`,
    "",
    "示例：",
    '  旧 trigger="需要发起HTTP请求" wrong_pattern="axios" correct_pattern="fetch"',
    '  新 trigger_description="在项目代码里新发起一次HTTP请求的场景"',
    '  新 pattern_description="引入或调用axios库发请求"',
    "",
    "只输出 JSON，不要解释。",
  ].join("\n");
}

export function shouldResurrectDormant(r: { status: string; hit_count: number }): boolean {
  return r.status === "dormant" && r.hit_count >= 3;
}

export async function migrateV6(opts: {
  dryRun: boolean;
  dbPath: string;
  limit?: number;
}): Promise<{ migrated: number; resurrected: number; skipped: number }> {
  const db = openDb(opts.dbPath);
  const store = new SqliteKnowledgeStore(db);
  const embedder: RuleEmbedder = new XenovaRuleEmbedder();

  // 所有 trigger_description 为空的规则都迁移
  const rows = db
    .prepare(
      `SELECT id, trigger, wrong_pattern, correct_pattern, reasoning, status, hit_count
       FROM knowledge
       WHERE COALESCE(trigger_description,'') = ''
       ${opts.limit ? "LIMIT ?" : ""}`,
    )
    .all(...(opts.limit ? [opts.limit] : [])) as Array<{
    id: string; trigger: string; wrong_pattern: string;
    correct_pattern: string; reasoning: string;
    status: string; hit_count: number;
  }>;

  console.error(`Migrating ${rows.length} rules...`);

  let migrated = 0, resurrected = 0, skipped = 0;
  for (const r of rows) {
    try {
      const promptText = buildMigrationPrompt(r);
      let jsonOut = "";
      for await (const msg of query({ prompt: promptText, options: {
        model: "claude-haiku-4-5-20251001",
        maxTurns: 1,
      }})) {
        if (msg.type === "result") jsonOut = msg.result as string;
      }
      const parsed = JSON.parse(jsonOut.trim().replace(/^```json/,"").replace(/```$/,"")) as {
        trigger_description: string;
        pattern_description: string;
      };

      const [tvec, pvec] = await embedder.embed([
        parsed.trigger_description,
        parsed.pattern_description,
      ]);

      if (opts.dryRun) {
        console.log(`[dry] ${r.id}: ${parsed.trigger_description.slice(0,40)}`);
        migrated++;
        continue;
      }

      // 更新主表
      const resurrect = shouldResurrectDormant(r);
      db.prepare(
        `UPDATE knowledge SET
           trigger_description = ?,
           pattern_description = ?,
           threshold_alpha = 1.0,
           threshold_beta = 1.0,
           fire_threshold = 0.55,
           embedder_model_id = ?,
           status = CASE WHEN ? THEN 'active' ELSE status END,
           current_tier = CASE WHEN ? THEN 'probation' ELSE current_tier END
         WHERE id = ?`,
      ).run(
        parsed.trigger_description,
        parsed.pattern_description,
        embedder.modelId,
        resurrect ? 1 : 0,
        resurrect ? 1 : 0,
        r.id,
      );

      // 向量写入 vec0
      syncRuleVectors(db, r.id,
        new Float32Array(tvec),
        new Float32Array(pvec),
      );

      // FTS 同步
      db.prepare(
        `INSERT OR REPLACE INTO knowledge_fts(id, trigger_description, pattern_description)
         VALUES (?, ?, ?)`,
      ).run(r.id, parsed.trigger_description, parsed.pattern_description);

      migrated++;
      if (resurrect) resurrected++;
    } catch (e) {
      console.error(`skip ${r.id}: ${(e as Error).message}`);
      skipped++;
    }
  }

  return { migrated, resurrected, skipped };
}
```

并在 `packages/cli/src/bin.ts` 的命令调度 switch 里加：
```typescript
case "migrate-v6": {
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
  const result = await migrateV6({ dryRun, dbPath: resolveDbPath(), limit });
  console.log(`migrated=${result.migrated} resurrected=${result.resurrected} skipped=${result.skipped}`);
  break;
}
```

并更新 `--help` 文本添加 `teamagent migrate-v6 [--dry-run] [--limit=N]` 条目。

- [ ] **Step 4: 跑单元测试通过**

Run: `pnpm -C packages/cli test migrate-v6`
Expected: PASS（仅测了 helper 函数，不跑 LLM）。

- [ ] **Step 5: 跑一次 dry run 验证**

Run: `pnpm teamagent migrate-v6 --dry-run --limit=3`
Expected: 打印 3 条规则的新 description 预览，不写 DB。

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/migrate-v6.ts packages/cli/src/commands/__tests__/migrate-v6.test.ts packages/cli/src/bin.ts
git commit -m "feat(cli): migrate-v6 — LLM-rewrite old rules to dual-description + embed (m4b)"
```

---

### Task A8: 实际跑全量迁移

**Files:** (无代码变更，运行操作)

- [ ] **Step 1: 备份当前 DB**

Run:
```bash
cp ~/.teamagent/global.db ~/.teamagent/global.db.pre-m4b
cp ~/.teamagent/events.db ~/.teamagent/events.db.pre-m4b
cp .teamagent/knowledge.db .teamagent/knowledge.db.pre-m4b
```
Expected: 三份备份文件存在。

- [ ] **Step 2: 跑全量 dry run**

Run: `pnpm teamagent migrate-v6 --dry-run 2>&1 | tee scripts/out/migrate-v6-dryrun.log`
Expected: 打印 297 条规则的预览，无写操作；手工抽查 10 条看 description 合理。

- [ ] **Step 3: 执行真迁移**

Run: `pnpm teamagent migrate-v6 2>&1 | tee scripts/out/migrate-v6-run.log`
Expected: `migrated=~297 resurrected=4 skipped=<20`；时间预估 15-30 分钟（LLM + embedding 串行跑）。

- [ ] **Step 4: 验证**

Run: `pnpm teamagent stats --m4b-check` (这个 flag 要在下一任务实现；这里先用 SQL 验证)
```bash
sqlite3 ~/.teamagent/global.db "SELECT COUNT(*) FROM knowledge WHERE trigger_description != ''"
sqlite3 ~/.teamagent/global.db "SELECT COUNT(*) FROM knowledge_trigger_vec"
sqlite3 ~/.teamagent/global.db "SELECT COUNT(*) FROM knowledge_fts"
```
Expected: 三个数接近相等（都约等于迁移成功条数）。

- [ ] **Step 5: Commit 迁移日志**

```bash
git add scripts/out/migrate-v6-dryrun.log scripts/out/migrate-v6-run.log
git commit -m "chore(m4b): migrate 297 rules to v6 schema (embeddings populated)"
```

---

## Phase B — 语义匹配器 + soft-AND + hard-negative 积累

### Task B1: 新增 SemanticRetriever port + 契约测试

**Files:**
- Create: `packages/ports/src/semantic-retriever.ts`
- Create: `packages/ports/src/__tests__/semantic-retriever-contract.ts`
- Modify: `packages/ports/src/index.ts`

- [ ] **Step 1: 定义接口**

```typescript
import type { KnowledgeEntry } from "@teamagent/types";

export interface SemanticCandidate {
  rule: KnowledgeEntry;
  bm25Score: number;      // -1 表示 BM25 未命中
  triggerSim: number;     // cosine 相似度 [-1, 1]
  patternSim: number;
  rrfScore: number;       // reciprocal rank fusion
}

export interface SemanticRetriever {
  /**
   * 给定上下文 + 动作向量，返回 top-K 候选规则及其相似度。
   * 实现要点：
   *   - BM25 对 trigger_description + pattern_description 全文检索 top-20
   *   - 密集 kNN 对 trigger_vec/pattern_vec 各取 top-20
   *   - RRF 融合取 top-K（默认 20）
   *   - 只返回 scope.level 匹配的规则
   */
  retrieve(args: {
    contextText: string;
    actionText: string;
    contextVec: Float32Array;
    actionVec: Float32Array;
    scope: { level: "personal" | "team" | "global"; project?: string };
    topK?: number;
  }): Promise<SemanticCandidate[]>;
}
```

- [ ] **Step 2: 写契约测试**

`__tests__/semantic-retriever-contract.ts`:
```typescript
import { describe, it, expect } from "vitest";
import type { SemanticRetriever } from "../semantic-retriever.js";
import type { KnowledgeEntry } from "@teamagent/types";

type SeedFn = (
  rules: KnowledgeEntry[],
  vectors: Map<string, [Float32Array, Float32Array]>,
) => Promise<void>;

export function semanticRetrieverContractSuite(
  factory: () => { retriever: SemanticRetriever; seed: SeedFn },
): void {
  describe("SemanticRetriever contract", () => {
    it("returns empty when no rules indexed", async () => {
      const { retriever } = factory();
      const out = await retriever.retrieve({
        contextText: "", actionText: "",
        contextVec: new Float32Array(384), actionVec: new Float32Array(384),
        scope: { level: "global" },
      });
      expect(out).toEqual([]);
    });

    it("returns candidates with bm25 and cosine scores populated", async () => {
      const { retriever, seed } = factory();
      const rule: KnowledgeEntry = stubRule({
        id: "http-rule",
        trigger_description: "在代码里新发起 HTTP 请求",
        pattern_description: "使用 axios 库发请求",
      });
      const tVec = unitVec(384, 0.2);
      const pVec = unitVec(384, 0.3);
      await seed([rule], new Map([["http-rule", [tVec, pVec]]]));

      const out = await retriever.retrieve({
        contextText: "fetch HTTP request in project",
        actionText: "axios.get(...)",
        contextVec: unitVec(384, 0.2),
        actionVec: unitVec(384, 0.3),
        scope: { level: "global" },
      });
      expect(out.length).toBeGreaterThan(0);
      expect(out[0].rule.id).toBe("http-rule");
      expect(typeof out[0].triggerSim).toBe("number");
      expect(typeof out[0].patternSim).toBe("number");
    });

    it("filters by scope level", async () => {
      const { retriever, seed } = factory();
      const rulePersonal = stubRule({ id: "p", scope: { level: "personal" } });
      const ruleGlobal = stubRule({ id: "g", scope: { level: "global" } });
      const v = unitVec(384, 0.1);
      await seed([rulePersonal, ruleGlobal], new Map([
        ["p", [v, v]], ["g", [v, v]],
      ]));
      const out = await retriever.retrieve({
        contextText: "x", actionText: "y",
        contextVec: v, actionVec: v,
        scope: { level: "global" },
      });
      expect(out.map((c) => c.rule.id)).not.toContain("p");
      expect(out.map((c) => c.rule.id)).toContain("g");
    });

    it("respects topK parameter", async () => {
      const { retriever, seed } = factory();
      const rules = Array.from({ length: 10 }, (_, i) => stubRule({ id: `r${i}` }));
      const v = unitVec(384, 0.1);
      const vectors = new Map(rules.map((r) => [r.id, [v, v] as [Float32Array, Float32Array]]));
      await seed(rules, vectors);
      const out = await retriever.retrieve({
        contextText: "x", actionText: "y",
        contextVec: v, actionVec: v,
        scope: { level: "global" },
        topK: 3,
      });
      expect(out.length).toBeLessThanOrEqual(3);
    });

    it("RRF score is monotonically decreasing across returned list", async () => {
      const { retriever, seed } = factory();
      const rules = Array.from({ length: 5 }, (_, i) => stubRule({ id: `r${i}` }));
      const v = unitVec(384, 0.1);
      const vectors = new Map(rules.map((r, i) => {
        const scale = 1 / (i + 1);  // r0 最近，r4 最远
        return [r.id, [unitVec(384, scale * 0.1), v] as [Float32Array, Float32Array]];
      }));
      await seed(rules, vectors);
      const out = await retriever.retrieve({
        contextText: "x", actionText: "y",
        contextVec: unitVec(384, 0.1), actionVec: v,
        scope: { level: "global" },
      });
      for (let i = 1; i < out.length; i++) {
        expect(out[i - 1].rrfScore).toBeGreaterThanOrEqual(out[i].rrfScore);
      }
    });
  });
}

// ── helpers ─────────────────────────────────────────────────────────
function unitVec(dim: number, bias: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = bias + Math.random() * 0.01;
  // normalize
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  for (let i = 0; i < dim; i++) v[i] /= n;
  return v;
}

function stubRule(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "stub", scope: { level: "global" },
    category: "E", tags: [], type: "avoidance", nature: "objective",
    trigger: "", wrong_pattern: "", correct_pattern: "", reasoning: "",
    confidence: 0.7, enforcement: "warn", status: "active",
    hit_count: 0, success_count: 0, override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: new Date().toISOString(),
    last_hit_at: "", last_validated_at: new Date().toISOString(),
    source: "test", conflict_with: [],
    current_tier: "experimental", max_tier_ever: "experimental",
    tier_entered_at: new Date().toISOString(),
    demerit: 0, demerit_last_updated: "", resurrect_count: 0,
    channel: "tool-action",
    trigger_description: "stub trigger desc",
    pattern_description: "stub pattern desc",
    fire_threshold: 0.55,
    threshold_alpha: 1.0, threshold_beta: 1.0,
    embedder_model_id: "Xenova/multilingual-e5-small",
    ...overrides,
  };
}
```

- [ ] **Step 3: 导出**

Modify `packages/ports/src/index.ts`:
```typescript
export type { SemanticRetriever, SemanticCandidate } from "./semantic-retriever.js";
```

- [ ] **Step 4: 验证编译**

Run: `pnpm -C packages/ports typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/ports/
git commit -m "feat(ports): SemanticRetriever port + contract (m4b)"
```

---

### Task B2: BM25 + vec0 的 SqliteSemanticRetriever 实现

**Files:**
- Create: `packages/adapters/src/retriever/sqlite-semantic-retriever.ts`
- Create: `packages/adapters/src/retriever/__tests__/sqlite-semantic-retriever.test.ts`

- [ ] **Step 1: 写契约测试调用**

```typescript
import { describe } from "vitest";
import { semanticRetrieverContractSuite } from "@teamagent/ports/src/__tests__/semantic-retriever-contract.js";
import { SqliteSemanticRetriever } from "../sqlite-semantic-retriever.js";
// 以及用 openDb 建临时 DB 种子规则的 helper

describe("SqliteSemanticRetriever", () => {
  semanticRetrieverContractSuite(() => {
    const db = openDb(tempPath());
    const retriever = new SqliteSemanticRetriever(db);
    return {
      retriever,
      async seed(rules, vectors) {
        // INSERT 到 knowledge + knowledge_fts + knowledge_trigger_vec + knowledge_pattern_vec
      },
    };
  });

  it("RRF favors rules hit by both BM25 and dense", async () => {
    // ... 构造场景：规则 A BM25 + dense 都命中；规则 B 仅 dense。A.rrfScore > B.rrfScore
  });
});
```

- [ ] **Step 2: 写实现**

`sqlite-semantic-retriever.ts`:
```typescript
import type { DatabaseSync } from "node:sqlite";
import type {
  SemanticRetriever, SemanticCandidate,
} from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";

const RRF_K = 60;
const DEFAULT_TOP_K = 20;

export class SqliteSemanticRetriever implements SemanticRetriever {
  constructor(private readonly db: DatabaseSync) {}

  async retrieve(args: {
    contextText: string; actionText: string;
    contextVec: Float32Array; actionVec: Float32Array;
    scope: { level: "personal" | "team" | "global"; project?: string };
    topK?: number;
  }): Promise<SemanticCandidate[]> {
    const topK = args.topK ?? DEFAULT_TOP_K;

    // Stage 1: BM25 top-K on combined text
    const bm25Rows = this.db.prepare(`
      SELECT id, rank as bm25_rank
      FROM knowledge_fts
      WHERE knowledge_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(
      `${args.contextText} OR ${args.actionText}`.replace(/[^\w\s一-龥]/g, " "),
      topK,
    ) as Array<{ id: string; bm25_rank: number }>;

    // Stage 2: dense trigger top-K
    const denseT = this.db.prepare(`
      SELECT id, distance
      FROM knowledge_trigger_vec
      WHERE vec MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(new Uint8Array(args.contextVec.buffer), topK) as Array<{ id: string; distance: number }>;

    // Stage 3: dense pattern top-K
    const denseP = this.db.prepare(`
      SELECT id, distance
      FROM knowledge_pattern_vec
      WHERE vec MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(new Uint8Array(args.actionVec.buffer), topK) as Array<{ id: string; distance: number }>;

    // Stage 4: RRF fusion
    const scores = new Map<string, { rrf: number; bm25: number; triggerSim: number; patternSim: number }>();
    const addRRF = (id: string, rank: number, update: Partial<{ bm25: number; triggerSim: number; patternSim: number }>) => {
      const prev = scores.get(id) ?? { rrf: 0, bm25: -1, triggerSim: -1, patternSim: -1 };
      prev.rrf += 1 / (RRF_K + rank);
      Object.assign(prev, update);
      scores.set(id, prev);
    };
    bm25Rows.forEach((r, i) => addRRF(r.id, i + 1, { bm25: r.bm25_rank }));
    denseT.forEach((r, i) => addRRF(r.id, i + 1, { triggerSim: 1 - r.distance }));
    denseP.forEach((r, i) => addRRF(r.id, i + 1, { patternSim: 1 - r.distance }));

    // Stage 5: fetch full rule rows + scope filter
    const ids = [...scores.keys()];
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => "?").join(",");
    const rules = this.db.prepare(`
      SELECT * FROM knowledge WHERE id IN (${placeholders}) AND status = 'active'
        AND scope_level = ?
    `).all(...ids, args.scope.level) as any[];

    return rules.map((r) => {
      const s = scores.get(r.id)!;
      return {
        rule: rowToEntry(r),  // 假定 adapters 已有这个函数或 inline 构造
        bm25Score: s.bm25,
        triggerSim: s.triggerSim,
        patternSim: s.patternSim,
        rrfScore: s.rrf,
      };
    }).sort((a, b) => b.rrfScore - a.rrfScore).slice(0, topK);
  }
}

// rowToEntry：从 DB 行构造 KnowledgeEntry——可从 sqlite-knowledge-store 复用
```

- [ ] **Step 3: 跑测试**

Run: `pnpm -C packages/adapters test sqlite-semantic-retriever`
Expected: 契约测试 5 条 + RRF 单调性 1 条 PASS。

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/retriever/
git commit -m "feat(adapters): SqliteSemanticRetriever with BM25+dense RRF (m4b)"
```

---

### Task B3: Soft-AND 打分器

**Files:**
- Create: `packages/core/src/matcher/soft-and-scorer.ts`
- Create: `packages/core/src/matcher/__tests__/soft-and-scorer.test.ts`

打分公式（spec §3.3）：
```
score = w1·sim(ctx,trigger) + w2·sim(act,pattern)
      - w3·max(0, τ_floor - min(sim(ctx,trigger), sim(act,pattern)))
      - w4·max(sim(ctx, hn) for hn in hard_negatives)
默认: w1=w2=0.4, w3=0.3, w4=0.5, τ_floor=0.50
```

- [ ] **Step 1: 写测试**

```typescript
import { describe, it, expect } from "vitest";
import { scoreSoftAnd } from "../soft-and-scorer.js";

describe("scoreSoftAnd", () => {
  it("rewards high triggerSim + high patternSim", () => {
    const s = scoreSoftAnd({ triggerSim: 0.8, patternSim: 0.8, hardNegativeSims: [] });
    expect(s).toBeGreaterThan(0.6);
  });

  it("applies floor penalty when one sim is low", () => {
    const bothHigh = scoreSoftAnd({ triggerSim: 0.8, patternSim: 0.8, hardNegativeSims: [] });
    const oneLow = scoreSoftAnd({ triggerSim: 0.8, patternSim: 0.3, hardNegativeSims: [] });
    expect(bothHigh).toBeGreaterThan(oneLow + 0.1);
  });

  it("subtracts hard-negative penalty", () => {
    const noHn = scoreSoftAnd({ triggerSim: 0.8, patternSim: 0.8, hardNegativeSims: [] });
    const withHn = scoreSoftAnd({ triggerSim: 0.8, patternSim: 0.8, hardNegativeSims: [0.9] });
    expect(withHn).toBeLessThan(noHn - 0.3);
  });

  it("is pure (same inputs → same output)", () => {
    const args = { triggerSim: 0.7, patternSim: 0.6, hardNegativeSims: [0.4] };
    expect(scoreSoftAnd(args)).toBe(scoreSoftAnd(args));
  });
});
```

- [ ] **Step 2: 跑看失败**

Run: `pnpm -C packages/core test soft-and-scorer`
Expected: FAIL.

- [ ] **Step 3: 实现**

```typescript
export interface SoftAndWeights {
  w1: number; w2: number; w3: number; w4: number; tauFloor: number;
}

export const DEFAULT_SOFTAND: SoftAndWeights = {
  w1: 0.4, w2: 0.4, w3: 0.3, w4: 0.5, tauFloor: 0.50,
};

export function scoreSoftAnd(args: {
  triggerSim: number;
  patternSim: number;
  hardNegativeSims: number[];
  weights?: SoftAndWeights;
}): number {
  const w = args.weights ?? DEFAULT_SOFTAND;
  const minSim = Math.min(args.triggerSim, args.patternSim);
  const floor = Math.max(0, w.tauFloor - minSim);
  const hnMax = args.hardNegativeSims.length > 0
    ? Math.max(...args.hardNegativeSims)
    : 0;
  return w.w1 * args.triggerSim
       + w.w2 * args.patternSim
       - w.w3 * floor
       - w.w4 * hnMax;
}
```

- [ ] **Step 4: 跑测试通过**

Run: `pnpm -C packages/core test soft-and-scorer`
Expected: 4/4 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/matcher/soft-and-scorer.ts packages/core/src/matcher/__tests__/soft-and-scorer.test.ts
git commit -m "feat(core): soft-AND scorer with floor penalty + hard-neg (m4b)"
```

---

### Task B4: 组装 matcher 主入口（调 retriever + scorer）

**Files:**
- Create: `packages/core/src/matcher/semantic-matcher.ts`
- Modify: `packages/core/src/matcher/match.ts` (feature-flag 切换 keyword vs semantic)
- Create: `packages/core/src/matcher/__tests__/semantic-matcher.test.ts`

- [ ] **Step 1: 写测试**

`__tests__/semantic-matcher.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { semanticMatch } from "../semantic-matcher.js";
import type { RuleEmbedder, SemanticRetriever, SemanticCandidate } from "@teamagent/ports";

const stubEmbedder: RuleEmbedder = {
  modelId: "test",
  dim: 4,
  async embed(texts) {
    // 测试用：hash 文本成 4-dim 伪向量（可重复）
    return texts.map((t) => {
      const v = [0, 0, 0, 0];
      for (const ch of t) v[ch.charCodeAt(0) % 4] += 0.1;
      const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return v.map((x) => x / n);
    });
  },
};

function fakeRetriever(candidates: SemanticCandidate[]): SemanticRetriever {
  return { async retrieve() { return candidates; } };
}

describe("semanticMatch", () => {
  it("fires rule when combined soft-AND score > threshold", async () => {
    const cand: SemanticCandidate = {
      rule: stubRule({ id: "r1", fire_threshold: 0.4 }),
      bm25Score: 0.5, triggerSim: 0.85, patternSim: 0.85, rrfScore: 0.03,
    };
    const out = await semanticMatch({
      contextText: "x", actionText: "y",
      embedder: stubEmbedder,
      retriever: fakeRetriever([cand]),
      scope: { level: "global" },
    });
    expect(out).toHaveLength(1);
    expect(out[0].rule.id).toBe("r1");
    expect(out[0].score).toBeGreaterThan(0.4);
  });

  it("does not fire when floor penalty kills the score", async () => {
    const cand: SemanticCandidate = {
      rule: stubRule({ id: "r2", fire_threshold: 0.4 }),
      bm25Score: 0.5, triggerSim: 0.85, patternSim: 0.2, rrfScore: 0.03,
    };
    const out = await semanticMatch({
      contextText: "x", actionText: "y",
      embedder: stubEmbedder,
      retriever: fakeRetriever([cand]),
      scope: { level: "global" },
    });
    expect(out).toHaveLength(0);
  });

  it("suppresses rule when hard-negative penalty pushes below threshold", async () => {
    // Rule 自带一条非常接近当前 context 的 hard-negative
    const ctxEmbed = (await stubEmbedder.embed(["some context"]))[0];
    const rule = stubRule({
      id: "r3", fire_threshold: 0.4,
      hard_negatives: JSON.stringify([ctxEmbed]) as any,
    });
    const cand: SemanticCandidate = {
      rule,
      bm25Score: 0.5, triggerSim: 0.85, patternSim: 0.85, rrfScore: 0.03,
    };
    const out = await semanticMatch({
      contextText: "some context", actionText: "action",
      embedder: stubEmbedder,
      retriever: fakeRetriever([cand]),
      scope: { level: "global" },
    });
    expect(out).toHaveLength(0);
  });

  it("sorts returned matches by score descending", async () => {
    const out = await semanticMatch({
      contextText: "x", actionText: "y",
      embedder: stubEmbedder,
      retriever: fakeRetriever([
        { rule: stubRule({ id: "low" }), bm25Score: 0.5, triggerSim: 0.6, patternSim: 0.6, rrfScore: 0.02 },
        { rule: stubRule({ id: "high" }), bm25Score: 0.5, triggerSim: 0.9, patternSim: 0.9, rrfScore: 0.03 },
      ]),
      scope: { level: "global" },
    });
    expect(out.map((m) => m.rule.id)).toEqual(["high", "low"]);
  });
});

// stubRule helper 同 B1 的 contract suite（从该文件 import 或重复声明）
```

- [ ] **Step 2: 实现**

`semantic-matcher.ts`:
```typescript
import type { RuleEmbedder, SemanticRetriever } from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";
import { scoreSoftAnd } from "./soft-and-scorer.js";

export interface SemanticMatch {
  rule: KnowledgeEntry;
  score: number;
  triggerSim: number;
  patternSim: number;
  hardNegSim: number;
}

export async function semanticMatch(args: {
  contextText: string;
  actionText: string;
  embedder: RuleEmbedder;
  retriever: SemanticRetriever;
  scope: { level: "personal" | "team" | "global"; project?: string };
  topK?: number;
}): Promise<SemanticMatch[]> {
  const [ctxVec, actVec] = await args.embedder.embed([
    args.contextText, args.actionText,
  ]);
  const candidates = await args.retriever.retrieve({
    contextText: args.contextText,
    actionText: args.actionText,
    contextVec: new Float32Array(ctxVec),
    actionVec: new Float32Array(actVec),
    scope: args.scope,
    topK: args.topK,
  });

  const matches = candidates
    .map((c) => {
      const hardNegVecs: number[][] = c.rule.hard_negatives
        ? JSON.parse(
            typeof c.rule.hard_negatives === "string"
              ? c.rule.hard_negatives
              : Buffer.from(c.rule.hard_negatives as any).toString(),
          )
        : [];
      const hnSims = hardNegVecs.map((hn) =>
        cosine(ctxVec, hn),
      );
      const maxHn = hnSims.length > 0 ? Math.max(...hnSims) : 0;
      const score = scoreSoftAnd({
        triggerSim: c.triggerSim,
        patternSim: c.patternSim,
        hardNegativeSims: hnSims,
      });
      return {
        rule: c.rule,
        score,
        triggerSim: c.triggerSim,
        patternSim: c.patternSim,
        hardNegSim: maxHn,
      };
    })
    .filter((m) => m.score > (m.rule.fire_threshold ?? 0.55))
    .sort((a, b) => b.score - a.score);

  return matches;
}

function cosine(a: number[], b: number[]): number {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // 输入已归一化
}
```

- [ ] **Step 3: 修改 match.ts feature-flag 切换**

```typescript
const USE_SEMANTIC = process.env.TEAMAGENT_MATCHER !== "legacy";

export async function match(ctx: MatchContext, rules: KnowledgeEntry[]): Promise<MatchResult[]> {
  if (!USE_SEMANTIC) {
    return keywordMatch(ctx, rules);  // 旧 path
  }
  return semanticMatchAdapter(ctx, rules);
}
```

- [ ] **Step 4: 跑测试**

Run: `pnpm -C packages/core test semantic-matcher`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/matcher/
git commit -m "feat(core): semanticMatch + feature-flag legacy fallback (m4b)"
```

---

### Task B5: Legacy matcher 隔离

**Files:**
- Rename: `packages/core/src/matcher/keyword-matcher.ts` → `packages/core/src/matcher/legacy/keyword-matcher.ts`
- Rename: `packages/core/src/matcher/ast-context.ts` → `packages/core/src/matcher/legacy/ast-context.ts`
- Update all imports

- [ ] **Step 1: 移动文件**

```bash
mkdir -p packages/core/src/matcher/legacy
git mv packages/core/src/matcher/keyword-matcher.ts packages/core/src/matcher/legacy/
git mv packages/core/src/matcher/ast-context.ts packages/core/src/matcher/legacy/
git mv packages/core/src/matcher/__tests__/keyword-matcher.test.ts packages/core/src/matcher/legacy/__tests__/
git mv packages/core/src/matcher/__tests__/ast-context.test.ts packages/core/src/matcher/legacy/__tests__/
```

- [ ] **Step 2: 修所有 import 路径**

Run: `pnpm -C packages/core typecheck`
Expected: 报 import 错误列出所有涉及文件。按提示逐个把 `./keyword-matcher` 改为 `./legacy/keyword-matcher`。

- [ ] **Step 3: 再跑 typecheck + test**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add -A packages/core/src/matcher/
git commit -m "refactor(core): isolate keyword-matcher to legacy/ dir (m4b)"
```

---

### Task B6: Hard-negative 自动积累（从事件流）

**Files:**
- Create: `packages/core/src/matcher/hard-negative-accumulator.ts`
- Create: `packages/core/src/matcher/__tests__/hard-negative-accumulator.test.ts`
- Modify: calibrator 调度入口（触发积累）

- [ ] **Step 1: 写测试**

```typescript
describe("accumulateHardNegative", () => {
  it("adds context+action vec when ai.override.ignored event arrives", async () => {
    // 构造 event + 规则 → 调用 accumulateHardNegative → 规则的 hard_negatives 多一条
  });
  it("LRU caps at 20 entries", async () => {
    // 塞 25 条 → 结果只保留最近 20 条
  });
  it("does not accumulate for events outside 24h window", async () => {
    // 旧事件不触发
  });
});
```

- [ ] **Step 2: 实现**

```typescript
export const MAX_HARD_NEG = 20;
const WINDOW_MS = 24 * 3600 * 1000;

export async function accumulateHardNegative(args: {
  event: { kind: string; knowledge_id: string; timestamp: string; payload: any };
  store: KnowledgeStore;
  embedder: RuleEmbedder;
  now: Date;
}): Promise<void> {
  const TRIGGERS = [
    "ai.override.ignored",
    "ai.override.blocked_circumvented",
    "user.supportive_negation",
    "git.revert.related",
  ];
  if (!TRIGGERS.includes(args.event.kind)) return;
  if (args.now.getTime() - Date.parse(args.event.timestamp) > WINDOW_MS) return;

  const rule = await args.store.byId(args.event.knowledge_id);
  if (!rule) return;

  const contextText = args.event.payload?.contextText ?? "";
  const actionText = args.event.payload?.actionText ?? "";
  const [ctxVec] = await args.embedder.embed([contextText]);

  const existing: number[][] = rule.hard_negatives
    ? JSON.parse(String(rule.hard_negatives))
    : [];
  existing.push(ctxVec);
  while (existing.length > MAX_HARD_NEG) existing.shift();

  await args.store.update({
    ...rule,
    hard_negatives: JSON.stringify(existing) as any,
  });
}
```

- [ ] **Step 3: 挂进 calibrator 调度**

`packages/core/src/calibrator/v2/index.ts` 里，处理相关事件的分支调用 `accumulateHardNegative`。

- [ ] **Step 4: 跑测试**

Run: `pnpm -C packages/core test hard-negative-accumulator`
Expected: 3/3 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/matcher/hard-negative-accumulator.ts packages/core/src/matcher/__tests__/hard-negative-accumulator.test.ts packages/core/src/calibrator/v2/index.ts
git commit -m "feat(core): hard-negative auto-accumulator from events (m4b)"
```

---

### Task B7: PreToolUse hook 接入新 matcher

**Files:**
- Modify: `packages/cli/src/bin-pre-tool-use.ts` (或等价文件)
- Modify: `packages/core/src/pipeline/pre-tool-use-pipeline.ts` (或等价)

- [ ] **Step 1: 在 pipeline 里注入新 matcher 的依赖**

找到 PreToolUse 的 orchestration 代码（`packages/core/src/pipeline/` 目录下，通常是 `run-pre-tool-use.ts` 或 `pre-tool-use-pipeline.ts`——先 `grep -r "keywordMatch\|keyword-matcher" packages/`）。

原 keyword path（简化示例）：
```typescript
import { keywordMatch } from "../matcher/legacy/keyword-matcher.js";
const hits = keywordMatch(rules, { tool, input });
```

替换为：
```typescript
import { semanticMatch } from "../matcher/semantic-matcher.js";
import { XenovaRuleEmbedder, SqliteSemanticRetriever } from "@teamagent/adapters";

// embedder/retriever 单例由 DI 容器注入；此处说明接入点
const matches = await semanticMatch({
  contextText: buildContextText(session),   // 最近 1-2 轮 AI 文本 + 任务描述
  actionText: buildActionText(tool, input), // 工具名 + 参数序列化
  embedder,
  retriever,
  scope: currentScope,
});
const hits = matches.map(matchToRuleHit); // 适配下游现有 RuleHit 类型
```

需要实现两个 helper（在同文件内或 util）：

```typescript
function buildContextText(session: { recentAiMessages: string[]; task?: string }): string {
  return [session.task ?? "", ...session.recentAiMessages.slice(-2)].join("\n\n");
}

function buildActionText(tool: string, input: Record<string, unknown>): string {
  const parts = [`tool=${tool}`];
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.length < 2000) parts.push(`${k}=${v}`);
  }
  return parts.join("\n");
}

function matchToRuleHit(m: SemanticMatch): RuleHit {
  return {
    rule: m.rule,
    matchedSnippet: m.rule.pattern_description ?? "",
    score: m.score,
    // ... 其他现有 RuleHit 字段 ...
  };
}
```

- [ ] **Step 2: 实测 hook 路径**

`pnpm teamagent demo hook Bash command='npm install moment'`
Expected: 返回一个拟合 moment 规则的决策（若存在该规则）。

- [ ] **Step 3: 跑 hook 端到端测试**

`pnpm -C packages/cli test pre-tool-use`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/bin-pre-tool-use.ts packages/core/src/pipeline/
git commit -m "feat(core): PreToolUse hook uses semanticMatch (m4b)"
```

---

### Task B8: Stop + UserPromptSubmit hook 接入（叙事通道）

**Files:**
- Modify: `packages/cli/src/bin-stop.ts`
- Modify: `packages/cli/src/bin-user-prompt-submit.ts`
- Delete: `packages/core/src/narrative-scanner/` (已合并到 semantic-matcher)

- [ ] **Step 1: Stop hook 改造**

把原先调 `scanNarrative()` 的位置换成 `semanticMatch({ contextText: userLastPrompt, actionText: aiLastMessage, ... })`；命中规则走统一的 decision pipeline。

- [ ] **Step 2: UserPromptSubmit hook 改造**

类似——把用户本轮 prompt 作为 contextText+actionText 都传给 semanticMatch。

- [ ] **Step 3: 删除 narrative-scanner 目录**

```bash
git rm -r packages/core/src/narrative-scanner/
```

修所有引用它的 import 报错。

- [ ] **Step 4: 跑回归**

`pnpm test`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add -A packages/cli/src/bin-stop.ts packages/cli/src/bin-user-prompt-submit.ts packages/core/src/narrative-scanner packages/core/src/pipeline/
git commit -m "refactor(core): Stop + UserPromptSubmit use unified semanticMatch (m4b)"
```

---

### Task B9: E2E 场景验证

**Files:**
- Create: `packages/cli/src/__tests__/m4b-e2e.test.ts`

- [ ] **Step 1: 写 5 个端到端场景测试**

```typescript
describe("M4-B end-to-end", () => {
  it("scenario 1: new rule extracts, embeds, matches on second occurrence", async () => {
    /* 注入 correction → pitfall → 第二轮相似 context 触发 semantic match */
  });
  it("scenario 2: hard-negative suppresses after 1 false trigger", async () => {});
  it("scenario 3: dormant rule with hit_count>=3 resurrects after migrate-v6", async () => {});
  it("scenario 4: scope filter — personal rules don't fire in global scope query", async () => {});
  it("scenario 5: feature flag TEAMAGENT_MATCHER=legacy falls back to keyword matcher", async () => {});
});
```

- [ ] **Step 2: 跑**

Run: `pnpm -C packages/cli test m4b-e2e`
Expected: 5/5 PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/__tests__/m4b-e2e.test.ts
git commit -m "test(m4b): end-to-end verification scenarios"
```

---

### Task B10: 更新 CLAUDE.md 的 TEAMAGENT 区块 + README 一句话

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`（如存在）

- [ ] **Step 1: CLAUDE.md 里加一行简述**

在 "已知限制 / workaround" 段后加：

```markdown
## M4-B 语义匹配（自 0.9.4 起）

- Matcher 已从 substring 升级为 BM25+dense RRF + soft-AND 打分
- 所有规则（含 practice 类）都参与运行时匹配，通道字段已废弃
- 若新版表现异常，回滚：env `TEAMAGENT_MATCHER=legacy`
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(m4b): note semantic matcher rollout in CLAUDE.md"
```

---

### Task B11: 线上 dogfood 观察周期

**Files:** (无代码；操作步骤)

- [ ] **Step 1: 启动 0.9.4 使用**

在真实会话里正常工作一周，观察：
- PreToolUse p99 延迟
- semantic-match.fired 的 rule 分布
- ai.override.ignored / complied 比率
- hard-negative 数量增长

- [ ] **Step 2: 写周报**

`scripts/out/m4b-week1-report.md`，按 spec §7.2 的"真命中率 / 误触发率 / hard-negative 抑制率"指标写。

- [ ] **Step 3: 决策继续与否**

- 红线未破 → 开 Phase C plan
- 误触发 > M4-A 基线 → `TEAMAGENT_MATCHER=legacy` 回滚 + 根因分析

---

## Phase D（延后至 Phase A+B 稳定 ≥4 周，另起 plan）

仅列待办提醒：
- 删 `packages/core/src/matcher/legacy/` 整个目录
- 移除 `TEAMAGENT_MATCHER=legacy` env var 读取代码
- `wrong_pattern` / `channel` / `type` 列的 @deprecated 标记转为 "dropped in v0.10"
- 真正 DROP 这些列的 schema v7 迁移（破坏性）

---

## 自查清单（写完 plan 后照这个核对一遍）

- [x] 所有 task 有明确的 Files 段
- [x] 每个 task 至少一条 test-first 验证
- [x] 每个 task 以 commit 结尾
- [x] 无 TBD / TODO 占位符
- [x] 类型命名一致（RuleEmbedder / SemanticRetriever 全文一致）
- [x] 文件路径全部用绝对 package 内路径，不省略
- [x] Phase A + B 独立可 ship（不依赖 Phase C）
- [x] 与 spec §十一 迁移清单对齐（DELETE/REPLACE/MODIFY/KEEP）
- [x] A0 latency spike 作为 Phase A 第一件事符合 spec §10.1 要求
