# Wiki 自动化 + 过时清理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**: SessionStart 触发 wiki 自动 pull（24h debounce），pull 完顺带软归档零命中老龄条目和同源非 top-3 条目。

**Architecture**: 三层拆分。Core 纯函数 `computeArchivals` 决定归档对象 → Adapter `ArchiveSweeper` 做 DB 读写 → 新建 `bin-wiki-refresh.cjs` + `bin-session-start.cjs` 两个 entry；hook 侧用现有 detached spawn 模式不阻塞启动。软删复用现有 `knowledge.status='archived'`，零 schema 迁移。

**Tech Stack**: TypeScript、Node 22 `node:sqlite`、`sqlite-vec`、tsup、vitest。所有脚本遵循既有 hook 打包配置（`tsup.hook.config.ts`）。

**Spec**: `docs/superpowers/specs/2026-04-21-wiki-automation-design.md`

---

## 文件结构（先确定边界）

**新建：**
- `packages/core/src/wiki/sweeper.ts` — 纯函数 `computeArchivals`
- `packages/core/src/wiki/__tests__/sweeper.test.ts`
- `packages/adapters/src/wiki/archive-sweeper.ts` — DB 封装
- `packages/adapters/src/wiki/__tests__/archive-sweeper.test.ts`
- `packages/adapters/src/wiki/last-pull-marker.ts` — 标记文件读写
- `packages/adapters/src/wiki/__tests__/last-pull-marker.test.ts`
- `packages/cli/src/wiki-refresh.ts` — 纯逻辑 `runWikiRefresh`（被测试 import）
- `packages/cli/src/bin-wiki-refresh.ts` — entry 薄壳（不被 import，只 spawn 跑）
- `packages/cli/src/__tests__/wiki-refresh.test.ts`
- `packages/cli/src/session-start-logic.ts` — 纯函数 `decideAction` + `spawnRefresh`（被测试 import）
- `packages/cli/src/bin-session-start.ts` — entry 薄壳
- `packages/cli/src/__tests__/session-start-logic.test.ts`

**修改：**
- `packages/core/src/index.ts` — 导出 sweeper
- `packages/adapters/src/index.ts` — 导出 ArchiveSweeper、LastPullMarker
- `packages/adapters/src/storage/sqlite/sqlite-wiki-retriever.ts:36-59` — JOIN knowledge 过滤 `status='active'`
- `packages/adapters/src/storage/sqlite/__tests__/sqlite-wiki-retriever.test.ts` — 补 archived 测试
- `packages/cli/tsup.hook.config.ts` — 加 `bin-wiki-refresh` + `bin-session-start` 两 entry
- `.claude/settings.local.json` — 注册 `SessionStart` hook
- `packages/cli/src/bin.ts` — 加 `wiki:refresh` 子命令（复用 bin-wiki-refresh 逻辑）

---

## Task 1：Core 纯函数 `computeArchivals`

**Files:**
- Create: `packages/core/src/wiki/sweeper.ts`
- Create: `packages/core/src/wiki/__tests__/sweeper.test.ts`
- Modify: `packages/core/src/wiki/index.ts`（如存在则加导出；不存在则新建 barrel）

- [ ] **Step 1: 写失败的测试**

`packages/core/src/wiki/__tests__/sweeper.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { computeArchivals, type WikiEntrySnapshot } from "../sweeper.js";

const now = new Date("2026-04-21T00:00:00Z");

function mk(overrides: Partial<WikiEntrySnapshot>): WikiEntrySnapshot {
  return {
    knowledgeId: "k1",
    sourceType: "github_release",
    sourceId: "vitest-dev/vitest",
    publishedAt: new Date("2026-04-01T00:00:00Z"),
    fetchedAt: new Date("2026-04-01T00:00:00Z"),
    inlineInjectionCount: 0,
    ...overrides,
  };
}

describe("computeArchivals", () => {
  it("归档：零命中 + age > 阈值", () => {
    const stale = mk({
      knowledgeId: "s1",
      fetchedAt: new Date("2026-01-01T00:00:00Z"), // 110d ago
      inlineInjectionCount: 0,
    });
    const result = computeArchivals([stale], {
      zeroHitMinAgeDays: 60,
      perSourceKeep: 3,
      now,
    });
    expect(result).toEqual([{ knowledgeId: "s1", reason: "zero-hit-aged" }]);
  });

  it("保留：零命中但 age 未超阈值", () => {
    const fresh = mk({
      fetchedAt: new Date("2026-04-01T00:00:00Z"), // 20d ago
      inlineInjectionCount: 0,
    });
    expect(computeArchivals([fresh], {
      zeroHitMinAgeDays: 60,
      perSourceKeep: 3,
      now,
    })).toEqual([]);
  });

  it("保留：有命中即使老龄", () => {
    const useful = mk({
      fetchedAt: new Date("2026-01-01T00:00:00Z"),
      inlineInjectionCount: 2,
    });
    expect(computeArchivals([useful], {
      zeroHitMinAgeDays: 60,
      perSourceKeep: 3,
      now,
    })).toEqual([]);
  });

  it("同 source_id 超过 keep 数：归档老的", () => {
    const entries = [
      mk({ knowledgeId: "v5", publishedAt: new Date("2026-04-10"), inlineInjectionCount: 1 }),
      mk({ knowledgeId: "v4", publishedAt: new Date("2026-03-10"), inlineInjectionCount: 1 }),
      mk({ knowledgeId: "v3", publishedAt: new Date("2026-02-10"), inlineInjectionCount: 1 }),
      mk({ knowledgeId: "v2", publishedAt: new Date("2026-01-10"), inlineInjectionCount: 1 }),
      mk({ knowledgeId: "v1", publishedAt: new Date("2025-12-10"), inlineInjectionCount: 1 }),
    ];
    const result = computeArchivals(entries, {
      zeroHitMinAgeDays: 60,
      perSourceKeep: 3,
      now,
    });
    expect(result.map(r => r.knowledgeId).sort()).toEqual(["v1", "v2"]);
    expect(result.every(r => r.reason === "source-overflow")).toBe(true);
  });

  it("不同 source_id 独立计数", () => {
    const entries = [
      mk({ knowledgeId: "a", sourceId: "repo-a", publishedAt: new Date("2026-04-10"), inlineInjectionCount: 1 }),
      mk({ knowledgeId: "b", sourceId: "repo-b", publishedAt: new Date("2026-04-10"), inlineInjectionCount: 1 }),
    ];
    expect(computeArchivals(entries, {
      zeroHitMinAgeDays: 60,
      perSourceKeep: 1,
      now,
    })).toEqual([]);
  });

  it("同 source_id 恰好 keep 数：不归档", () => {
    const entries = [
      mk({ knowledgeId: "v3", publishedAt: new Date("2026-04-10"), inlineInjectionCount: 1 }),
      mk({ knowledgeId: "v2", publishedAt: new Date("2026-03-10"), inlineInjectionCount: 1 }),
      mk({ knowledgeId: "v1", publishedAt: new Date("2026-02-10"), inlineInjectionCount: 1 }),
    ];
    expect(computeArchivals(entries, {
      zeroHitMinAgeDays: 60,
      perSourceKeep: 3,
      now,
    })).toEqual([]);
  });

  it("两个规则重叠：只返回一次，优先 zero-hit-aged", () => {
    const entries = [
      mk({ knowledgeId: "old", sourceId: "r", publishedAt: new Date("2026-01-01"), fetchedAt: new Date("2026-01-01"), inlineInjectionCount: 0 }),
      mk({ knowledgeId: "v3", sourceId: "r", publishedAt: new Date("2026-04-10"), inlineInjectionCount: 1 }),
      mk({ knowledgeId: "v2", sourceId: "r", publishedAt: new Date("2026-03-10"), inlineInjectionCount: 1 }),
      mk({ knowledgeId: "v1", sourceId: "r", publishedAt: new Date("2026-02-10"), inlineInjectionCount: 1 }),
    ];
    const result = computeArchivals(entries, { zeroHitMinAgeDays: 60, perSourceKeep: 3, now });
    const ids = result.map(r => r.knowledgeId);
    expect(ids).toContain("old");
    expect(new Set(ids).size).toBe(ids.length);
    const oldEntry = result.find(r => r.knowledgeId === "old");
    expect(oldEntry?.reason).toBe("zero-hit-aged");
  });
});
```

- [ ] **Step 2: 运行测试确认红**

```
pnpm --filter @teamagent/core test -- sweeper
```
预期：`Cannot find module '../sweeper.js'`。

