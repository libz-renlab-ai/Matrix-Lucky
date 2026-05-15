import { describe, expect, it } from "vitest";
import type { KnowledgeEntry } from "@teamagent/types";
import { mergeSemanticAndLegacyMatches } from "../pre-tool-use-merge.js";

describe("mergeSemanticAndLegacyMatches", () => {
  it("keeps legacy matches when semantic returns nothing", () => {
    const legacy = [mkEntry("legacy")];
    expect(mergeSemanticAndLegacyMatches([], legacy)).toEqual(legacy);
  });

  it("sorts semantic matches by score and deduplicates legacy matches by id", () => {
    const low = mkEntry("low");
    const high = mkEntry("high");
    const legacyOnly = mkEntry("legacy");

    const out = mergeSemanticAndLegacyMatches(
      [
        { rule: low, score: 0.6 },
        { rule: high, score: 0.9 },
      ],
      [low, legacyOnly],
    );

    expect(out.map((r) => r.id)).toEqual(["high", "low", "legacy"]);
  });
});

function mkEntry(id: string): KnowledgeEntry {
  return {
    id,
    scope: { level: "global" },
    category: "E",
    tags: [],
    type: "avoidance",
    nature: "objective",
    trigger: "trigger",
    wrong_pattern: "wrong",
    correct_pattern: "correct",
    reasoning: "reason",
    confidence: 0.8,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-24T00:00:00.000Z",
    last_hit_at: "",
    last_validated_at: "2026-04-24T00:00:00.000Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action",
  };
}
