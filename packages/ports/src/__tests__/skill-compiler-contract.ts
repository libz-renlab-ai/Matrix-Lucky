import { describe, it, expect } from "vitest";
import type { SkillCompiler } from "../skill-compiler.js";
import type { KnowledgeEntry } from "@teamagent/types";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skill-contract-"));
}

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "test-rule",
    scope: { level: "personal" },
    category: "C",
    tags: [],
    type: "avoidance",
    nature: "objective",
    trigger: "bad-pattern",
    wrong_pattern: "bad",
    correct_pattern: "good",
    reasoning: "good is better",
    confidence: 0.8,
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
    current_tier: "stable" as const,
    max_tier_ever: "stable" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...overrides,
  };
}

export function runSkillCompilerContract(make: () => SkillCompiler) {
  describe("SkillCompiler contract", () => {
    it("compile filters out non-stable+ entries", () => {
      const entries = [
        makeEntry({ id: "a", current_tier: "stable" as const, correct_pattern: "STABLE-A" }),
        makeEntry({ id: "b", current_tier: "probation" as const, correct_pattern: "PROBATION-B" }),
        makeEntry({ id: "c", current_tier: "canonical" as const, correct_pattern: "CANONICAL-C" }),
        makeEntry({ id: "d", current_tier: "experimental" as const, correct_pattern: "EXP-D" }),
      ];
      const arts = make().compile(entries);
      const ids = arts.map((a) => a.ruleId);
      expect(ids).toContain("a");
      expect(ids).toContain("c");
      expect(ids).not.toContain("b");
      expect(ids).not.toContain("d");
    });

    it("compile output has one artifact per qualifying entry", () => {
      const arts = make().compile([makeEntry({ id: "x", current_tier: "stable" as const })]);
      expect(arts).toHaveLength(1);
      const art = arts[0]!;
      expect(art.skillMd).toContain("---"); // has frontmatter
      expect(art.ruleId).toBe("x");
    });

    it("compile is pure (same input → same output)", () => {
      const entries = [makeEntry({ current_tier: "stable" as const })];
      const a = make().compile(entries);
      const b = make().compile(entries);
      expect(a).toEqual(b);
    });

    it("compile returns empty array for no qualifying entries", () => {
      const entries = [
        makeEntry({ id: "p", current_tier: "probation" as const }),
        makeEntry({ id: "e", current_tier: "experimental" as const }),
      ];
      const arts = make().compile(entries);
      expect(arts).toHaveLength(0);
    });
  });
}
