import { describe, it, expect } from "vitest";
import { scoreEntry } from "../scorer.js";
import type { KnowledgeEntry } from "@teamagent/types";

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "e",
    scope: { level: "personal" },
    category: "C",
    tags: [],
    type: "avoidance",
    nature: "objective",
    trigger: "",
    wrong_pattern: "",
    correct_pattern: "",
    reasoning: "",
    confidence: 0.7,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-14T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "preset",
    conflict_with: [],
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...overrides,
  };
}

describe("scoreEntry", () => {
  it("zero-confidence passive entry with no hits → minimal score (enforcement-only)", () => {
    const e = makeEntry({ confidence: 0, enforcement: "passive" });
    // 0×0.4 + 0×0.3 + 0×0.2 + 0.1×0.1 = 0.01
    expect(scoreEntry(e, 1, "2026-04-14T00:00:00Z")).toBeCloseTo(0.01, 3);
  });

  it("high confidence + many hits + block enforcement → high score", () => {
    const e = makeEntry({
      confidence: 1.0,
      hit_count: 100,
      enforcement: "block",
      last_hit_at: "2026-04-14T00:00:00Z",
    });
    const score = scoreEntry(e, 100, "2026-04-14T00:00:00Z");
    // 0.4 + 0.3 + 0.2 + 0.1 = 1.0
    expect(score).toBeCloseTo(1.0, 2);
  });

  it("confidence contributes 0.4 weight", () => {
    const e = makeEntry({ confidence: 0.5, hit_count: 0 });
    const score = scoreEntry(e, 1, "2026-04-14T00:00:00Z");
    // confidence 0.5*0.4 + hit 0*0.3 + recency 0*0.2 + enforcement warn 0.7*0.1
    expect(score).toBeCloseTo(0.5 * 0.4 + 0.7 * 0.1, 2);
  });

  it("hit count normalized by maxHitCount", () => {
    const e1 = makeEntry({ confidence: 0, hit_count: 50, enforcement: "passive" });
    const e2 = makeEntry({ confidence: 0, hit_count: 100, enforcement: "passive" });
    const s1 = scoreEntry(e1, 100, "2026-04-14T00:00:00Z");
    const s2 = scoreEntry(e2, 100, "2026-04-14T00:00:00Z");
    expect(s2).toBeGreaterThan(s1);
  });

  it("recency decays: older last_hit_at → lower score", () => {
    const recent = makeEntry({
      confidence: 0,
      hit_count: 0,
      enforcement: "passive",
      last_hit_at: "2026-04-10T00:00:00Z",
    });
    const old = makeEntry({
      confidence: 0,
      hit_count: 0,
      enforcement: "passive",
      last_hit_at: "2026-01-01T00:00:00Z",
    });
    const now = "2026-04-14T00:00:00Z";
    expect(scoreEntry(recent, 1, now)).toBeGreaterThan(scoreEntry(old, 1, now));
  });

  it("enforcement block > warn > suggest > passive", () => {
    const base = makeEntry({ confidence: 0, hit_count: 0 });
    const block = scoreEntry({ ...base, enforcement: "block" }, 1, "2026-04-14T00:00:00Z");
    const warn = scoreEntry({ ...base, enforcement: "warn" }, 1, "2026-04-14T00:00:00Z");
    const suggest = scoreEntry({ ...base, enforcement: "suggest" }, 1, "2026-04-14T00:00:00Z");
    const passive = scoreEntry({ ...base, enforcement: "passive" }, 1, "2026-04-14T00:00:00Z");
    expect(block).toBeGreaterThan(warn);
    expect(warn).toBeGreaterThan(suggest);
    expect(suggest).toBeGreaterThan(passive);
  });

  it("B-046: invalid now string → finite score (no NaN)", () => {
    const e = makeEntry({
      confidence: 0.8,
      enforcement: "warn",
      last_hit_at: "2026-01-01T00:00:00Z",
    });
    expect(Number.isFinite(scoreEntry(e, 10, "not-a-date"))).toBe(true);
    expect(Number.isFinite(scoreEntry(e, 10, ""))).toBe(true);
  });

  it("B-058: hit_count > maxHitCount → score clamped to ≤ 1.0", () => {
    const e = makeEntry({
      confidence: 1.0,
      hit_count: 1000,
      enforcement: "block",
      last_hit_at: "2026-04-27T00:00:00Z",
    });
    const score = scoreEntry(e, 10, "2026-04-27T00:00:00Z");
    expect(score).toBeLessThanOrEqual(1.0);
  });
});
