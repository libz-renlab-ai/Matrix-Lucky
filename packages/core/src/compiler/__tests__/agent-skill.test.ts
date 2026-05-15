import { describe, it, expect } from "vitest";
import { formatAsAgentSkill } from "../agent-skill.js";
import type { KnowledgeEntry } from "@teamagent/types";

function mkEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "no-axios",
    scope: { level: "personal" },
    category: "C",
    tags: [],
    type: "avoidance",
    nature: "objective",
    trigger: "use-fetch-not-axios",
    wrong_pattern: "axios",
    correct_pattern: "fetch",
    reasoning: "项目统一原生 fetch",
    confidence: 0.85,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-16T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "accumulated",
    conflict_with: [],
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...overrides,
  };
}

describe("formatAsAgentSkill", () => {
  it("produces valid YAML frontmatter + body", () => {
    const md = formatAsAgentSkill(mkEntry());
    expect(md).toMatch(/^---\nname: no-axios\n/);
    expect(md).toContain("description:");
    expect(md).toContain("fetch");
    expect(md).toContain("axios");
    expect(md).toMatch(/Tier: canonical/);
    expect(md).toMatch(/Confidence: 0\.85/);
  });

  it("truncates overly long description (>400 chars)", () => {
    const md = formatAsAgentSkill(mkEntry({ reasoning: "x".repeat(500) }));
    const lines = md.split("\n");
    const descLine = lines.find((l) => l.startsWith("  ") && l.includes("x"))!;
    expect(descLine.length).toBeLessThan(410); // 400 + "  " prefix + "…"
    expect(descLine).toContain("…");
  });

  it("omits ❌ section when wrong_pattern is empty", () => {
    const md = formatAsAgentSkill(mkEntry({ wrong_pattern: "" }));
    expect(md).not.toContain("### ❌");
  });

  it("includes ❌ section when wrong_pattern is present", () => {
    const md = formatAsAgentSkill(mkEntry({ wrong_pattern: "bad-thing" }));
    expect(md).toContain("### ❌");
    expect(md).toContain("bad-thing");
  });

  it("ends with newline", () => {
    const md = formatAsAgentSkill(mkEntry());
    expect(md.endsWith("\n")).toBe(true);
  });

  it("contains meta section with all fields", () => {
    const md = formatAsAgentSkill(mkEntry({ id: "my-rule", source: "preset" }));
    expect(md).toContain("Rule ID: my-rule");
    expect(md).toContain("Source: preset");
  });
});
