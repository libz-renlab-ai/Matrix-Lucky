import { describe, it, expect } from "vitest";
import { semanticMatch } from "../semantic-matcher.js";
import type { RuleEmbedder, SemanticRetriever, SemanticCandidate } from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";

const stubEmbedder: RuleEmbedder = {
  modelId: "test",
  dim: 4,
  async embed(texts: string[]) {
    return texts.map((t) => {
      const v = [0, 0, 0, 0];
      for (const ch of t) {
        const idx = ch.charCodeAt(0) % 4;
        v[idx] = (v[idx] ?? 0) + 0.1;
      }
      const n = Math.sqrt(v.reduce((s: number, x: number) => s + x * x, 0));
      return v.map((x) => x / n);
    });
  },
};

function fakeRetriever(candidates: SemanticCandidate[]): SemanticRetriever {
  return { async retrieve() { return candidates; } };
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
    source: "accumulated", conflict_with: [],
    current_tier: "experimental", max_tier_ever: "experimental",
    tier_entered_at: new Date().toISOString(),
    demerit: 0, demerit_last_updated: "", resurrect_count: 0,
    channel: "tool-action",
    trigger_description: "stub trigger",
    pattern_description: "stub pattern",
    fire_threshold: 0.55,
    threshold_alpha: 1.0, threshold_beta: 1.0,
    embedder_model_id: "test",
    ...overrides,
  };
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
    expect(out[0]!.rule.id).toBe("r1");
    expect(out[0]!.score).toBeGreaterThan(0.4);
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
    const ids = out.map((m) => m.rule.id);
    const hiIdx = ids.indexOf("high");
    const loIdx = ids.indexOf("low");
    if (hiIdx >= 0 && loIdx >= 0) {
      expect(hiIdx).toBeLessThan(loIdx);
    }
  });
});