- [ ] **Step 3: 写最小实现**

`packages/core/src/wiki/sweeper.ts`：

```ts
export interface WikiEntrySnapshot {
  knowledgeId: string;
  sourceType: string;
  sourceId: string;
  publishedAt: Date;
  fetchedAt: Date;
  inlineInjectionCount: number;
}

export interface SweepPolicy {
  zeroHitMinAgeDays: number;
  perSourceKeep: number;
  now: Date;
}

export type ArchiveReason = "zero-hit-aged" | "source-overflow";

export interface ArchiveDecision {
  knowledgeId: string;
  reason: ArchiveReason;
}

const MS_PER_DAY = 86_400_000;

export function computeArchivals(
  entries: readonly WikiEntrySnapshot[],
  policy: SweepPolicy,
): ArchiveDecision[] {
  const decisions = new Map<string, ArchiveDecision>();

  // rule 1: zero-hit + aged
  for (const e of entries) {
    const ageDays = (policy.now.getTime() - e.fetchedAt.getTime()) / MS_PER_DAY;
    if (e.inlineInjectionCount === 0 && ageDays > policy.zeroHitMinAgeDays) {
      decisions.set(e.knowledgeId, { knowledgeId: e.knowledgeId, reason: "zero-hit-aged" });
    }
  }

  // rule 2: per-source keep top N by publishedAt desc
  const bySource = new Map<string, WikiEntrySnapshot[]>();
  for (const e of entries) {
    const key = `${e.sourceType}::${e.sourceId}`;
    const bucket = bySource.get(key) ?? [];
    bucket.push(e);
    bySource.set(key, bucket);
  }
  for (const bucket of bySource.values()) {
    if (bucket.length <= policy.perSourceKeep) continue;
    bucket.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    for (const e of bucket.slice(policy.perSourceKeep)) {
      if (!decisions.has(e.knowledgeId)) {
        decisions.set(e.knowledgeId, { knowledgeId: e.knowledgeId, reason: "source-overflow" });
      }
    }
  }

  return Array.from(decisions.values());
}
```

- [ ] **Step 4: 运行测试确认绿**

```
pnpm --filter @teamagent/core test -- sweeper
```
预期：7 passed。

- [ ] **Step 5: 导出**

确认 `packages/core/src/wiki/index.ts` 存在（前面列表里有 builder/filter 等）。加一行：

```ts
export * from "./sweeper.js";
```

确认 `packages/core/src/index.ts` 不需要新导出（已有 `export * from "./wiki/index.js"` 或类似）。若没有则加。

- [ ] **Step 6: typecheck + commit**

```bash
pnpm typecheck
git add packages/core/src/wiki/sweeper.ts packages/core/src/wiki/__tests__/sweeper.test.ts packages/core/src/wiki/index.ts
git commit -m "feat(wiki): add computeArchivals pure function

Core logic for archiving stale wiki entries (zero-hit aged + per-source
overflow). No IO, now injected as parameter per M0 functional-core rule."
```

---

## Task 2：Adapter 层 `ArchiveSweeper` 做 DB 读写

**Files:**
- Create: `packages/adapters/src/wiki/archive-sweeper.ts`
- Create: `packages/adapters/src/wiki/__tests__/archive-sweeper.test.ts`
- Modify: `packages/adapters/src/index.ts`

- [ ] **Step 1: 写失败的测试**

`packages/adapters/src/wiki/__tests__/archive-sweeper.test.ts`：

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../../storage/sqlite/schema.js";
import { WikiStore } from "../../storage/sqlite/wiki-store.js";
import { ArchiveSweeper } from "../archive-sweeper.js";
import type { DatabaseSync } from "node:sqlite";

function seedEntry(db: DatabaseSync, opts: {
  id: string;
  sourceType: string;
  sourceId: string;
  publishedAt: string;
  createdAt: string;
  injectionCount: number;
}): void {
  const { id, sourceType, sourceId, publishedAt, createdAt, injectionCount } = opts;
  db.prepare(`
    INSERT INTO knowledge (
      id, scope_level, category, tags, type, nature, trigger,
      wrong_pattern, correct_pattern, confidence, demerit,
      current_tier, max_tier_ever, tier_entered_at, enforcement,
      status, hit_count, success_count, override_count, resurrect_count,
      source, created_at
    ) VALUES (?, 'global', 'W', '[]', 'wiki', 'wiki', 'title', '', 'body', 0.7, 0,
      'experimental', 'experimental', ?, 'passive', 'active', 0, 0, 0, 0,
      'wiki_pipeline', ?)
  `).run(id, createdAt, createdAt);
  db.prepare(`
    INSERT INTO wiki_meta (
      knowledge_id, source_url, source_type, source_id, published_at,
      tldr, keywords, inline_injection_count
    ) VALUES (?, ?, ?, ?, ?, 'tldr', '[]', ?)
  `).run(id, `https://example.com/${id}`, sourceType, sourceId, publishedAt, injectionCount);
}

