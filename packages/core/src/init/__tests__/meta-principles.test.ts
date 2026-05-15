import { describe, it, expect } from "vitest";
import { getMetaPrinciples } from "../meta-principles.js";
import { KnowledgeEntrySchema } from "@teamagent/types";

describe("getMetaPrinciples", () => {
  it("returns exactly 8 entries", () => {
    expect(getMetaPrinciples()).toHaveLength(8);
  });

  it("honors injected now()", () => {
    const fixed = new Date("2026-04-27T00:00:00Z");
    const principles = getMetaPrinciples(() => fixed);
    expect(principles[0]!.created_at).toBe(fixed.toISOString());
  });

  it("contains the 4 retained presets", () => {
    const principles = getMetaPrinciples();
    const ids = principles.map((p) => p.id);
    expect(ids).toContain("preset-tdd-cycle");
    expect(ids).toContain("preset-small-commits");
    expect(ids).toContain("preset-prefer-edit-over-create");
    expect(ids).toContain("preset-search-web-before-trusting-memory");
  });

  it("contains the 4 new presets", () => {
    const principles = getMetaPrinciples();
    const ids = principles.map((p) => p.id);
    expect(ids).toContain("preset-audience-adaptive");
    expect(ids).toContain("preset-execute-not-analyze");
    expect(ids).toContain("preset-read-before-asserting");
    expect(ids).toContain("preset-full-pipeline-for-complex");
  });

  it("does NOT contain removed presets", () => {
    const principles = getMetaPrinciples();
    const ids = principles.map((p) => p.id);
    expect(ids).not.toContain("preset-pitfall-cli");
    expect(ids).not.toContain("preset-prefer-gstack-tooling");
  });

  it("all entries have source=preset and status=active", () => {
    const principles = getMetaPrinciples();
    for (const p of principles) {
      expect(p.source).toBe("preset");
      expect(p.status).toBe("active");
    }
  });

  it("all entries are valid KnowledgeEntry objects", () => {
    const principles = getMetaPrinciples();
    for (const p of principles) {
      const result = KnowledgeEntrySchema.safeParse(p);
      expect(result.success, `Entry ${p.id} failed schema: ${!result.success ? JSON.stringify(result.error?.issues) : ""}`).toBe(true);
    }
  });
});
