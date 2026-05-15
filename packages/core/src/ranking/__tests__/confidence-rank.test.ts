import { describe, it, expect } from "vitest";
import { rerankByConfidence, confidenceWeight } from "../confidence-rank.js";
import type { KnowledgeEntry } from "@teamagent/types";
import type { SemanticMatch } from "../../matcher/semantic-matcher.js";

function makeRule(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "r1",
    scope: { level: "global" },
    category: "S" as const,
    tags: [],
    type: "practice" as const,
    nature: "subjective" as const,
    trigger: "t",
    wrong_pattern: "",
    correct_pattern: "c",
    reasoning: "r",
    confidence: 0.8,
    enforcement: "suggest" as const,
    status: "active" as const,
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-01-01T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-01-01T00:00:00Z",
    source: "user",
    conflict_with: [],
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "passive-knowledge" as const,
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

  it("experimental tier × 0.5", () => {
    const w = confidenceWeight(makeRule({ current_tier: "experimental" as const, confidence: 0.8 }));
    expect(w).toBeCloseTo(0.4);
  });

  it("probation tier × 0.7", () => {
    const w = confidenceWeight(makeRule({ current_tier: "probation" as const, confidence: 0.8 }));
    expect(w).toBeCloseTo(0.56);
  });

  it("canonical tier × 1.0", () => {
    const w = confidenceWeight(makeRule({ current_tier: "canonical" as const, confidence: 0.9 }));
    expect(w).toBeCloseTo(0.9);
  });
});

describe("rerankByConfidence", () => {
  it("higher-confidence rule ranks above lower-confidence with same base score", () => {
    const low = makeMatch(makeRule({ id: "low", confidence: 0.5, current_tier: "canonical" as const }), 0.8);
    const high = makeMatch(makeRule({ id: "high", confidence: 0.95, current_tier: "canonical" as const }), 0.8);
    const [first] = rerankByConfidence([low, high]);
    expect(first?.rule.id).toBe("high");
  });

  it("archived rule is moved to end (adjusted score 0)", () => {
    const archived = makeMatch(makeRule({ id: "arch", status: "archived" as const, confidence: 0.99 }), 0.9);
    const active = makeMatch(makeRule({ id: "active", confidence: 0.5, current_tier: "canonical" as const }), 0.6);
    const [first, second] = rerankByConfidence([archived, active]);
    expect(first?.rule.id).toBe("active");
    expect(second?.rule.id).toBe("arch");
  });

  it("does not mutate input match objects", () => {
    const match = makeMatch(makeRule({ confidence: 0.8, current_tier: "canonical" as const }), 0.9);
    const original = match.score;
    rerankByConfidence([match]);
    expect(match.score).toBe(original);
  });

  it("adjusted scores differ from original scores", () => {
    const match = makeMatch(makeRule({ confidence: 0.8, current_tier: "canonical" as const }), 0.9);
    const result = rerankByConfidence([match]);
    expect(result[0]?.score).not.toBe(0.9);
    expect(result[0]?.score).toBeCloseTo(0.9 * 0.8);
  });
});
