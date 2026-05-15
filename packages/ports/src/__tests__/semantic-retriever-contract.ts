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
      const candidate = out[0];
      expect(candidate).toBeDefined();
      expect(candidate!.rule.id).toBe("http-rule");
      expect(typeof candidate!.triggerSim).toBe("number");
      expect(typeof candidate!.patternSim).toBe("number");
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
      const ids = out.filter((c) => c !== undefined).map((c) => c!.rule.id);
      expect(ids).not.toContain("p");
      expect(ids).toContain("g");
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
        const scale = 1 / (i + 1);
        return [r.id, [unitVec(384, scale * 0.1), v] as [Float32Array, Float32Array]];
      }));
      await seed(rules, vectors);
      const out = await retriever.retrieve({
        contextText: "x", actionText: "y",
        contextVec: unitVec(384, 0.1), actionVec: v,
        scope: { level: "global" },
      });
      for (let i = 1; i < out.length; i++) {
        expect(out[i - 1]!.rrfScore).toBeGreaterThanOrEqual(out[i]!.rrfScore);
      }
    });
  });
}

function unitVec(dim: number, bias: number): Float32Array {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = bias + Math.random() * 0.01;
  let sumSq = 0;
  for (let i = 0; i < dim; i++) sumSq += v[i]! * v[i]!;
  const n = Math.sqrt(sumSq);
  if (n > 0) {
    for (let i = 0; i < dim; i++) v[i] = (v[i] ?? 0) / n;
  }
  return v;
}

function stubRule(overrides?: Partial<KnowledgeEntry>): KnowledgeEntry {
  const base: KnowledgeEntry = {
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
    trigger_description: "stub trigger desc",
    pattern_description: "stub pattern desc",
    fire_threshold: 0.55,
    threshold_alpha: 1.0, threshold_beta: 1.0,
    embedder_model_id: "Xenova/multilingual-e5-small",
  };
  return overrides ? Object.assign({}, base, overrides) : base;
}
