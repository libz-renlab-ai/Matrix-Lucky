import { describe, it, expect } from "vitest";
import { accumulateHardNegative, MAX_HARD_NEG } from "../hard-negative-accumulator.js";
import type { KnowledgeEntry } from "@teamagent/types";
import type { RuleEmbedder } from "@teamagent/ports";
import type { KnowledgeStore } from "@teamagent/ports";

// Simple stub embedder (4-dim)
const stubEmbedder: RuleEmbedder = {
  modelId: "test",
  dim: 4,
  async embed(texts) {
    return texts.map((t) => {
      const v = [0.5, 0.5, 0.5, 0.5];
      v[0] = (v[0] ?? 0) + t.length * 0.01;
      const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      return v.map((x) => x / n);
    });
  },
};

function makeStore(initial: Partial<KnowledgeEntry>): {
  store: KnowledgeStore;
  updated: () => KnowledgeEntry | undefined;
} {
  let stored: KnowledgeEntry | undefined;
  const rule: KnowledgeEntry = {
    id: "r1",
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
    fire_threshold: 0.55,
    threshold_alpha: 1.0,
    threshold_beta: 1.0,
    embedder_model_id: "test",
    hard_negatives: undefined,
    ...initial,
  };
  const store = {
    getAll() {
      return [rule];
    },
    getActive() {
      return [rule];
    },
    getById(id: string) {
      return id === rule.id ? rule : undefined;
    },
    query() {
      return [rule];
    },
    add() {
      // stub
    },
    update(id: string, patch: Partial<KnowledgeEntry>) {
      if (id === rule.id) {
        stored = { ...rule, ...patch };
      }
    },
    delete() {
      return false;
    },
    count() {
      return 1;
    },
  } as KnowledgeStore;
  return { store, updated: () => stored };
}

describe("accumulateHardNegative", () => {
  it("adds context vec when ai.override.ignored event arrives", async () => {
    const { store, updated } = makeStore({});
    await accumulateHardNegative({
      event: {
        kind: "ai.override.ignored",
        knowledge_id: "r1",
        timestamp: new Date().toISOString(),
        payload: { contextText: "some context", actionText: "some action" },
      },
      store,
      embedder: stubEmbedder,
      now: new Date(),
    });
    const u = updated();
    expect(u).toBeDefined();
    const hn = JSON.parse(String(u!.hard_negatives));
    expect(hn).toHaveLength(1);
    expect(hn[0]).toHaveLength(4); // 4-dim vector
  });

  it("LRU caps at MAX_HARD_NEG entries", async () => {
    const existing = Array.from({ length: MAX_HARD_NEG }, (_, i) => [
      i * 0.1,
      0.5,
      0.5,
      0.5,
    ]);
    const { store, updated } = makeStore({
      hard_negatives: JSON.stringify(existing) as any,
    });
    await accumulateHardNegative({
      event: {
        kind: "ai.override.ignored",
        knowledge_id: "r1",
        timestamp: new Date().toISOString(),
        payload: { contextText: "new one", actionText: "" },
      },
      store,
      embedder: stubEmbedder,
      now: new Date(),
    });
    const hn = JSON.parse(String(updated()!.hard_negatives));
    expect(hn).toHaveLength(MAX_HARD_NEG);
  });

  it("does not accumulate for events outside 24h window", async () => {
    const { store, updated } = makeStore({});
    const oldTs = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    await accumulateHardNegative({
      event: {
        kind: "ai.override.ignored",
        knowledge_id: "r1",
        timestamp: oldTs,
        payload: { contextText: "old", actionText: "" },
      },
      store,
      embedder: stubEmbedder,
      now: new Date(),
    });
    expect(updated()).toBeUndefined();
  });

  it("ignores irrelevant event kinds", async () => {
    const { store, updated } = makeStore({});
    await accumulateHardNegative({
      event: {
        kind: "some.other.event",
        knowledge_id: "r1",
        timestamp: new Date().toISOString(),
        payload: {},
      },
      store,
      embedder: stubEmbedder,
      now: new Date(),
    });
    expect(updated()).toBeUndefined();
  });
});