describe("ArchiveSweeper.sweep", () => {
  let db: DatabaseSync;
  let sweeper: ArchiveSweeper;

  beforeEach(() => {
    db = openDb(":memory:");
    sweeper = new ArchiveSweeper(db);
  });

  it("归档零命中+老龄条目，仅改 status 字段", () => {
    seedEntry(db, {
      id: "old-zero",
      sourceType: "github_release",
      sourceId: "a/b",
      publishedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      injectionCount: 0,
    });
    seedEntry(db, {
      id: "fresh",
      sourceType: "github_release",
      sourceId: "c/d",
      publishedAt: "2026-04-15T00:00:00Z",
      createdAt: "2026-04-15T00:00:00Z",
      injectionCount: 0,
    });

    const report = sweeper.sweep(new Date("2026-04-21T00:00:00Z"), {
      zeroHitMinAgeDays: 60,
      perSourceKeep: 3,
    });

    expect(report.archived).toHaveLength(1);
    expect(report.archived[0]!.knowledgeId).toBe("old-zero");

    const row = db.prepare("SELECT status FROM knowledge WHERE id = ?").get("old-zero") as { status: string };
    expect(row.status).toBe("archived");
    const freshRow = db.prepare("SELECT status FROM knowledge WHERE id = ?").get("fresh") as { status: string };
    expect(freshRow.status).toBe("active");
  });

  it("幂等：连续跑两次不再影响", () => {
    seedEntry(db, {
      id: "old-zero",
      sourceType: "github_release",
      sourceId: "a/b",
      publishedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      injectionCount: 0,
    });
    const now = new Date("2026-04-21T00:00:00Z");
    const r1 = sweeper.sweep(now);
    const r2 = sweeper.sweep(now);
    expect(r1.archived).toHaveLength(1);
    expect(r2.archived).toHaveLength(0);
  });

  it("只归档 source='wiki_pipeline' 的 knowledge，经验规则不碰", () => {
    db.prepare(`
      INSERT INTO knowledge (
        id, scope_level, category, tags, type, nature, trigger,
        wrong_pattern, correct_pattern, confidence, demerit,
        current_tier, max_tier_ever, tier_entered_at, enforcement,
        status, hit_count, success_count, override_count, resurrect_count,
        source, created_at
      ) VALUES ('rule-1', 'global', 'R', '[]', 'rule', 'rule', 'x', '', 'y', 0.9, 0,
        'stable', 'stable', '2026-01-01T00:00:00Z', 'passive', 'active', 0, 0, 0, 0,
        'manual', '2026-01-01T00:00:00Z')
    `).run();
    sweeper.sweep(new Date("2026-04-21T00:00:00Z"));
    const row = db.prepare("SELECT status FROM knowledge WHERE id = 'rule-1'").get() as { status: string };
    expect(row.status).toBe("active");
  });

  it("默认参数: zeroHitMinAgeDays=60, perSourceKeep=3", () => {
    seedEntry(db, {
      id: "old",
      sourceType: "github_release",
      sourceId: "a/b",
      publishedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      injectionCount: 0,
    });
    const report = sweeper.sweep(new Date("2026-04-21T00:00:00Z"));
    expect(report.archived).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试确认红**

```
pnpm --filter @teamagent/adapters test -- archive-sweeper
```
预期：`Cannot find module '../archive-sweeper.js'`。

- [ ] **Step 3: 写实现**

`packages/adapters/src/wiki/archive-sweeper.ts`：

```ts
import type { DatabaseSync } from "node:sqlite";
import { computeArchivals, type WikiEntrySnapshot, type ArchiveDecision } from "@teamagent/core";

export interface SweeperOptions {
  zeroHitMinAgeDays?: number;
  perSourceKeep?: number;
}

export interface SweepReport {
  archived: ArchiveDecision[];
  byReason: { zeroHitAged: number; sourceOverflow: number };
}

const DEFAULT_ZERO_HIT_MIN_AGE_DAYS = 60;
const DEFAULT_PER_SOURCE_KEEP = 3;

export class ArchiveSweeper {
  constructor(private db: DatabaseSync) {}

  sweep(now: Date, opts: SweeperOptions = {}): SweepReport {
    const zeroHitMinAgeDays = opts.zeroHitMinAgeDays ?? DEFAULT_ZERO_HIT_MIN_AGE_DAYS;
    const perSourceKeep = opts.perSourceKeep ?? DEFAULT_PER_SOURCE_KEEP;

    const rows = this.db.prepare(`
      SELECT
        k.id             AS knowledge_id,
        wm.source_type   AS source_type,
        wm.source_id     AS source_id,
        wm.published_at  AS published_at,
        k.created_at     AS fetched_at,
        wm.inline_injection_count AS injection_count
      FROM knowledge k
      JOIN wiki_meta wm ON wm.knowledge_id = k.id
      WHERE k.status = 'active' AND k.source = 'wiki_pipeline'
    `).all() as Array<{
      knowledge_id: string;
      source_type: string;
      source_id: string;
      published_at: string;
      fetched_at: string;
      injection_count: number;
    }>;

    const snapshots: WikiEntrySnapshot[] = rows.map((r) => ({
      knowledgeId: r.knowledge_id,
      sourceType: r.source_type,
      sourceId: r.source_id,
      publishedAt: new Date(r.published_at),
      fetchedAt: new Date(r.fetched_at),
      inlineInjectionCount: r.injection_count,
    }));

    const decisions = computeArchivals(snapshots, {
      zeroHitMinAgeDays,
      perSourceKeep,
      now,
    });

    if (decisions.length > 0) {
      const stmt = this.db.prepare("UPDATE knowledge SET status = 'archived' WHERE id = ?");
      this.db.exec("BEGIN");
      try {
        for (const d of decisions) stmt.run(d.knowledgeId);
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }

    const byReason = {
      zeroHitAged: decisions.filter((d) => d.reason === "zero-hit-aged").length,
      sourceOverflow: decisions.filter((d) => d.reason === "source-overflow").length,
    };

    return { archived: decisions, byReason };
  }
}
```

- [ ] **Step 4: 运行测试确认绿**

```
pnpm --filter @teamagent/adapters test -- archive-sweeper
```
预期：4 passed。

- [ ] **Step 5: 加导出**

在 `packages/adapters/src/index.ts` 末尾加：

```ts
export { ArchiveSweeper } from "./wiki/archive-sweeper.js";
export type { SweepReport, SweeperOptions } from "./wiki/archive-sweeper.js";
```

- [ ] **Step 6: typecheck + commit**

```bash
pnpm typecheck
git add packages/adapters/src/wiki/archive-sweeper.ts packages/adapters/src/wiki/__tests__/archive-sweeper.test.ts packages/adapters/src/index.ts
git commit -m "feat(wiki): ArchiveSweeper DB adapter

Reads active wiki entries, delegates to computeArchivals, applies
UPDATE status='archived' in a transaction. Only touches source='wiki_pipeline';
rule knowledge untouched."
```

---

## Task 3：`SqliteWikiRetriever` query 过滤 `status='active'`

**Files:**
- Modify: `packages/adapters/src/storage/sqlite/sqlite-wiki-retriever.ts:36-59`
- Modify: `packages/adapters/src/storage/sqlite/__tests__/sqlite-wiki-retriever.test.ts`

- [ ] **Step 1: 写失败的测试**

把测试加在 `packages/adapters/src/storage/sqlite/__tests__/sqlite-wiki-retriever.test.ts` 现有 describe 块内：

```ts
describe("SqliteWikiRetriever.query() — archived entries excluded", () => {
  it("archived 条目不出现在结果", async () => {
    // 沿用该文件已有的 seed 辅助；若没有，用前面 archive-sweeper.test.ts 里的 seedEntry
    // 插一条 active 一条 archived，相同 embedding
    // 断言返回只含 active id
    // 具体 seed 代码按文件现有模式补全
  });
});
```

具体实现（需要看当前测试文件的 seed 方式）：

```ts
// 伪代码，引用当前测试文件的 seedWithEmbedding 或同等辅助
const { db, retriever } = setup();
// seed two entries, identical embeddings
seedWikiEntry(db, { id: "a-active", status: "active", embedding: [0.1, 0.2, ...] });
seedWikiEntry(db, { id: "b-archived", status: "archived", embedding: [0.1, 0.2, ...] });
const result = await retriever.query({
  embedding: [0.1, 0.2, ...],
  minSimilarity: 0.5,
  maxAgeDays: 365,
  maxResults: 10,
  now: new Date(),
  cooldownMinutes: 30,
  sessionWindowMinutes: 60,
  sessionMaxInjections: 15,
});
expect(result.map(r => r.knowledgeId)).toEqual(["a-active"]);
```

**如果现有测试文件里没有 seed 辅助**：先读 `sqlite-wiki-retriever.test.ts:45-50` 的 seed 逻辑，复用它把一条现有用例的 entry 改成 archived，验证就被过滤掉。

- [ ] **Step 2: 运行测试确认红**

```
pnpm --filter @teamagent/adapters test -- sqlite-wiki-retriever
```
预期：新用例失败，因为 archived 条目仍然返回。

- [ ] **Step 3: 补丁 query SQL**

`packages/adapters/src/storage/sqlite/sqlite-wiki-retriever.ts` 当前 36-59 行 SQL 里的 `FROM ... JOIN wiki_meta wm` 后加一个 JOIN：

```ts
      rows = this.db.prepare(`
        SELECT
          wm.knowledge_id,
          wm.tldr,
          wm.source_type,
          wm.published_at,
          (1 - vec_distance_cosine(kv.embedding, ?)) AS similarity
        FROM knowledge_vec kv
        JOIN wiki_meta wm ON kv.knowledge_id = wm.knowledge_id
        JOIN knowledge k  ON k.id = wm.knowledge_id AND k.status = 'active'
        WHERE
          wm.user_thumbs_down = 0
          AND (wm.last_injected_at IS NULL
               OR wm.last_injected_at < datetime(?, '-' || ? || ' minutes'))
          AND wm.published_at > datetime(?, '-' || ? || ' days')
          AND (1 - vec_distance_cosine(kv.embedding, ?)) >= ?
        ORDER BY similarity DESC
        LIMIT ?
      `).all(
```

- [ ] **Step 4: 运行测试确认绿**

```
pnpm --filter @teamagent/adapters test -- sqlite-wiki-retriever
```
预期：全部绿。

- [ ] **Step 5: commit**

```bash
git add packages/adapters/src/storage/sqlite/sqlite-wiki-retriever.ts packages/adapters/src/storage/sqlite/__tests__/sqlite-wiki-retriever.test.ts
git commit -m "fix(wiki): retriever filters status='active'

Archived wiki entries were still eligible for injection because the
vec-search JOIN ignored knowledge.status. Added JOIN constraint."
```

---

## Task 4：`wiki-last-pull.json` 标记文件

**为啥要**：`wiki-store.stats().lastPull` 用 `MAX(published_at)` — 那是条目的发布时间，不是"我们上次跑 pull 的时间"。debounce 需要真实的尝试时间戳。用独立标记文件，零 schema 迁移。

**Files:**
- Create: `packages/adapters/src/wiki/last-pull-marker.ts`
- Create: `packages/adapters/src/wiki/__tests__/last-pull-marker.test.ts`
- Modify: `packages/adapters/src/index.ts`

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LastPullMarker } from "../last-pull-marker.js";

describe("LastPullMarker", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "wiki-marker-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("read()：文件不存在返回 null", () => {
    const m = new LastPullMarker(dir);
    expect(m.read()).toBeNull();
  });

  it("write() 后 read() 能拿到", () => {
    const m = new LastPullMarker(dir);
    const now = new Date("2026-04-21T00:00:00Z");
    m.write({ attemptedAt: now, added: 3, archived: 1 });
    const r = m.read();
    expect(r).not.toBeNull();
    expect(r!.attemptedAt.toISOString()).toBe("2026-04-21T00:00:00.000Z");
    expect(r!.added).toBe(3);
    expect(r!.archived).toBe(1);
  });

  it("shouldSkip()：24h 内返回 true", () => {
    const m = new LastPullMarker(dir);
    m.write({ attemptedAt: new Date("2026-04-20T12:00:00Z"), added: 0, archived: 0 });
    expect(m.shouldSkip(new Date("2026-04-21T00:00:00Z"), 24)).toBe(true);
  });

  it("shouldSkip()：超过 24h 返回 false", () => {
    const m = new LastPullMarker(dir);
    m.write({ attemptedAt: new Date("2026-04-19T00:00:00Z"), added: 0, archived: 0 });
    expect(m.shouldSkip(new Date("2026-04-21T00:00:00Z"), 24)).toBe(false);
  });

  it("shouldSkip()：无标记文件返回 false（首次启动总跑）", () => {
    const m = new LastPullMarker(dir);
    expect(m.shouldSkip(new Date(), 24)).toBe(false);
  });

  it("损坏的 JSON：read 返回 null，不抛", () => {
    const m = new LastPullMarker(dir);
    // 直接写坏数据
    require("node:fs").writeFileSync(join(dir, "wiki-last-pull.json"), "not json");
    expect(m.read()).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认红**

```
pnpm --filter @teamagent/adapters test -- last-pull-marker
```

- [ ] **Step 3: 写实现**

```ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface LastPullRecord {
  attemptedAt: Date;
  added: number;
  archived: number;
}

interface RawRecord {
  attemptedAt: string;
  added: number;
  archived: number;
}

const FILE_NAME = "wiki-last-pull.json";

export class LastPullMarker {
  constructor(private baseDir: string) {}

  private path(): string {
    return join(this.baseDir, FILE_NAME);
  }

  read(): LastPullRecord | null {
    try {
      const raw = readFileSync(this.path(), "utf-8");
      const obj = JSON.parse(raw) as RawRecord;
      if (typeof obj.attemptedAt !== "string") return null;
      return {
        attemptedAt: new Date(obj.attemptedAt),
        added: obj.added ?? 0,
        archived: obj.archived ?? 0,
      };
    } catch {
      return null;
    }
  }

  write(rec: LastPullRecord): void {
    mkdirSync(this.baseDir, { recursive: true });
    const raw: RawRecord = {
      attemptedAt: rec.attemptedAt.toISOString(),
      added: rec.added,
      archived: rec.archived,
    };
    writeFileSync(this.path(), JSON.stringify(raw, null, 2), "utf-8");
  }

  shouldSkip(now: Date, debounceHours: number): boolean {
    const r = this.read();
    if (!r) return false;
    const elapsedMs = now.getTime() - r.attemptedAt.getTime();
    return elapsedMs < debounceHours * 3_600_000;
  }
}
```

- [ ] **Step 4: 确认绿**

```
pnpm --filter @teamagent/adapters test -- last-pull-marker
```

- [ ] **Step 5: 加导出 + commit**

```ts
// adapters/src/index.ts 末尾
export { LastPullMarker } from "./wiki/last-pull-marker.js";
export type { LastPullRecord } from "./wiki/last-pull-marker.js";
```

```bash
pnpm typecheck
git add packages/adapters/src/wiki/last-pull-marker.ts packages/adapters/src/wiki/__tests__/last-pull-marker.test.ts packages/adapters/src/index.ts
git commit -m "feat(wiki): LastPullMarker for 24h debounce

Tracks actual pipeline attempt time in .teamagent/wiki-last-pull.json.
wiki_meta.published_at is the entry's publish date, not our fetch time."
```

---

## Task 5：`bin-wiki-refresh.ts` — pull + sweep 入口

**Files:**
- Create: `packages/cli/src/wiki-refresh.ts` — 纯逻辑
- Create: `packages/cli/src/bin-wiki-refresh.ts` — entry（2 行 + main 调用）
- Create: `packages/cli/src/__tests__/wiki-refresh.test.ts`

**接口决定**：拆两文件避开 `require.main === module` 陷阱（vitest ESM 里 require 不存在；裸 `main()` 会在 test import 时自动触发）。
- `wiki-refresh.ts`：纯逻辑模块，只 export `runWikiRefresh`，**没有任何顶层副作用**
- `bin-wiki-refresh.ts`：薄 entry，不被任何测试 import，直接 `await runWikiRefresh(...)` + exit

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWikiRefresh } from "../wiki-refresh.js";

describe("runWikiRefresh", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "wiki-refresh-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("不存在 .teamagent 目录时：silent exit，不抛", async () => {
    await expect(runWikiRefresh({ cwd, force: false })).resolves.toBeDefined();
  });

  it("debounce 未过期：skip 不跑 pipeline", async () => {
    // 预先写好标记（shouldSkip=true）
    const teamagentDir = join(cwd, ".teamagent");
    require("node:fs").mkdirSync(teamagentDir, { recursive: true });
    require("node:fs").writeFileSync(
      join(teamagentDir, "wiki-last-pull.json"),
      JSON.stringify({ attemptedAt: new Date().toISOString(), added: 0, archived: 0 }),
    );
    const result = await runWikiRefresh({ cwd, force: false });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("debounced");
  });

  it("force=true 时忽略 debounce（只验证 debounce gate 被跳过）", async () => {
    // 单独测 debounce gate。runWikiRefresh 暴露一个测试 seam：
    // 通过 dependency injection 注入一个 fake pipeline factory。
    // 避免实跑 LLM/network/embedder。
    const teamagentDir = join(cwd, ".teamagent");
    require("node:fs").mkdirSync(teamagentDir, { recursive: true });
    require("node:fs").writeFileSync(
      join(teamagentDir, "wiki-last-pull.json"),
      JSON.stringify({ attemptedAt: new Date().toISOString(), added: 0, archived: 0 }),
    );

    const pipelineCalls: number[] = [];
    const result = await runWikiRefresh({
      cwd,
      force: true,
      _testDeps: {
        openDb: () => ({ close: () => {} } as any),
        runPipeline: async () => { pipelineCalls.push(1); return { added: 0, skipped: 0, rejected: 0, errors: [] }; },
        runSweep: () => ({ archived: [], byReason: { zeroHitAged: 0, sourceOverflow: 0 } }),
      },
    });

    expect(result.skipped).toBe(false);
    expect(pipelineCalls).toEqual([1]);   // force bypassed debounce
    // marker 被重写
    const raw = require("node:fs").readFileSync(join(teamagentDir, "wiki-last-pull.json"), "utf-8");
    const rewritten = JSON.parse(raw);
    expect(rewritten.attemptedAt).toBeTruthy();
  });

  it("debounce 生效时不调 pipeline（force=false）", async () => {
    const teamagentDir = join(cwd, ".teamagent");
    require("node:fs").mkdirSync(teamagentDir, { recursive: true });
    require("node:fs").writeFileSync(
      join(teamagentDir, "wiki-last-pull.json"),
      JSON.stringify({ attemptedAt: new Date().toISOString(), added: 0, archived: 0 }),
    );

    const pipelineCalls: number[] = [];
    const result = await runWikiRefresh({
      cwd,
      force: false,
      _testDeps: {
        openDb: () => ({ close: () => {} } as any),
        runPipeline: async () => { pipelineCalls.push(1); return { added: 0, skipped: 0, rejected: 0, errors: [] }; },
        runSweep: () => ({ archived: [], byReason: { zeroHitAged: 0, sourceOverflow: 0 } }),
      },
    });

    expect(result.skipped).toBe(true);
    expect(pipelineCalls).toEqual([]);   // debounced, no pipeline call
  });
});
```

- [ ] **Step 2: 运行测试确认红**

```
pnpm --filter @teamagent/cli test -- wiki-refresh
```
预期：`Cannot find module '../wiki-refresh.js'`。

- [ ] **Step 3: 写实现**

**文件 1**：`packages/cli/src/wiki-refresh.ts`（纯逻辑，可 import）

```ts
/**
 * wiki:refresh core logic. Exported for testing and CLI reuse.
 * NO top-level side effects — safe to import from tests.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { DatabaseSync } from "node:sqlite";

export interface TestDeps {
  openDb?: (p: string) => DatabaseSync;
  runPipeline?: (db: DatabaseSync) => Promise<{ added: number; skipped: number; rejected: number; errors: Array<{ source: string; error: string }> }>;
  runSweep?: (db: DatabaseSync, now: Date, opts: { zeroHitMinAgeDays?: number; perSourceKeep?: number }) => { archived: unknown[]; byReason: { zeroHitAged: number; sourceOverflow: number } };
}

export interface RefreshOptions {
  cwd: string;
  force: boolean;
  debounceHours?: number;
  zeroHitMinAgeDays?: number;
  perSourceKeep?: number;
  _testDeps?: TestDeps;
}

export interface RefreshResult {
  skipped: boolean;
  skipReason?: "debounced" | "db-missing";
  added: number;
  archived: number;
  errors: Array<{ stage: string; error: string }>;
}

const DEFAULT_DEBOUNCE_HOURS = 24;

export async function runWikiRefresh(opts: RefreshOptions): Promise<RefreshResult> {
  const result: RefreshResult = {
    skipped: false,
    added: 0,
    archived: 0,
    errors: [],
  };
  const teamagentDir = path.join(opts.cwd, ".teamagent");
  const debounceHours = opts.debounceHours ?? DEFAULT_DEBOUNCE_HOURS;

  // 1. debounce
  try {
    const { LastPullMarker } = await import("@teamagent/adapters");
    const marker = new LastPullMarker(teamagentDir);
    if (!opts.force && marker.shouldSkip(new Date(), debounceHours)) {
      return { ...result, skipped: true, skipReason: "debounced" };
    }
  } catch (e) {
    result.errors.push({ stage: "debounce-check", error: String(e) });
  }

  // 2. open db (silent fail → skip)
  let db: DatabaseSync;
  const dbPath = path.join(teamagentDir, "knowledge.db");
  try {
    const openDb = opts._testDeps?.openDb
      ?? (await import("@teamagent/adapters/storage/sqlite/schema")).openDb;
    db = openDb(dbPath);
  } catch (e) {
    result.errors.push({ stage: "open-db", error: String(e) });
    return { ...result, skipped: true, skipReason: "db-missing" };
  }

  // 3. pipeline.run()
  try {
    if (opts._testDeps?.runPipeline) {
      const report = await opts._testDeps.runPipeline(db);
      result.added = report.added;
      for (const e of report.errors) {
        result.errors.push({ stage: `pipeline:${e.source}`, error: e.error });
      }
    } else {
      const { ClaudeCodeLLMClient, XenovaEmbedder, WikiPipeline } = await import("@teamagent/adapters");
      const llm = new ClaudeCodeLLMClient();
      const embedder = new XenovaEmbedder();
      const pipeline = new WikiPipeline(db, llm, embedder);
      const report = await pipeline.run({});
      result.added = report.added;
      for (const e of report.errors) {
        result.errors.push({ stage: `pipeline:${e.source}`, error: e.error });
      }
    }
  } catch (e) {
    result.errors.push({ stage: "pipeline-run", error: String(e) });
  }

  // 4. sweeper
  try {
    const sweepFn = opts._testDeps?.runSweep ?? (async () => {
      const { ArchiveSweeper } = await import("@teamagent/adapters");
      return new ArchiveSweeper(db).sweep(new Date(), {
        zeroHitMinAgeDays: opts.zeroHitMinAgeDays,
        perSourceKeep: opts.perSourceKeep,
      });
    });
    const sweepReport = typeof sweepFn === "function" && sweepFn.length >= 2
      ? sweepFn(db, new Date(), { zeroHitMinAgeDays: opts.zeroHitMinAgeDays, perSourceKeep: opts.perSourceKeep })
      : await (sweepFn as () => Promise<any>)();
    result.archived = sweepReport.archived.length;
  } catch (e) {
    result.errors.push({ stage: "sweep", error: String(e) });
  }

  // 5. write marker
  try {
    const { LastPullMarker } = await import("@teamagent/adapters");
    new LastPullMarker(teamagentDir).write({
      attemptedAt: new Date(),
      added: result.added,
      archived: result.archived,
    });
  } catch (e) {
    result.errors.push({ stage: "marker-write", error: String(e) });
  }

  return result;
}

export async function logErrors(errors: Array<{ stage: string; error: string }>): Promise<void> {
  if (errors.length === 0) return;
  try {
    const logPath = path.join(os.homedir(), ".teamagent", "wiki-refresh-errors.log");
    mkdirSync(path.dirname(logPath), { recursive: true });
    const line = `[${new Date().toISOString()}] ${JSON.stringify(errors)}\n`;
    appendFileSync(logPath, line, "utf-8");
  } catch { /* silent */ }
}
```

**文件 2**：`packages/cli/src/bin-wiki-refresh.ts`（entry 薄壳，不被 import）

```ts
#!/usr/bin/env node
import { runWikiRefresh, logErrors } from "./wiki-refresh.js";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const cwd = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  const result = await runWikiRefresh({ cwd, force });

  if (result.skipped) {
    process.stdout.write(`wiki:refresh skipped (${result.skipReason})\n`);
  } else {
    process.stdout.write(
      `wiki:refresh done — added: ${result.added}, archived: ${result.archived}, errors: ${result.errors.length}\n`,
    );
  }
  await logErrors(result.errors);
}

