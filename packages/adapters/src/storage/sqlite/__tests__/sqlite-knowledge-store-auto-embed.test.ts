import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../schema.js";
import { SqliteKnowledgeStore } from "../sqlite-knowledge-store.js";
import type { KnowledgeEntry } from "@teamagent/types";
import type { RuleEmbedder } from "@teamagent/ports";

/**
 * Auto-embedding contract: when a RuleEmbedder is injected and the entry has
 * trigger_description / pattern_description / tool_context_description, the
 * store automatically writes vec0 rows on insert/update and stamps
 * embedder_model_id. This closes the gap that previously required a manual
 * `pnpm teamagent migrate-v6` after every new rule.
 */

class StubEmbedder implements RuleEmbedder {
  readonly dim = 384;
  readonly modelId = "stub-embedder/v1";
  callCount = 0;
  constructor(private readonly fillValue = 0.1) {}
  async embed(texts: string[]): Promise<number[][]> {
    this.callCount += 1;
    return texts.map(() => Array.from(new Float32Array(this.dim).fill(this.fillValue)));
  }
}

describe("SqliteKnowledgeStore auto-embedding", () => {
  let store: SqliteKnowledgeStore;
  let dbPath: string;
  let embedder: StubEmbedder;

  beforeEach(() => {
    dbPath = join(mkdtempSync(join(tmpdir(), "m4b-auto-embed-")), "t.db");
    embedder = new StubEmbedder();
    store = new SqliteKnowledgeStore(openDb(dbPath), { embedder });
  });

  it("addWithEmbedding writes trigger_vec + pattern_vec + stamps embedder_model_id", async () => {
    const e = mkEntry({
      id: "auto-1",
      trigger_description: "需要发起 HTTP 请求",
      pattern_description: "使用 axios 库",
    });
    await store.addWithEmbedding(e);

    const db = (store as any).db;
    const trigRow = db.prepare("SELECT id FROM knowledge_trigger_vec WHERE id=?").get("auto-1");
    const patRow = db.prepare("SELECT id FROM knowledge_pattern_vec WHERE id=?").get("auto-1");
    expect(trigRow).toBeTruthy();
    expect(patRow).toBeTruthy();

    const [stored] = await store.byIds(["auto-1"]);
    expect(stored?.embedder_model_id).toBe("stub-embedder/v1");
    expect(embedder.callCount).toBeGreaterThan(0);
  });

  it("addWithEmbedding skips vec write when descriptions are empty", async () => {
    const e = mkEntry({ id: "auto-2", trigger_description: "", pattern_description: "" });
    await store.addWithEmbedding(e);

    const db = (store as any).db;
    const trigRow = db.prepare("SELECT id FROM knowledge_trigger_vec WHERE id=?").get("auto-2");
    expect(trigRow).toBeFalsy();
    expect(embedder.callCount).toBe(0);
  });

  it("updateWithEmbedding refreshes vec rows on description change", async () => {
    await store.addWithEmbedding(
      mkEntry({
        id: "auto-3",
        trigger_description: "old trigger",
        pattern_description: "old pattern",
      }),
    );
    expect(embedder.callCount).toBe(1);

    await store.updateWithEmbedding("auto-3", {
      trigger_description: "new trigger",
      pattern_description: "new pattern",
    });
    expect(embedder.callCount).toBe(2);

    const db = (store as any).db;
    const count = db
      .prepare("SELECT COUNT(*) as c FROM knowledge_trigger_vec WHERE id=?")
      .get("auto-3") as { c: number };
    expect(count.c).toBe(1); // replaced, not duplicated
  });

  it("falls back gracefully when embedder is absent (legacy add path still works)", async () => {
    const plainStore = new SqliteKnowledgeStore(openDb(dbPath));
    plainStore.add(mkEntry({ id: "auto-4", trigger_description: "x", pattern_description: "y" }));
    const [got] = await plainStore.byIds(["auto-4"]);
    expect(got?.id).toBe("auto-4");
    // No embedder → no vec rows → no embedder_model_id stamp
    const db = (plainStore as any).db;
    const trigRow = db.prepare("SELECT id FROM knowledge_trigger_vec WHERE id=?").get("auto-4");
    expect(trigRow).toBeFalsy();
  });

  it("addWithEmbedding survives embedder failure without losing the row", async () => {
    const failingEmbedder: RuleEmbedder = {
      dim: 384,
      modelId: "failing/v1",
      async embed(): Promise<number[][]> {
        throw new Error("boom");
      },
    };
    const failingStore = new SqliteKnowledgeStore(openDb(dbPath), { embedder: failingEmbedder });
    await failingStore.addWithEmbedding(
      mkEntry({ id: "auto-5", trigger_description: "x", pattern_description: "y" }),
    );
    // Row must still be persisted even if embedding fails — fall back to migrate-v6 later.
    const [got] = await failingStore.byIds(["auto-5"]);
    expect(got?.id).toBe("auto-5");
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
    source: "accumulated",
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
