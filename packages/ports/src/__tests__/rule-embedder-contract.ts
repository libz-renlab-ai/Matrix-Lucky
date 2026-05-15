import { describe, expect, it } from "vitest";
import type { RuleEmbedder } from "../rule-embedder.js";

export function ruleEmbedderContractSuite(factory: () => RuleEmbedder): void {
  describe("RuleEmbedder contract", () => {
    it("reports stable dim and modelId", () => {
      const e = factory();
      expect(e.dim).toBeGreaterThan(0);
      expect(e.modelId).toBeTruthy();
    });

    it("returns vectors with declared dim", async () => {
      const e = factory();
      const vectors = await e.embed(["hello world"]);
      expect(vectors).toHaveLength(1);
      const v = vectors[0]!;
      expect(v).toHaveLength(e.dim);
    });

    it("returns normalized vectors (L2 norm ≈ 1)", async () => {
      const e = factory();
      const vectors = await e.embed(["hello"]);
      expect(vectors).toHaveLength(1);
      const v = vectors[0]!;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 2);
    });

    it("batch and single give the same vector", async () => {
      const e = factory();
      const batchVectors = await e.embed(["test input", "other"]);
      const singleVectors = await e.embed(["test input"]);
      expect(batchVectors).toHaveLength(2);
      expect(singleVectors).toHaveLength(1);
      const vBatch = batchVectors[0]!;
      const vSingle = singleVectors[0]!;
      for (let i = 0; i < e.dim; i++) {
        expect(vBatch[i]!).toBeCloseTo(vSingle[i]!, 5);
      }
    });

    it("empty input returns empty array", async () => {
      const e = factory();
      const out = await e.embed([]);
      expect(out).toEqual([]);
    });
  });
}
