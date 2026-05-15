import { describe, it, expect } from "vitest";
import { compileCursorRules } from "../cursor.js";
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

describe("compileCursorRules", () => {
  const fixtures: KnowledgeEntry[] = [
    mkEntry({
      id: "no-axios",
      trigger: "use-fetch-not-axios",
      wrong_pattern: "axios",
      correct_pattern: "fetch",
      reasoning: "项目统一原生 fetch",
    }),
    mkEntry({
      id: "prefer-const",
      trigger: "prefer-const",
      type: "practice",
      wrong_pattern: "",
      correct_pattern: "const over let when value is not reassigned",
      reasoning: "Immutability reduces bugs",
    }),
    mkEntry({
      id: "no-console-log",
      trigger: "no-console-log-in-prod",
      wrong_pattern: "console.log",
      correct_pattern: "use structured logger",
      reasoning: "Console.log leaks to prod",
    }),
  ];

  it("contains each rule's trigger as a header", () => {
    const out = compileCursorRules(fixtures);
    expect(out).toContain("# use-fetch-not-axios");
    expect(out).toContain("# prefer-const");
    expect(out).toContain("# no-console-log-in-prod");
  });

  it("contains wrong_pattern for avoidance rules", () => {
    const out = compileCursorRules(fixtures);
    expect(out).toContain("axios");
    expect(out).toContain("console.log");
  });

  it("contains correct_pattern for all rules", () => {
    const out = compileCursorRules(fixtures);
    expect(out).toContain("fetch");
    expect(out).toContain("const over let");
    expect(out).toContain("use structured logger");
  });

  it("contains reasoning for all rules", () => {
    const out = compileCursorRules(fixtures);
    expect(out).toContain("项目统一原生 fetch");
    expect(out).toContain("Immutability reduces bugs");
    expect(out).toContain("Console.log leaks to prod");
  });

  it("separates rules with blank lines", () => {
    const out = compileCursorRules(fixtures);
    expect(out).toContain("\n\n");
  });

  it("returns empty string for no active entries", () => {
    const archived = [mkEntry({ status: "archived" as const })];
    expect(compileCursorRules(archived)).toBe("");
  });

  it("skips archived entries", () => {
    const mixed = [
      mkEntry({ id: "active-rule", trigger: "active-trigger", status: "active" }),
      mkEntry({ id: "archived-rule", trigger: "archived-trigger", status: "archived" as const }),
    ];
    const out = compileCursorRules(mixed);
    expect(out).toContain("# active-trigger");
    expect(out).not.toContain("# archived-trigger");
  });

  it("ends with newline", () => {
    const out = compileCursorRules(fixtures);
    expect(out.endsWith("\n")).toBe(true);
  });

  it("falls back to entry.id when trigger is empty", () => {
    const entry = mkEntry({ id: "fallback-id", trigger: "" });
    const out = compileCursorRules([entry]);
    expect(out).toContain("# fallback-id");
  });
});
