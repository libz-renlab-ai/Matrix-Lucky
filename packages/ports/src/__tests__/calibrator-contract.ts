import { describe, it, expect } from "vitest";
import type { Calibrator } from "../calibrator.js";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

/**
 * Calibrator 契约测试：任何实现都必须满足下面这组**结构性**保证。
 *
 * 注意：具体的 confidence delta 数值（如 +0.05 / -0.10）是**实现细节**，
 * 不在契约里硬绑——不同 calibrator 可以有不同公式，只要遵守下列不变量：
 *
 * 1. confidence 永远 ∈ [0, 1]
 * 2. 输入空 events → 无变化（confidence/status 等于输入；delta=0）
 * 3. 全是正面信号（hook-pre.blocked / hook-post.result succeeded） → delta ≥ 0
 * 4. 全是负面信号（hook-post.result 失败的 + hook-pre.blocked） → delta ≤ 0
 * 5. confidence < 0.3 时自动归档为 archived（status 调整）
 * 6. 不会自动 un-archive：input archived → output archived
 * 7. 纯函数：相同输入永远相同输出（同一调用两次结果一致）
 *
 * 使用方式：
 *   describe("MyCalibrator", () => {
 *     runCalibratorContract(() => new MyCalibrator());
 *   });
 */
export function runCalibratorContract(makeCalibrator: () => Calibrator): void {
  describe("Calibrator contract", () => {
    const baseEntry: KnowledgeEntry = {
      id: "test-rule-1",
      scope: { level: "team" },
      category: "E",
      tags: ["test"],
      type: "avoidance",
      nature: "subjective",
      trigger: "test trigger",
      wrong_pattern: "wrong",
      correct_pattern: "correct",
      reasoning: "reason",
      confidence: 0.7,
      enforcement: "warn",
      status: "active",
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
      created_at: "2026-04-15T00:00:00Z",
      last_hit_at: "",
      last_validated_at: "2026-04-15T00:00:00Z",
      source: "accumulated",
      conflict_with: [],
      current_tier: "experimental" as const,
      max_tier_ever: "experimental" as const,
      tier_entered_at: "",
      demerit: 0,
      demerit_last_updated: "",
      resurrect_count: 0,
    };

    function evt(over: Partial<PersistedEvent>): PersistedEvent {
      return {
        id: "evt-1",
        kind: "hook-pre.matched",
        knowledge_id: baseEntry.id,
        timestamp: "2026-04-15T01:00:00Z",
        schema_version: 1,
        ...over,
      } as PersistedEvent;
    }

    it("empty events → no change (delta=0)", () => {
      const c = makeCalibrator();
      const r = c.calibrate(baseEntry, []);
      expect(r.confidence).toBe(baseEntry.confidence);
      expect(r.status).toBe(baseEntry.status);
      expect(r.delta).toBe(0);
    });

    it("confidence is clamped to [0, 1]", () => {
      const c = makeCalibrator();
      // Lots of positive signals; confidence should never exceed 1
      const events: PersistedEvent[] = Array.from({ length: 100 }, (_, i) =>
        evt({ id: `evt-block-${i}`, kind: "hook-pre.blocked" }),
      );
      const r = c.calibrate(
        { ...baseEntry, confidence: 0.95 },
        events,
      );
      expect(r.confidence).toBeLessThanOrEqual(1);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
    });

    it("only positive signals → delta >= 0", () => {
      const c = makeCalibrator();
      const events: PersistedEvent[] = [
        evt({ id: "p1", kind: "hook-pre.blocked" }),
        evt({
          id: "p2",
          kind: "hook-post.result",
          tool_use_id: "t1",
          result: { succeeded: true },
        }),
      ];
      const r = c.calibrate(baseEntry, events);
      expect(r.delta).toBeGreaterThanOrEqual(0);
    });

    it("only negative signals → delta <= 0", () => {
      const c = makeCalibrator();
      // Need a pre.blocked + post failure to express "rule blocked but tool still failed"
      const events: PersistedEvent[] = [
        evt({ id: "n1", kind: "hook-pre.blocked", tool_use_id: "t1" }),
        evt({
          id: "n2",
          kind: "hook-post.result",
          tool_use_id: "t1",
          result: { succeeded: false, exit_code: 1 },
        }),
      ];
      const r = c.calibrate(baseEntry, events);
      expect(r.delta).toBeLessThanOrEqual(0);
    });

    it("confidence dropping below 0.3 → status auto-archived", () => {
      const c = makeCalibrator();
      const startConf = 0.32;
      const events: PersistedEvent[] = Array.from({ length: 20 }, (_, i) =>
        evt({
          id: `fail-${i}`,
          kind: "hook-post.result",
          tool_use_id: `t-${i}`,
          result: { succeeded: false, exit_code: 1 },
        }),
      );
      // Pair each post failure with a blocked pre for the same tool_use_id
      const paired: PersistedEvent[] = [];
      for (let i = 0; i < 20; i++) {
        paired.push(
          evt({ id: `pre-${i}`, kind: "hook-pre.blocked", tool_use_id: `t-${i}` }),
        );
      }
      const r = c.calibrate(
        { ...baseEntry, confidence: startConf },
        [...paired, ...events],
      );
      if (r.confidence < 0.3) {
        expect(r.status).toBe("archived");
      }
    });

    it("never un-archives: archived input stays archived", () => {
      const c = makeCalibrator();
      const events: PersistedEvent[] = Array.from({ length: 50 }, (_, i) =>
        evt({ id: `b-${i}`, kind: "hook-pre.blocked" }),
      );
      const r = c.calibrate(
        { ...baseEntry, status: "archived", confidence: 0.2 },
        events,
      );
      expect(r.status).toBe("archived");
    });

    it("pure function: same inputs → same outputs across calls", () => {
      const c = makeCalibrator();
      const events: PersistedEvent[] = [
        evt({ id: "p1", kind: "hook-pre.blocked" }),
        evt({
          id: "p2",
          kind: "hook-post.result",
          tool_use_id: "t1",
          result: { succeeded: true },
        }),
      ];
      const r1 = c.calibrate(baseEntry, events);
      const r2 = c.calibrate(baseEntry, events);
      expect(r1.confidence).toBe(r2.confidence);
      expect(r1.status).toBe(r2.status);
      expect(r1.delta).toBe(r2.delta);
    });

    it("ignores events that don't match this entry's knowledge_id", () => {
      const c = makeCalibrator();
      const events: PersistedEvent[] = [
        evt({ id: "other", kind: "hook-pre.blocked", knowledge_id: "other-rule" }),
      ];
      const r = c.calibrate(baseEntry, events);
      expect(r.delta).toBe(0);
    });

    it("status preserved when no auto-archive triggered", () => {
      const c = makeCalibrator();
      const events: PersistedEvent[] = [
        evt({ id: "p1", kind: "hook-pre.warned" }),
      ];
      const r = c.calibrate(baseEntry, events);
      expect(r.status).toBe("active");
    });

    it("conflict status is preserved (calibrator does not touch it)", () => {
      const c = makeCalibrator();
      const events: PersistedEvent[] = [
        evt({ id: "p1", kind: "hook-pre.blocked" }),
      ];
      const r = c.calibrate({ ...baseEntry, status: "conflict" }, events);
      expect(r.status).toBe("conflict");
    });
  });
}
