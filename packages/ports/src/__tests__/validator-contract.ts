import { describe, it, expect } from "vitest";
import type { Validator } from "../validator.js";
import type { KnowledgeEntry } from "@teamagent/types";

/**
 * Validator contract. Invariants:
 *
 * L0:
 *  1. 全绿 → ok=true, failed_checks=[]
 *  2. wrong_pattern 完全不在 sourceText 里 → failed_checks 含 "wrong_pattern_not_in_source"
 *  3. scope.paths 空 + type=avoidance → failed_checks 含 "scope_paths_empty"
 *  4. existingRules 里有相同 trigger → failed_checks 含 "trigger_collision"
 *  5. 纯函数：相同输入 → 相同输出
 *
 * L1/L2:
 *  6. confidence ∈ [0, 1]
 *  7. ok=false 时必带 reason
 *  8. LLM 返回 garbage → ok=false（不抛异常）
 */
export function runValidatorContract(make: () => Validator): void {
  describe("Validator contract", () => {
    const baseEntry: KnowledgeEntry = {
      id: "r1",
      scope: { level: "team", paths: ["src/**"] },
      category: "E",
      tags: [],
      type: "avoidance",
      nature: "subjective",
      trigger: "use-fetch-not-axios",
      wrong_pattern: "axios",
      correct_pattern: "fetch",
      reasoning: "r",
      confidence: 0.5,
      enforcement: "suggest",
      status: "active",
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      evidence: {
        success_sessions: 0,
        success_users: 0,
        correction_sessions: 0,
      },
      created_at: "2026-04-16T00:00:00Z",
      last_hit_at: "",
      last_validated_at: "2026-04-16T00:00:00Z",
      source: "accumulated",
      conflict_with: [],
      current_tier: "experimental",
      max_tier_ever: "experimental",
      tier_entered_at: "2026-04-16T00:00:00Z",
      demerit: 0,
      demerit_last_updated: "",
      resurrect_count: 0,
    };

    describe("L0", () => {
      it("all mechanical checks pass → ok=true", () => {
        const r = make().validateLevel0({
          entry: baseEntry,
          sourceText: "import axios from 'axios';",
          existingRules: [],
          projectStack: ["ts"],
        });
        expect(r.ok).toBe(true);
        expect(r.failed_checks).toEqual([]);
      });

      it("wrong_pattern absent in source → fail", () => {
        const r = make().validateLevel0({
          entry: baseEntry,
          sourceText: "console.log('hi');",
          existingRules: [],
          projectStack: ["ts"],
        });
        expect(r.ok).toBe(false);
        expect(r.failed_checks).toContain("wrong_pattern_not_in_source");
      });

      it("avoidance with empty scope.paths → fail", () => {
        const r = make().validateLevel0({
          entry: { ...baseEntry, scope: { level: "team", paths: [] } },
          sourceText: "import axios from 'axios';",
          existingRules: [],
          projectStack: ["ts"],
        });
        expect(r.ok).toBe(false);
        expect(r.failed_checks).toContain("scope_paths_empty");
      });

      it("trigger collision with existing rule → fail", () => {
        const r = make().validateLevel0({
          entry: baseEntry,
          sourceText: "import axios from 'axios';",
          existingRules: [
            {
              id: "r-old",
              trigger: "use-fetch-not-axios",
              wrong_pattern: "axios",
            },
          ],
          projectStack: ["ts"],
        });
        expect(r.ok).toBe(false);
        expect(r.failed_checks).toContain("trigger_collision");
      });

      it("is pure (same input → same output)", () => {
        const input = {
          entry: baseEntry,
          sourceText: "import axios from 'axios';",
          existingRules: [],
          projectStack: ["ts"],
        };
        const a = make().validateLevel0(input);
        const b = make().validateLevel0(input);
        expect(a).toEqual(b);
      });
    });

    describe("L1/L2", () => {
      it("confidence within [0,1]", async () => {
        const stubLLM = async () =>
          JSON.stringify({ ok: true, confidence: 0.8, reason: "fine" });
        const r = await make().validateLevel1(
          { entry: baseEntry, similarRules: [] },
          stubLLM,
        );
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      });

      it("ok=false requires reason", async () => {
        const stubLLM = async () =>
          JSON.stringify({ ok: false, confidence: 0.2, reason: "too broad" });
        const r = await make().validateLevel1(
          { entry: baseEntry, similarRules: [] },
          stubLLM,
        );
        if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
      });

      it("garbage LLM response → ok=false, no throw", async () => {
        const stubLLM = async () => "lol not json";
        const r = await make().validateLevel1(
          { entry: baseEntry, similarRules: [] },
          stubLLM,
        );
        expect(r.ok).toBe(false);
      });

      it("L2 garbage → ok=false, no throw", async () => {
        const stubLLM = async () => "still garbage";
        const r = await make().validateLevel2(
          {
            entry: baseEntry,
            recentHits: [],
            existingSeniorRules: [],
          },
          stubLLM,
        );
        expect(r.ok).toBe(false);
      });
    });
  });
}
