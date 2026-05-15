import { describe, it, expect } from "vitest";
import { applyHysteresis, type HysteresisInput } from "../hysteresis.js";

const now = new Date("2026-04-16T12:00:00Z");

const base: HysteresisInput = {
  current_tier: "probation",
  candidate_tier: "stable",
  confidence: 0.6,
  demerit: 0,
  tier_entered_at: new Date("2026-04-01T00:00:00Z").toISOString(),
  observation_count_in_current_tier: 15,
  now,
};

describe("applyHysteresis", () => {
  it("promotion blocked if obs < 10", () => {
    const r = applyHysteresis({ ...base, observation_count_in_current_tier: 5 });
    expect(r.final_tier).toBe("probation");
    expect(r.blocked_reason).toContain("observation");
  });

  it("promotion blocked if demerit >= 2.5", () => {
    const r = applyHysteresis({ ...base, demerit: 3 });
    expect(r.final_tier).toBe("probation");
    expect(r.blocked_reason).toContain("demerit");
  });

  it("promotion allowed when all conditions met", () => {
    const r = applyHysteresis(base);
    expect(r.final_tier).toBe("stable");
    expect(r.blocked_reason).toBeUndefined();
  });

  it("demotion blocked if < 7 days since transition", () => {
    const r = applyHysteresis({
      ...base,
      candidate_tier: "experimental",
      tier_entered_at: new Date("2026-04-13T00:00:00Z").toISOString(), // 3 days ago
    });
    expect(r.final_tier).toBe("probation");
    expect(r.blocked_reason).toContain("7 days");
  });

  it("demotion allowed after 7+ days", () => {
    const r = applyHysteresis({
      ...base,
      candidate_tier: "experimental",
      tier_entered_at: new Date("2026-04-01T00:00:00Z").toISOString(), // 15 days ago
    });
    expect(r.final_tier).toBe("experimental");
  });

  it("dormant candidate bypasses hysteresis immediately", () => {
    const r = applyHysteresis({
      ...base,
      candidate_tier: "dormant",
      demerit: 35,
      tier_entered_at: new Date("2026-04-15T23:00:00Z").toISOString(), // <1h ago
    });
    expect(r.final_tier).toBe("dormant");
  });

  it("no change when candidate == current", () => {
    const r = applyHysteresis({ ...base, candidate_tier: "probation" });
    expect(r.final_tier).toBe("probation");
    expect(r.blocked_reason).toBeUndefined();
  });

  it("B-048: empty tier_entered_at → demotion blocked (treated as 'just entered')", () => {
    const r = applyHysteresis({
      ...base,
      candidate_tier: "experimental",
      tier_entered_at: "",   // falsy default from schema
    });
    expect(r.final_tier).toBe("probation");    // blocked, not demoted
    expect(r.blocked_reason).toMatch(/7 days/);
  });
});