main().catch(() => process.exit(0));
```

- [ ] **Step 4: 确认绿**

```
pnpm --filter @teamagent/cli test -- wiki-refresh
```

- [ ] **Step 5: 把 `wiki:refresh` 接进 bin.ts**

在 `packages/cli/src/bin.ts` 内找到其他 `case "wiki:..."` 分支附近加：

```ts
case "wiki:refresh": {
  const { runWikiRefresh } = await import("./wiki-refresh.js");
  const force = args.includes("--force");
  const result = await runWikiRefresh({ cwd: process.cwd(), force });
  if (result.skipped) {
    process.stdout.write(`wiki:refresh skipped (${result.skipReason})\n`);
  } else {
    process.stdout.write(
      `wiki:refresh done — added: ${result.added}, archived: ${result.archived}\n`,
    );
  }
  break;
}
```

（具体位置看 bin.ts 实际 switch 结构，`args` 变量名按当前文件风格用）

同时在 help 文本里加一行：
```
"  teamagent wiki:refresh [--force]  立即拉取 + 清理（24h debounce，--force 强制）",
```

- [ ] **Step 6: commit**

```bash
pnpm typecheck
git add packages/cli/src/wiki-refresh.ts packages/cli/src/bin-wiki-refresh.ts packages/cli/src/__tests__/wiki-refresh.test.ts packages/cli/src/bin.ts
git commit -m "feat(wiki): wiki-refresh logic + bin entry

