import { describe, it, expect } from "vitest";
import { computeConfidence, HALF_LIFE_DAYS } from "../wilson.js";
import type { Observation, Tier } from "@teamagent/ports";

const now = new Date("2026-04-16T12:00:00Z");

function obs(
  outcome: "success" | "failure",
  daysAgo: number,
  id = `o-${daysAgo}-${outcome}`,
): Observation {
  return {
    id,
    knowledge_id: "r",
    timestamp: new Date(now.getTime() - daysAgo * 24 * 3600 * 1000).toISOString(),
    outcome,
  };
}

describe("Wilson LB computeConfidence", () => {
  it("returns 0 when no observations", () => {
    expect(computeConfidence([], "experimental", now)).toBe(0);
  });

  it("perfect 10/10 recent observations → > 0.6", () => {
    const obsList = Array.from({ length: 10 }, (_, i) => obs("success", i, `s${i}`));
    const r = computeConfidence(obsList, "experimental", now);
    expect(r).toBeGreaterThan(0.6);
    expect(r).toBeLessThanOrEqual(1);
  });

  it("10/10 but 30 days ago with experimental half-life → decayed vs fresh", () => {
    const stale = Array.from({ length: 10 }, (_, i) => obs("success", 30 + i, `s${i}`));
    const fresh = Array.from({ length: 10 }, (_, i) => obs("success", i, `f${i}`));
    expect(computeConfidence(stale, "experimental", now)).toBeLessThan(
      computeConfidence(fresh, "experimental", now),
    );
  });

  it("tier with longer half-life decays slower", () => {
    const obsList = Array.from({ length: 10 }, (_, i) => obs("success", 60 + i, `s${i}`));
    const expHL = computeConfidence(obsList, "experimental", now);
    const enfHL = computeConfidence(obsList, "enforced", now);
    expect(enfHL).toBeGreaterThan(expHL);
  });

  it("mixed 5 success 5 failure → less than all success", () => {
    const mixed = [
      ...Array.from({ length: 5 }, (_, i) => obs("success", i, `s${i}`)),
      ...Array.from({ length: 5 }, (_, i) => obs("failure", i, `f${i}`)),
    ];
    const perfect = Array.from({ length: 10 }, (_, i) => obs("success", i, `p${i}`));
    expect(computeConfidence(mixed, "experimental", now)).toBeLessThan(
      computeConfidence(perfect, "experimental", now),
    );
  });

  it("result clamped [0,1]", () => {
    const r = computeConfidence(
      Array.from({ length: 1000 }, (_, i) => obs("success", 0, `s${i}`)),
      "experimental",
      now,
    );
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it("HALF_LIFE_DAYS covers all tiers except dormant", () => {
    expect(HALF_LIFE_DAYS.experimental).toBe(30);
    expect(HALF_LIFE_DAYS.probation).toBe(45);
    expect(HALF_LIFE_DAYS.stable).toBe(60);
    expect(HALF_LIFE_DAYS.canonical).toBe(75);
    expect(HALF_LIFE_DAYS.enforced).toBe(90);
  });

  it("B-059: observation with invalid timestamp is skipped — no NaN result", () => {
    const obsList: Observation[] = [
      { id: "o1", knowledge_id: "k", timestamp: "2026-04-27T00:00:00Z", outcome: "success" },
      { id: "o2", knowledge_id: "k", timestamp: "not-a-date",            outcome: "success" },
    ];
    const result = computeConfidence(obsList, "experimental", new Date("2026-04-27T12:00:00Z"));
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0); // valid obs still contributes
  });

  it("B-059: all-invalid timestamps → returns 0 (n=0 path)", () => {
    const obsList: Observation[] = [
      { id: "o1", knowledge_id: "k", timestamp: "", outcome: "success" },
    ];
    const result = computeConfidence(obsList, "experimental", new Date("2026-04-27T12:00:00Z"));
    expect(result).toBe(0);
  });
});
