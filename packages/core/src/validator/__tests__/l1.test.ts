import { describe, it, expect } from "vitest";
import { validateLevel1 } from "../l1.js";
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
    confidence: 0.7,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-16T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-04-16T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "probation",
    max_tier_ever: "probation",
    tier_entered_at: "2026-04-10T00:00:00Z",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...over,
  };
}

describe("validateLevel1", () => {
  it("parses valid JSON LLM response → ok=true", async () => {
    const stubLLM = async () =>
      JSON.stringify({ ok: true, confidence: 0.85, reason: "clear and specific" });
    const r = await validateLevel1(
      { entry: makeEntry(), similarRules: [] },
      stubLLM,
    );
    expect(r.ok).toBe(true);
    expect(r.confidence).toBe(0.85);
    expect(r.reason).toBe("clear and specific");
  });

  it("parses ok=false with reason + conflicts_with", async () => {
    const stubLLM = async () =>
      JSON.stringify({
        ok: false,
        confidence: 0.3,
        reason: "too broad, conflicts with r-old",
        conflicts_with: ["r-old"],
      });
    const r = await validateLevel1(
      { entry: makeEntry(), similarRules: [] },
      stubLLM,
    );
    expect(r.ok).toBe(false);
    expect(r.conflicts_with).toEqual(["r-old"]);
  });

  it("strips ```json fenced blocks before parsing", async () => {
    const stubLLM = async () =>
      '```json\n{"ok": true, "confidence": 0.9, "reason": "fine"}\n```';
    const r = await validateLevel1(
      { entry: makeEntry(), similarRules: [] },
      stubLLM,
    );
    expect(r.ok).toBe(true);
  });

  it("garbage LLM response → ok=false, reason set", async () => {
    const stubLLM = async () => "not even close to JSON";
    const r = await validateLevel1(
      { entry: makeEntry(), similarRules: [] },
      stubLLM,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it("LLM throws → ok=false, reason contains 'llm_error'", async () => {
    const stubLLM = async () => {
      throw new Error("rate limited");
    };
    const r = await validateLevel1(
      { entry: makeEntry(), similarRules: [] },
      stubLLM,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("llm_error");
  });

  it("clamps confidence to [0, 1] when LLM returns out-of-range value", async () => {
    const stubLLM = async () =>
      JSON.stringify({ ok: true, confidence: 1.5, reason: "x" });
    const r = await validateLevel1(
      { entry: makeEntry(), similarRules: [] },
      stubLLM,
    );
    expect(r.confidence).toBe(1);
  });

  it("prompt includes entry + similar rules", async () => {
    let captured = "";
    const stubLLM = async (prompt: string) => {
      captured = prompt;
      return JSON.stringify({ ok: true, confidence: 0.8, reason: "x" });
    };
    const similar = [makeEntry({ id: "r-old", trigger: "t-neighbor" })];
    await validateLevel1({ entry: makeEntry(), similarRules: similar }, stubLLM);
    expect(captured).toContain("r-old");
    expect(captured).toContain("t-neighbor");
    expect(captured).toContain("L1");
  });
});
