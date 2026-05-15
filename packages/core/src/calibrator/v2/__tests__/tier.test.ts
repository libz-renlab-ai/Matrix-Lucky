import { describe, it, expect } from "vitest";
import { tierFromConfidence, tierFromDemerit, effectiveTier, TIER_ORDER } from "../tier.js";

describe("tierFromConfidence", () => {
  it.each([
    [0.0, "experimental"],
    [0.29, "experimental"],
    [0.30, "probation"],
    [0.54, "probation"],
    [0.55, "stable"],
    [0.74, "stable"],
    [0.75, "canonical"],
    [0.89, "canonical"],
    [0.90, "enforced"],
    [1.0, "enforced"],
  ] as [number, string][])("conf=%f → tier=%s", (c, expected) => {
    expect(tierFromConfidence(c)).toBe(expected);
  });
});

describe("tierFromDemerit (death chain)", () => {
  it("demerit < 5 → no constraint (returns enforced)", () => {
    // demerit < 5 means death chain places no cap; any tier is allowed
    expect(tierFromDemerit(4, "stable")).toBe("enforced");
    expect(tierFromDemerit(0, "experimental")).toBe("enforced");
  });

  it("demerit >= 5 at stable → soft demote 1 tier (probation)", () => {
    expect(tierFromDemerit(5, "stable")).toBe("probation");
  });

  it("demerit >= 15 at canonical → hard demote 2 tiers (probation)", () => {
    expect(tierFromDemerit(16, "canonical")).toBe("probation");
  });

  it("demerit >= 50 at any tier → dormant", () => {
    expect(tierFromDemerit(51, "enforced")).toBe("dormant");
    expect(tierFromDemerit(51, "experimental")).toBe("dormant");
  });

  it("demerit 30-49 → demote but not dormant", () => {
    expect(tierFromDemerit(31, "enforced")).not.toBe("dormant");
    expect(tierFromDemerit(49, "experimental")).not.toBe("dormant");
  });

  it("experimental cannot demote below experimental", () => {
    expect(tierFromDemerit(5, "experimental")).toBe("experimental");
  });
});

describe("effectiveTier (pessimist)", () => {
  it("conf=stable, demerit=dormant → dormant", () => {
    expect(effectiveTier(0.6, 51, "stable")).toBe("dormant");
  });

  it("both happy: conf=enforced, demerit=0 → enforced", () => {
    expect(effectiveTier(0.95, 0, "enforced")).toBe("enforced");
  });

  it("dormant rule with demerit < 50 → resurrects (not dormant)", () => {
    // demerit decayed below 50; rule should leave dormant
    expect(effectiveTier(0.68, 31, "dormant")).not.toBe("dormant");
  });
});

describe("TIER_ORDER", () => {
  it("ordered experimental → enforced", () => {
    expect(TIER_ORDER).toEqual(["experimental", "probation", "stable", "canonical", "enforced"]);
  });
});
