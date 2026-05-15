import { describe, it, expect } from "vitest";
import { scoreSoftAnd } from "../soft-and-scorer.js";

describe("scoreSoftAnd", () => {
  it("rewards high triggerSim + high patternSim", () => {
    const s = scoreSoftAnd({ triggerSim: 0.8, patternSim: 0.8, hardNegativeSims: [] });
    expect(s).toBeGreaterThan(0.6);
  });

  it("applies floor penalty when one sim is low", () => {
    const bothHigh = scoreSoftAnd({ triggerSim: 0.8, patternSim: 0.8, hardNegativeSims: [] });
    const oneLow = scoreSoftAnd({ triggerSim: 0.8, patternSim: 0.3, hardNegativeSims: [] });
    expect(bothHigh).toBeGreaterThan(oneLow + 0.1);
  });

  it("subtracts hard-negative penalty", () => {
    const noHn = scoreSoftAnd({ triggerSim: 0.8, patternSim: 0.8, hardNegativeSims: [] });
    const withHn = scoreSoftAnd({ triggerSim: 0.8, patternSim: 0.8, hardNegativeSims: [0.9] });
    expect(withHn).toBeLessThan(noHn - 0.3);
  });

  it("is pure (same inputs → same output)", () => {
    const args = { triggerSim: 0.7, patternSim: 0.6, hardNegativeSims: [0.4] };
    expect(scoreSoftAnd(args)).toBe(scoreSoftAnd(args));
  });
});
