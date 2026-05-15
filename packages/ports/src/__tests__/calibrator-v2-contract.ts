import { describe, it, expect } from "vitest";
import type {
  CalibratorV2,
  CalibratorV2Input,
  Observation,
} from "../calibrator-v2.js";
import type { KnowledgeEntry } from "@teamagent/types";

/**
 * CalibratorV2 contract. Invariants:
 *
 * 1. confidence ∈ [0, 1]
 * 2. demerit >= 0
 * 3. empty observations + empty events + zero demerit → no change
 * 4. only success observations → confidence_delta >= 0
 * 5. demerit >= 50 → tier_after=dormant
 * 6. pure function: same input → same output
 * 7. tier_transition exists only when tier changes
 * 8. ignores observations from other rules
 */
export function runCalibratorV2Contract(make: () => CalibratorV2): void {
  describe("CalibratorV2 contract", () => {
    const now = new Date("2026-04-16T12:00:00Z");

    const baseEntry: KnowledgeEntry = {
      id: "r-v2",
      scope: { level: "team" },
      category: "E",
      tags: [],
      type: "avoidance",
      nature: "subjective",
      trigger: "t",
      wrong_pattern: "w",
      correct_pattern: "c",
      reasoning: "r",
      confidence: 0.4,
      enforcement: "passive",
      status: "active",
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
      created_at: "2026-04-01T00:00:00Z",
      last_hit_at: "",
      last_validated_at: "2026-04-01T00:00:00Z",
      source: "accumulated",
      conflict_with: [],
      current_tier: "probation",
      max_tier_ever: "probation",
      tier_entered_at: "2026-04-10T00:00:00Z",
      demerit: 0,
      demerit_last_updated: "",
      resurrect_count: 0,
    };

    const emptyInput: CalibratorV2Input = {
      events: [],
      observations: [],
      now,
    };

    function obs(
      outcome: "success" | "failure",
      daysAgo = 0,
      id = `o-${daysAgo}-${outcome}-${Math.random()}`,
    ): Observation {
      const ts = new Date(now.getTime() - daysAgo * 24 * 3600 * 1000).toISOString();
      return {
        id,
        knowledge_id: baseEntry.id,
        timestamp: ts,
        outcome,
      };
    }

    it("clamps confidence to [0,1]", () => {
      const r = make().calibrate(baseEntry, {
        ...emptyInput,
        observations: Array.from({ length: 200 }, (_, i) => obs("success", 0, `s${i}`)),
      });
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    });

    it("demerit >= 0", () => {
      const r = make().calibrate(baseEntry, emptyInput);
      expect(r.demerit).toBeGreaterThanOrEqual(0);
    });

    it("empty input + zero demerit → no change", () => {
      const r = make().calibrate(baseEntry, emptyInput);
      expect(r.confidence_delta).toBe(0);
      expect(r.demerit_delta).toBe(0);
      expect(r.tier_transition).toBeNull();
    });

    it("all success observations → confidence_delta >= 0", () => {
      const r = make().calibrate(
        { ...baseEntry, confidence: 0 },
        {
          ...emptyInput,
          observations: Array.from({ length: 10 }, (_, i) => obs("success", i, `s${i}`)),
        },
      );
      expect(r.confidence_delta).toBeGreaterThanOrEqual(0);
    });

    it("demerit >= 50 → tier_after=dormant", () => {
      const r = make().calibrate(
        { ...baseEntry, demerit: 55, demerit_last_updated: now.toISOString() },
        emptyInput,
      );
      expect(r.tier_after).toBe("dormant");
    });

    it("all failure observations → confidence_delta <= 0", () => {
      const r = make().calibrate(
        { ...baseEntry, confidence: 0.8 },
        {
          ...emptyInput,
          observations: Array.from({ length: 10 }, (_, i) => obs("failure", i, `f${i}`)),
        },
      );
      expect(r.confidence_delta).toBeLessThanOrEqual(0);
    });

    it("pure function: same input → same output", () => {
      const input: CalibratorV2Input = {
        ...emptyInput,
        observations: [obs("success", 1, "a"), obs("failure", 2, "b")],
      };
      const r1 = make().calibrate(baseEntry, input);
      const r2 = make().calibrate(baseEntry, input);
      expect(r1.confidence).toBe(r2.confidence);
      expect(r1.demerit).toBe(r2.demerit);
      expect(r1.tier_after).toBe(r2.tier_after);
    });

    it("tier_transition only when tier changes", () => {
      const r = make().calibrate(baseEntry, emptyInput);
      if (r.tier_transition) {
        expect(r.tier_transition.from).not.toBe(r.tier_transition.to);
      }
    });

    it("ignores observations from other rules", () => {
      const r = make().calibrate(baseEntry, {
        ...emptyInput,
        observations: [{ ...obs("success", 0), knowledge_id: "other-rule" }],
      });
      expect(r.confidence_delta).toBe(0);
    });
  });
}
