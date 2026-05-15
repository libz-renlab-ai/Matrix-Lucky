import { describe, it, expect } from "vitest";
import {
  computeDemerit,
  DEMERIT_HALF_LIFE_DAYS,
  DEMERIT_BASE_BY_TIER,
  type DemeritEvent,
} from "../demerit.js";

const now = new Date("2026-04-16T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 3600 * 1000).toISOString();

describe("Demerit computeDemerit", () => {
  it("no events + zero demerit → zero", () => {
    const r = computeDemerit(
      { current: 0, last_updated: "", current_tier: "experimental", confidence: 0.3 },
      [],
      now,
    );
    expect(r.demerit).toBe(0);
  });

  it("decays existing demerit by half-life", () => {
    const r = computeDemerit(
      {
        current: 10,
        last_updated: daysAgo(7), // 1 half-life at experimental (7 days)
        current_tier: "experimental",
        confidence: 0.4,
      },
      [],
      now,
    );
    expect(r.demerit).toBeCloseTo(5, 1);
  });

  it("adds base demerit by tier", () => {
    const events: DemeritEvent[] = [{ source: "ai_override_ignored", timestamp: now.toISOString() }];
    const r = computeDemerit(
      { current: 0, last_updated: "", current_tier: "canonical", confidence: 0.4 },
      events,
      now,
    );
    expect(r.demerit).toBeGreaterThanOrEqual(DEMERIT_BASE_BY_TIER.canonical);
  });

  it("log-loss multiplier amplifies when confidence high", () => {
    const events: DemeritEvent[] = [{ source: "ai_override_ignored", timestamp: now.toISOString() }];
    const low = computeDemerit(
      { current: 0, last_updated: "", current_tier: "stable", confidence: 0.4 },
      events,
      now,
    );
    const high = computeDemerit(
      { current: 0, last_updated: "", current_tier: "stable", confidence: 0.95 },
      events,
      now,
    );
    expect(high.demerit).toBeGreaterThan(low.demerit);
  });

  it("user_reject adds extra +10", () => {
    const base: DemeritEvent[] = [{ source: "ai_override_ignored", timestamp: now.toISOString() }];
    const reject: DemeritEvent[] = [{ source: "user_reject", timestamp: now.toISOString() }];
    const baseR = computeDemerit(
      { current: 0, last_updated: "", current_tier: "stable", confidence: 0.5 },
      base,
      now,
    );
    const rejectR = computeDemerit(
      { current: 0, last_updated: "", current_tier: "stable", confidence: 0.5 },
      reject,
      now,
    );
    expect(rejectR.demerit - baseR.demerit).toBeCloseTo(10, 1);
  });

  it("demerit never negative", () => {
    const r = computeDemerit(
      { current: 100, last_updated: daysAgo(1000), current_tier: "experimental", confidence: 0.3 },
      [],
      now,
    );
    expect(r.demerit).toBeGreaterThanOrEqual(0);
  });

  it("breakdown steps explain the math", () => {
    const r = computeDemerit(
      { current: 10, last_updated: daysAgo(7), current_tier: "experimental", confidence: 0.5 },
      [{ source: "ai_override_ignored", timestamp: now.toISOString() }],
      now,
    );
    expect(r.breakdown.length).toBeGreaterThan(0);
    expect(r.breakdown.some((s) => s.type === "demerit_decay")).toBe(true);
    expect(r.breakdown.some((s) => s.type === "demerit_added")).toBe(true);
  });

  it("half-life table matches design doc", () => {
    expect(DEMERIT_HALF_LIFE_DAYS.experimental).toBe(7);
    expect(DEMERIT_HALF_LIFE_DAYS.probation).toBe(10);
    expect(DEMERIT_HALF_LIFE_DAYS.stable).toBe(14);
    expect(DEMERIT_HALF_LIFE_DAYS.canonical).toBe(21);
    expect(DEMERIT_HALF_LIFE_DAYS.enforced).toBe(28);
  });

  it("B-060: multiplier is monotone — confidence=0.5 gives ≤ demerit than confidence=0.51", () => {
    const events: DemeritEvent[] = [
      { source: "ai_override_ignored", timestamp: now.toISOString() },
    ];
    const res5 = computeDemerit(
      { current: 0, last_updated: "", current_tier: "stable", confidence: 0.5 },
      events, now,
    );
    const res51 = computeDemerit(
      { current: 0, last_updated: "", current_tier: "stable", confidence: 0.51 },
      events, now,
    );
    const res7 = computeDemerit(
      { current: 0, last_updated: "", current_tier: "stable", confidence: 0.7 },
      events, now,
    );
    // monotone: demerit(0.5) ≤ demerit(0.51) ≤ demerit(0.7)
    expect(res51.demerit).toBeGreaterThanOrEqual(res5.demerit);
    expect(res7.demerit).toBeGreaterThanOrEqual(res51.demerit);
  });

  it("B-061: future last_updated is handled gracefully (no NaN, demerit preserved)", () => {
    const futureTs = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();
    const result = computeDemerit(
      { current: 10, last_updated: futureTs, current_tier: "stable", confidence: 0.7 },
      [], now,
    );
    expect(Number.isFinite(result.demerit)).toBe(true);
    expect(result.demerit).toBeCloseTo(10, 1); // no decay for future timestamp
  });
});