Split to avoid require.main trap: wiki-refresh.ts (pure logic, imported
by tests) + bin-wiki-refresh.ts (thin entry, never imported).
TestDeps seam for unit tests bypasses LLM/network."
```

---

## Task 6：`bin-session-start.ts` — SessionStart hook，detached spawn

**Files:**
- Create: `packages/cli/src/session-start-logic.ts` — 纯逻辑
- Create: `packages/cli/src/bin-session-start.ts` — entry 薄壳
- Create: `packages/cli/src/__tests__/session-start-logic.test.ts`

- [ ] **Step 1: 写测试**

此 hook 主体是 spawn 子进程，不适合做业务逻辑单测。测试拆两层：

1. 导出一个 `decideAction(cwd, now, debounceHours): "spawn" | "skip-debounced" | "skip-no-db"` 纯函数；测它
2. `main()` 本身保持薄壳，不直接测

测试文件：

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideAction } from "../session-start-logic.js";

describe("decideAction", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "ss-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("无 .teamagent/knowledge.db → skip-no-db", () => {
    const action = decideAction(cwd, new Date(), 24);
    expect(action).toBe("skip-no-db");
  });

  it("有 db 无 marker → spawn（首次）", () => {
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    writeFileSync(join(cwd, ".teamagent", "knowledge.db"), "");
    expect(decideAction(cwd, new Date(), 24)).toBe("spawn");
  });

  it("marker 在 24h 内 → skip-debounced", () => {
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    writeFileSync(join(cwd, ".teamagent", "knowledge.db"), "");
    writeFileSync(
      join(cwd, ".teamagent", "wiki-last-pull.json"),
      JSON.stringify({ attemptedAt: new Date().toISOString(), added: 0, archived: 0 }),
    );
    expect(decideAction(cwd, new Date(), 24)).toBe("skip-debounced");
  });

  it("marker 在 24h 外 → spawn", () => {
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    writeFileSync(join(cwd, ".teamagent", "knowledge.db"), "");
    const stale = new Date(Date.now() - 25 * 3_600_000);
    writeFileSync(
      join(cwd, ".teamagent", "wiki-last-pull.json"),
      JSON.stringify({ attemptedAt: stale.toISOString(), added: 0, archived: 0 }),
    );
    expect(decideAction(cwd, new Date(), 24)).toBe("spawn");
  });
});
```

