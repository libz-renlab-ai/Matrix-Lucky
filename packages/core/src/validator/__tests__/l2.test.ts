import { describe, it, expect } from "vitest";
import { validateLevel2 } from "../l2.js";
import type { KnowledgeEntry } from "@teamagent/types";

function makeEntry(over: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "r1",
    scope: { level: "team", paths: ["src/**"] },
    category: "E",
    tags: [],
    type: "avoidance",
    nature: "subjective",
    trigger: "t",
    wrong_pattern: "w",
    correct_pattern: "c",
    reasoning: "r",
    confidence: 0.85,
    enforcement: "warn",
    status: "active",
    hit_count: 25,
    success_count: 20,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-03-01T00:00:00Z",
    last_hit_at: "2026-04-15T00:00:00Z",
    last_validated_at: "2026-04-15T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "stable",
    max_tier_ever: "stable",
    tier_entered_at: "2026-03-10T00:00:00Z",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...over,
  };
}

describe("validateLevel2", () => {
  it("ok=true when LLM approves", async () => {
    const stubLLM = async () =>
      JSON.stringify({ ok: true, confidence: 0.9, reason: "non-overfit" });
    const r = await validateLevel2(
      { entry: makeEntry(), recentHits: [], existingSeniorRules: [] },
      stubLLM,
    );
    expect(r.ok).toBe(true);
  });

  it("ok=false when LLM detects overfit", async () => {
    const stubLLM = async () =>
      JSON.stringify({
        ok: false,
        confidence: 0.7,
        reason: "overfit to ts projects only",
      });
    const r = await validateLevel2(
      { entry: makeEntry(), recentHits: [], existingSeniorRules: [] },
      stubLLM,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("overfit");
  });

  it("garbage → ok=false, no throw", async () => {
    const stubLLM = async () => "nothing at all";
    const r = await validateLevel2(
      { entry: makeEntry(), recentHits: [], existingSeniorRules: [] },
      stubLLM,
    );
    expect(r.ok).toBe(false);
  });

  it("LLM throws → ok=false with llm_error", async () => {
    const stubLLM = async () => {
      throw new Error("timeout");
    };
    const r = await validateLevel2(
      { entry: makeEntry(), recentHits: [], existingSeniorRules: [] },
      stubLLM,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("llm_error");
  });

  it("prompt includes recent hits + senior rules", async () => {
    let captured = "";
    const stubLLM = async (p: string) => {
      captured = p;
      return JSON.stringify({ ok: true, confidence: 0.9, reason: "x" });
    };
    const recentHits = [
      { tool_input: { command: "rm -rf /" }, timestamp: "2026-04-14T00:00:00Z" },
      { tool_input: { command: "echo" }, timestamp: "2026-04-15T00:00:00Z" },
    ];
    const seniors = [
      makeEntry({ id: "sr1", trigger: "senior-trigger", current_tier: "canonical" }),
    ];
    await validateLevel2(
      { entry: makeEntry(), recentHits, existingSeniorRules: seniors },
      stubLLM,
    );
    expect(captured).toContain("senior-trigger");
    expect(captured).toContain("rm -rf");
    expect(captured).toContain("L2");
  });

  it("trims recent hits to 20 samples max", async () => {
    let captured = "";
    const stubLLM = async (p: string) => {
      captured = p;
      return JSON.stringify({ ok: true, confidence: 0.9, reason: "x" });
    };
    const recentHits = Array.from({ length: 50 }, (_, i) => ({
      tool_input: { idx: i },
      timestamp: "2026-04-15T00:00:00Z",
    }));
    await validateLevel2(
      { entry: makeEntry(), recentHits, existingSeniorRules: [] },
      stubLLM,
    );
    // 20 个样本编号应存在，第 21 起不应存在
    expect(captured).toContain('"idx":19');
    expect(captured).not.toContain('"idx":20');
  });
});
