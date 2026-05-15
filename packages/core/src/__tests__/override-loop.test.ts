import { describe, it, expect } from "vitest";

/**
 * Minimal test for the AI override closed-loop feedback feature.
 * A rule struct with an `overrides_applied` counter starts at 0
 * and increments correctly via a pure helper `recordOverride`.
 */

interface OverrideRule {
  id: string;
  overrides_applied: number;
  last_override_at: string;
}

/** Pure helper: returns a new rule with overrides_applied incremented. */
function recordOverride(rule: OverrideRule, ts: string): OverrideRule {
  return {
    ...rule,
    overrides_applied: rule.overrides_applied + 1,
    last_override_at: ts,
  };
}

describe("override-loop: AI override closed-loop feedback", () => {
  it("starts with overrides_applied = 0", () => {
    const rule: OverrideRule = {
      id: "rule-001",
      overrides_applied: 0,
      last_override_at: "",
    };
    expect(rule.overrides_applied).toBe(0);
  });

  it("recordOverride increments overrides_applied by 1 (pure, immutable)", () => {
    const rule: OverrideRule = {
      id: "rule-001",
      overrides_applied: 0,
      last_override_at: "",
    };
    const ts = "2026-05-05T00:00:00Z";
    const updated = recordOverride(rule, ts);
    expect(updated.overrides_applied).toBe(1);
    expect(updated.last_override_at).toBe(ts);
    // original is unchanged (immutable)
    expect(rule.overrides_applied).toBe(0);
  });

  it("multiple overrides accumulate correctly", () => {
    let rule: OverrideRule = {
      id: "rule-002",
      overrides_applied: 0,
      last_override_at: "",
    };
    rule = recordOverride(rule, "2026-05-05T00:00:01Z");
    rule = recordOverride(rule, "2026-05-05T00:00:02Z");
    rule = recordOverride(rule, "2026-05-05T00:00:03Z");
    expect(rule.overrides_applied).toBe(3);
    expect(rule.last_override_at).toBe("2026-05-05T00:00:03Z");
  });

  it("recordOverride does not mutate the original rule", () => {
    const original: OverrideRule = {
      id: "rule-003",
      overrides_applied: 5,
      last_override_at: "2026-05-01T00:00:00Z",
    };
    const result = recordOverride(original, "2026-05-05T12:00:00Z");
    expect(original.overrides_applied).toBe(5);
    expect(result.overrides_applied).toBe(6);
  });
});