- [ ] **Step 2: 运行确认红**

```
pnpm --filter @teamagent/cli test -- session-start-logic
```

- [ ] **Step 3: 写实现（逻辑文件，可被测试 import）**

`packages/cli/src/session-start-logic.ts`：

```ts
/**
 * SessionStart logic. No top-level side effects — safe to import from tests.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { LastPullMarker } from "@teamagent/adapters";

export const DEFAULT_DEBOUNCE_HOURS = 24;

export type Action = "spawn" | "skip-debounced" | "skip-no-db";

export function decideAction(cwd: string, now: Date, debounceHours: number): Action {
  const dbPath = join(cwd, ".teamagent", "knowledge.db");
  if (!existsSync(dbPath)) return "skip-no-db";
  const marker = new LastPullMarker(join(cwd, ".teamagent"));
  return marker.shouldSkip(now, debounceHours) ? "skip-debounced" : "spawn";
}

export function findRefreshBin(): string {
  // Hook runs from %TEMP%; sibling bin-wiki-refresh.cjs lives next to this file.
  return join(__dirname, "bin-wiki-refresh.cjs");
}

export function spawnRefresh(cwd: string): void {
  const child = spawn(process.execPath, [findRefreshBin()], {
    detached: true,
    stdio: "ignore",
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
    windowsHide: true,
  });
  child.unref();
}

export function logError(kind: string, err: unknown): void {
  try {
    const logPath = join(os.homedir(), ".teamagent", "wiki-refresh-errors.log");
    appendFileSync(logPath, `[${new Date().toISOString()}] session-start:${kind} ${String(err)}\n`, "utf-8");
  } catch { /* silent */ }
}
```

- [ ] **Step 3b: 写 entry（bin-session-start.ts，不被 import）**

```ts
#!/usr/bin/env node
/**
 * SessionStart Hook entry. NEVER blocks UI. NEVER exits non-zero.
 */
import { decideAction, spawnRefresh, logError, DEFAULT_DEBOUNCE_HOURS } from "./session-start-logic.js";

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8").trim();

  let cwd = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  if (raw) {
    try {
      const input = JSON.parse(raw) as { cwd?: string };
      if (input.cwd) cwd = input.cwd;
    } catch { /* fallback */ }
  }

  const action = decideAction(cwd, new Date(), DEFAULT_DEBOUNCE_HOURS);
  if (action === "spawn") {
    try { spawnRefresh(cwd); } catch (e) { logError("spawn-failed", e); }
  }
}

main().catch((e) => { logError("main-crash", e); process.exit(0); });
```
```

- [ ] **Step 4: 确认绿**

```
pnpm --filter @teamagent/cli test -- session-start-logic
```

- [ ] **Step 5: commit**

```bash
pnpm typecheck
git add packages/cli/src/session-start-logic.ts packages/cli/src/bin-session-start.ts packages/cli/src/__tests__/session-start-logic.test.ts
git commit -m "feat(wiki): SessionStart hook — fire-and-forget refresh spawn

Split session-start-logic.ts (testable) + bin-session-start.ts (entry).
24h debounce on .teamagent/wiki-last-pull.json; detached subprocess with
windowsHide + stdio:ignore (Windows black-window pitfall). Never blocks UI."
```

---

## Task 7：打包 + 注册 hook

**Files:**
- Modify: `packages/cli/tsup.hook.config.ts`
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: 加 tsup entry**

`packages/cli/tsup.hook.config.ts` 的 `entry` 对象加两行：

```ts
entry: {
  "bin-pre-tool-use":       "src/bin-pre-tool-use.ts",
  "bin-post-tool-use":      "src/bin-post-tool-use.ts",
  "bin-user-prompt-submit": "src/bin-user-prompt-submit.ts",
  "bin-stop":               "src/bin-stop.ts",
  "bin-session-end":        "src/bin-session-end.ts",
  "bin-pre-compact":        "src/bin-pre-compact.ts",
  "bin-session-start":      "src/bin-session-start.ts",  // 新增
  "bin-wiki-refresh":       "src/bin-wiki-refresh.ts",   // 新增
},
```

- [ ] **Step 2: 构建**

```bash
pnpm --filter @teamagent/cli build:hook
```

验证：`packages/cli/dist/bin-session-start.cjs` 和 `packages/cli/dist/bin-wiki-refresh.cjs` 存在。

```bash
ls packages/cli/dist/bin-session-start.cjs packages/cli/dist/bin-wiki-refresh.cjs
```

- [ ] **Step 3: 注册 SessionStart hook**

编辑 `.claude/settings.local.json`，在 `"hooks"` 对象内、`"SessionEnd"` 之前加一节：

```json
    "SessionStart": [
      {
        "_teamagentTag": "teamagent-session-start",
        "hooks": [
          {
            "type": "command",
            "command": "node C:/bzli/teamagent/packages/cli/dist/bin-session-start.cjs",
            "timeout": 5
          }
        ]
      }
    ],
```

- [ ] **Step 4: 烟雾测试——直接跑 bin-session-start.cjs**

```bash
echo '{}' | node C:/bzli/teamagent/packages/cli/dist/bin-session-start.cjs
```

期望：静默 exit 0（因为 `.teamagent/wiki-last-pull.json` 最近刚写过则 skip-debounced；或首次会 spawn 子进程，几秒后 marker 写入）。

验证 marker 写入：

```bash
cat .teamagent/wiki-last-pull.json
```

- [ ] **Step 5: commit**

```bash
git add packages/cli/tsup.hook.config.ts .claude/settings.local.json
git commit -m "feat(wiki): wire SessionStart hook + build wiki-refresh entry

Registers bin-session-start.cjs; tsup bundles two new entries alongside
existing hook bins."
```

---

## Task 11：Walking skeleton 验证

- [ ] **Step 1: 全量测试**

```bash
pnpm test
```
预期：全绿。任何红都修到绿，不允许带 failing 测试进入下一步。

- [ ] **Step 2: 全量 typecheck**

```bash
pnpm typecheck
```
预期：全绿。

- [ ] **Step 3: 手动刷新跑通**

```bash
pnpm teamagent wiki:refresh --force
```
预期：输出 `wiki:refresh done — added: N, archived: N`。

- [ ] **Step 4: 验库状态**

```bash
sqlite3 .teamagent/knowledge.db "SELECT status, COUNT(*) FROM knowledge WHERE source='wiki_pipeline' GROUP BY status;"
```

如果 vitest 版本 > 3 个，期望 active=3, archived=N。若只有 2 个则 archived=0（符合 per-source-keep=3）。

- [ ] **Step 5: 验 list 不含 archived**

```bash
pnpm teamagent wiki:list --limit 50
```
archived 条目不应出现。

- [ ] **Step 6: 真·SessionStart 触发**

关闭当前 Claude Code 窗口，重开同项目。
检查 `.teamagent/wiki-last-pull.json` 的 `attemptedAt` 是否更新到当前时刻附近（或若 24h 内不更新则符合 debounce）。
强制刷新：先删 marker 再启动 CC：

```bash
rm .teamagent/wiki-last-pull.json
# 重启 CC
```
几秒后应看到 marker 重新出现。

- [ ] **Step 7: 归因事件 / status line 观察**

启动 CC 时观察 status line 是否显示 `wiki.refresh.*` 归因（如有接线；若未接线，本 plan 不涉及，作为后续 polish）。

- [ ] **Step 8: 更新 memory 记录闭环（手动）**

在 CC 内说一句 "/pitfall"（或直接让系统记录）把此次学到的坑记下来：
- `wiki-store.stats().lastPull` 是 `MAX(published_at)`，并非真实 pull 时间 —— 不能用于 debounce
- SessionStart hook 与 Stop hook 一样必须 `windowsHide + detached + stdio:ignore`

（此步非代码变更，无需 commit。但验证人工走一遍让系统学到。）

---

## Task 9：AttributionBus 事件接入（spec §6.5）

**Files:**
- Modify: `packages/types/src/attribution.ts` — 扩 `source` union
- Modify: `packages/cli/src/wiki-refresh.ts` — 接受 `bus` 参数并 emit
- Modify: `packages/cli/src/bin-wiki-refresh.ts` — 实例化 bus + renderer
- Create: `packages/cli/src/__tests__/wiki-refresh-events.test.ts`

**背景**：
- `AttributionEvent.source` 当前是闭合 union，不含 wiki。CLAUDE.md 强制所有"系统帮你做了什么"通过 bus emit。
- 跨进程 bus 还不存在（spec 说 M2 才有 jsonl adapter）。spawned subprocess 自用 in-memory bus 就好，stdout 被 spawner ignore 但事件 emit 了；未来 JsonlBus 来接手。

- [ ] **Step 1: 扩 AttributionEvent.source union**

`packages/types/src/attribution.ts:7-22` 的 `source` union 尾部加 `"wiki-refresh"`：

```ts
  source:
    | "pitfall"
    | "compiler"
    | "hook-pre"
    | "hook-post"
    | "detector"
    | "extractor"
    | "importer"
    | "init"
    | "calibrator"
    | "scenario-runner"
    | "skeleton"
    | "ingest"
    | "validator"
    | "compile"
    | "wiki-refresh";
```

运行 `pnpm typecheck`，确认无回归。

- [ ] **Step 2: 写事件 emit 测试**

`packages/cli/src/__tests__/wiki-refresh-events.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryAttributionBus } from "@teamagent/adapters";
import { runWikiRefresh } from "../wiki-refresh.js";

describe("runWikiRefresh — AttributionBus events", () => {
  let cwd: string;
  let bus: InMemoryAttributionBus;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "wiki-ev-"));
    bus = new InMemoryAttributionBus();
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("debounced 时 emit wiki-refresh/skipped", async () => {
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    writeFileSync(
      join(cwd, ".teamagent", "wiki-last-pull.json"),
      JSON.stringify({ attemptedAt: new Date().toISOString(), added: 0, archived: 0 }),
    );
    await runWikiRefresh({ cwd, force: false, bus });
    const events = bus.drain();
    const actions = events.map((e) => `${e.source}/${e.action}`);
    expect(actions).toContain("wiki-refresh/skipped");
  });

  it("成功跑 pipeline+sweep 时 emit started + completed + archived", async () => {
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    await runWikiRefresh({
      cwd,
      force: true,
      bus,
      _testDeps: {
        openDb: () => ({ close: () => {} } as any),
        runPipeline: async () => ({ added: 2, skipped: 0, rejected: 0, errors: [] }),
        runSweep: () => ({ archived: [{ knowledgeId: "x", reason: "zero-hit-aged" as const }], byReason: { zeroHitAged: 1, sourceOverflow: 0 } }),
      },
    });
    const actions = bus.drain().map((e) => `${e.source}/${e.action}`);
    expect(actions).toContain("wiki-refresh/started");
    expect(actions).toContain("wiki-refresh/completed");
    expect(actions).toContain("wiki-refresh/archived");
  });
});
```

- [ ] **Step 3: 运行确认红**

```
pnpm --filter @teamagent/cli test -- wiki-refresh-events
```

- [ ] **Step 4: 改 wiki-refresh.ts 接 bus**

在 `RefreshOptions` 加 `bus?: AttributionBus`。import：
```ts
import type { AttributionBus } from "@teamagent/ports";
import type { AttributionEvent } from "@teamagent/types";
```

新增 helper：
```ts
function emit(bus: AttributionBus | undefined, action: string, detail: Partial<AttributionEvent> = {}): void {
  if (!bus) return;
  bus.emit({
    source: "wiki-refresh",
    action,
    severity: detail.severity ?? "info",
    timestamp: new Date().toISOString(),
    ...detail,
  });
}
```

在 runWikiRefresh 的 5 个关键点调 emit：
- 开始处（debounce 检查前）：`emit(bus, "started")`
- debounce 命中：`emit(bus, "skipped", { target: { count: 1 }, userFacingValue: "wiki 24h 内刚刷过，跳过" })` + `return`
- db-missing：`emit(bus, "skipped", { userFacingValue: "没有 knowledge.db，跳过" })`
- pipeline+sweep 完成后：`emit(bus, "completed", { target: { count: result.added }, userFacingValue: \`新增 ${result.added} 条 wiki\` })`
- 归档 > 0 时：`emit(bus, "archived", { target: { count: result.archived }, userFacingValue: \`归档 ${result.archived} 条过时 wiki\` })`

- [ ] **Step 5: 运行确认绿**

```
pnpm --filter @teamagent/cli test -- wiki-refresh
```

- [ ] **Step 6: bin-wiki-refresh.ts 实例化 bus + renderer**

```ts
#!/usr/bin/env node
import { runWikiRefresh, logErrors } from "./wiki-refresh.js";
import { InMemoryAttributionBus } from "@teamagent/adapters";
import { renderEventsToStdout } from "@teamagent/adapters"; // 若导出了；否则查阅当前 renderer API

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const cwd = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  const bus = new InMemoryAttributionBus();

  const result = await runWikiRefresh({ cwd, force, bus });
  await logErrors(result.errors);

  // 渲染事件到 stdout；spawner 若 ignore 了 stdio 也无妨，bus 已经 emit 过了。
  const events = bus.drain();
  renderEventsToStdout(events); // 按现有 renderer API；若 API 不同，按实际调用
}
main().catch(() => process.exit(0));
```

> **实施要点**：`renderEventsToStdout` 若不存在，查 `packages/adapters/src/attribution/stdout-renderer.ts` 的导出 API，按实际名字调用。子任务：先 Read 该文件，匹配它的函数签名（可能是 `new StdoutRenderer().render(events)` 或类似）。

- [ ] **Step 7: commit**

```bash
pnpm typecheck && pnpm test -- wiki-refresh
git add packages/types/src/attribution.ts packages/cli/src/wiki-refresh.ts packages/cli/src/bin-wiki-refresh.ts packages/cli/src/__tests__/wiki-refresh-events.test.ts
git commit -m "feat(wiki): emit AttributionBus events from wiki-refresh

Extends AttributionEvent.source union to include 'wiki-refresh'. Threads
optional bus through runWikiRefresh; bin-wiki-refresh instantiates
InMemoryAttributionBus + renders to stdout. Cross-process jsonl bus
(spec M2) not yet available — subprocess events stay in-process for now."
```

---

## Task 10：`.teamagent/config.json` 读取（spec §7）

**Files:**
- Create: `packages/adapters/src/wiki/config-loader.ts`
- Create: `packages/adapters/src/wiki/__tests__/config-loader.test.ts`
- Modify: `packages/adapters/src/index.ts`
- Modify: `packages/cli/src/wiki-refresh.ts` — 优先用 config 值
- Modify: `packages/cli/src/session-start-logic.ts` — decideAction 取 debounceHours from config

**Config schema**（和 spec §7 一致）：

```json
{
  "wiki": {
    "autoRefresh": { "enabled": true, "debounceHours": 24 },
    "sweep":       { "enabled": true, "zeroHitMinAgeDays": 60, "perSourceKeep": 3 }
  }
}
```

缺失字段走默认。`autoRefresh.enabled = false` → SessionStart 不 spawn；`sweep.enabled = false` → refresh 跑 pipeline 但不跑 sweep。

- [ ] **Step 1: 写测试**

`packages/adapters/src/wiki/__tests__/config-loader.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWikiConfig, DEFAULT_WIKI_CONFIG } from "../config-loader.js";

describe("loadWikiConfig", () => {
  let cwd: string;
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), "wiki-conf-")); });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("缺 .teamagent/config.json → 默认", () => {
    expect(loadWikiConfig(cwd)).toEqual(DEFAULT_WIKI_CONFIG);
  });

  it("缺 wiki 节 → 默认", () => {
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    writeFileSync(join(cwd, ".teamagent", "config.json"), JSON.stringify({ other: "x" }));
    expect(loadWikiConfig(cwd)).toEqual(DEFAULT_WIKI_CONFIG);
  });

  it("部分覆盖 debounceHours", () => {
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    writeFileSync(join(cwd, ".teamagent", "config.json"),
      JSON.stringify({ wiki: { autoRefresh: { debounceHours: 6 } } }));
    const c = loadWikiConfig(cwd);
    expect(c.autoRefresh.debounceHours).toBe(6);
    expect(c.autoRefresh.enabled).toBe(true);           // 缺省保留
    expect(c.sweep).toEqual(DEFAULT_WIKI_CONFIG.sweep); // 整节缺省保留
  });

  it("autoRefresh.enabled=false", () => {
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    writeFileSync(join(cwd, ".teamagent", "config.json"),
      JSON.stringify({ wiki: { autoRefresh: { enabled: false } } }));
    expect(loadWikiConfig(cwd).autoRefresh.enabled).toBe(false);
  });

  it("损坏 JSON → 默认，不抛", () => {
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    writeFileSync(join(cwd, ".teamagent", "config.json"), "not json");
    expect(loadWikiConfig(cwd)).toEqual(DEFAULT_WIKI_CONFIG);
  });

  it("非法类型字段 → 落回该字段默认", () => {
    mkdirSync(join(cwd, ".teamagent"), { recursive: true });
    writeFileSync(join(cwd, ".teamagent", "config.json"),
      JSON.stringify({ wiki: { autoRefresh: { debounceHours: "bad" } } }));
    expect(loadWikiConfig(cwd).autoRefresh.debounceHours).toBe(24);
  });
});
```

- [ ] **Step 2: 运行确认红**

```
pnpm --filter @teamagent/adapters test -- config-loader
```

- [ ] **Step 3: 写实现**

`packages/adapters/src/wiki/config-loader.ts`：

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface WikiConfig {
  autoRefresh: { enabled: boolean; debounceHours: number };
  sweep: { enabled: boolean; zeroHitMinAgeDays: number; perSourceKeep: number };
}

export const DEFAULT_WIKI_CONFIG: WikiConfig = {
  autoRefresh: { enabled: true, debounceHours: 24 },
  sweep: { enabled: true, zeroHitMinAgeDays: 60, perSourceKeep: 3 },
};

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function loadWikiConfig(cwd: string): WikiConfig {
  try {
    const raw = readFileSync(join(cwd, ".teamagent", "config.json"), "utf-8");
    const obj = JSON.parse(raw) as { wiki?: { autoRefresh?: Record<string, unknown>; sweep?: Record<string, unknown> } };
    const ar = obj.wiki?.autoRefresh ?? {};
    const sw = obj.wiki?.sweep ?? {};
    return {
      autoRefresh: {
        enabled: bool(ar.enabled, DEFAULT_WIKI_CONFIG.autoRefresh.enabled),
        debounceHours: num(ar.debounceHours, DEFAULT_WIKI_CONFIG.autoRefresh.debounceHours),
      },
      sweep: {
        enabled: bool(sw.enabled, DEFAULT_WIKI_CONFIG.sweep.enabled),
        zeroHitMinAgeDays: num(sw.zeroHitMinAgeDays, DEFAULT_WIKI_CONFIG.sweep.zeroHitMinAgeDays),
        perSourceKeep: num(sw.perSourceKeep, DEFAULT_WIKI_CONFIG.sweep.perSourceKeep),
      },
    };
  } catch {
    return DEFAULT_WIKI_CONFIG;
  }
}
```

- [ ] **Step 4: 确认绿 + 加导出**

```
pnpm --filter @teamagent/adapters test -- config-loader
```

`packages/adapters/src/index.ts` 加：
```ts
export { loadWikiConfig, DEFAULT_WIKI_CONFIG } from "./wiki/config-loader.js";
export type { WikiConfig } from "./wiki/config-loader.js";
```

- [ ] **Step 5: 让 `runWikiRefresh` 使用 config**

在 `wiki-refresh.ts` 里：
1. 顶部 import `loadWikiConfig` 从 `@teamagent/adapters`
2. 函数开头加载：`const cfg = loadWikiConfig(opts.cwd);`
3. debounce 阈值：`const debounceHours = opts.debounceHours ?? cfg.autoRefresh.debounceHours;`
4. sweeper 参数：优先 `opts.zeroHitMinAgeDays ?? cfg.sweep.zeroHitMinAgeDays`、`opts.perSourceKeep ?? cfg.sweep.perSourceKeep`
5. 若 `cfg.sweep.enabled === false`：跳 sweep 步骤（记一行 info 事件：`emit(bus, "sweep-disabled")`）

补一个测试：`wiki-refresh.test.ts` 追加：

```ts
it("sweep.enabled=false → 不跑 sweep", async () => {
  const teamagentDir = join(cwd, ".teamagent");
  mkdirSync(teamagentDir, { recursive: true });
  writeFileSync(join(teamagentDir, "config.json"),
    JSON.stringify({ wiki: { sweep: { enabled: false } } }));
  const sweepCalls: number[] = [];
  await runWikiRefresh({
    cwd,
    force: true,
    _testDeps: {
      openDb: () => ({ close: () => {} } as any),
      runPipeline: async () => ({ added: 0, skipped: 0, rejected: 0, errors: [] }),
      runSweep: () => { sweepCalls.push(1); return { archived: [], byReason: { zeroHitAged: 0, sourceOverflow: 0 } }; },
    },
  });
  expect(sweepCalls).toEqual([]);
});
```

- [ ] **Step 6: 让 `decideAction` 也读 config**

改 `session-start-logic.ts`：

```ts
export function decideAction(cwd: string, now: Date, debounceHours?: number): Action {
  const dbPath = join(cwd, ".teamagent", "knowledge.db");
  if (!existsSync(dbPath)) return "skip-no-db";
  const cfg = loadWikiConfig(cwd);
  if (!cfg.autoRefresh.enabled) return "skip-debounced"; // 用同一个 skip 值；也可新增 "skip-disabled"
  const hours = debounceHours ?? cfg.autoRefresh.debounceHours;
  const marker = new LastPullMarker(join(cwd, ".teamagent"));
  return marker.shouldSkip(now, hours) ? "skip-debounced" : "spawn";
}
```

同时把 Action 扩展到 `"spawn" | "skip-debounced" | "skip-no-db" | "skip-disabled"`，给 hook 一个明确语义；然后更新 `session-start-logic.test.ts` 加一个测试：

```ts
it("autoRefresh.enabled=false → skip-disabled", () => {
  mkdirSync(join(cwd, ".teamagent"), { recursive: true });
  writeFileSync(join(cwd, ".teamagent", "knowledge.db"), "");
  writeFileSync(join(cwd, ".teamagent", "config.json"),
    JSON.stringify({ wiki: { autoRefresh: { enabled: false } } }));
  expect(decideAction(cwd, new Date())).toBe("skip-disabled");
});
```

- [ ] **Step 7: 跑全部相关测试**

```
pnpm --filter @teamagent/adapters test -- config-loader
pnpm --filter @teamagent/cli test -- wiki-refresh session-start-logic
```

- [ ] **Step 8: commit**

```bash
pnpm typecheck
git add packages/adapters/src/wiki/config-loader.ts packages/adapters/src/wiki/__tests__/config-loader.test.ts packages/adapters/src/index.ts packages/cli/src/wiki-refresh.ts packages/cli/src/session-start-logic.ts packages/cli/src/__tests__/wiki-refresh.test.ts packages/cli/src/__tests__/session-start-logic.test.ts
git commit -m "feat(wiki): read .teamagent/config.json for wiki settings

Per-project override of debounceHours, zeroHitMinAgeDays, perSourceKeep,
and enabled flags. Missing/malformed config falls back to defaults.
autoRefresh.enabled=false surfaces skip-disabled action at SessionStart."
```

---

---

## Self-Review 清单

**Spec 覆盖（逐条）**：
- [x] §5 架构：Task 6 (SessionStart hook) + Task 5 (bin-wiki-refresh) + Task 2 (ArchiveSweeper)
- [x] §6.1 bin-session-start：Task 6
- [x] §6.2 bin-wiki-refresh：Task 5
- [x] §6.3 ArchiveSweeper pure fn + adapter：Task 1 + 2
- [x] §6.4 Retriever 补丁：Task 3
- [x] §6.5 归因事件：Task 9 — 扩 `source` union + threaded bus + stdout renderer
- [x] §7 配置面：Task 10 — `loadWikiConfig` 读 .teamagent/config.json，贯通到 refresh/session-start
- [x] §8 错误处理：Task 5 try-catch 覆盖每阶段；Task 6 spawn 失败记日志
- [x] §9 测试策略：Task 1-10 都有 unit test；E2E 放 Task 11 手动
- [x] §10 迁移：0 schema migration（Task 7 只改 tsup + settings）
- [x] §11 Walking skeleton 清单：Task 11

**Gap 总结**（2026-04-21 更新 rev2）：
- §6.5 归因事件：Task 9 覆盖（扩 union + bus 接入 + renderer）
- §7 config.json：Task 10 覆盖（loadWikiConfig + 贯通）
- 已知悬而未决：跨进程 bus（spec 承诺 M2 的 JsonlAttributionBus）不在本批 scope；spawned subprocess 事件留在 subprocess 内，未来 M2 补齐

**Placeholder 扫描**：通过（所有 step 都有完整代码/命令/预期）。

**类型一致性**：`computeArchivals`/`ArchiveSweeper`/`runWikiRefresh` 签名在引用处一致；`ArchiveReason` / `RefreshResult` / `Action` 命名一致。
