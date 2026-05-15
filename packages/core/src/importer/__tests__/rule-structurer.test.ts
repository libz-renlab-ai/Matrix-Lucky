import { describe, it, expect } from "vitest";
import {
  structureRuleText,
  structureRuleTextsBatch,
  DEFAULT_IMPORT_CONFIDENCE,
} from "../rule-structurer.js";
import type { AttributionBus } from "@teamagent/ports";
import type { AttributionEvent } from "@teamagent/types";

const STRUCTURED_SAMPLE = {
  category: "E",
  tags: ["tdd"],
  type: "practice",
  nature: "subjective",
  trigger: "开始新功能实现前",
  wrong_pattern: "",
  correct_pattern: "先写失败测试再写实现",
  reasoning: "TDD 是团队约定",
};

describe("structureRuleText", () => {
  it("calls LLM with a rule-text-shaped prompt and returns Partial", async () => {
    let seenPrompt = "";
    const callLLM = async (p: string) => {
      seenPrompt = p;
      return JSON.stringify(STRUCTURED_SAMPLE);
    };
    const out = await structureRuleText("TDD: 先测后写", callLLM);
    expect(out).toMatchObject({
      category: "E",
      type: "practice",
      correct_pattern: "先写失败测试再写实现",
    });
    // prompt 应包含 rule-text header 标识
    expect(seenPrompt).toContain("规则文本");
    expect(seenPrompt).toContain("TDD: 先测后写");
  });

  it("empty / whitespace text → null (without LLM call)", async () => {
    let called = false;
    const callLLM = async () => {
      called = true;
      return "";
    };
    expect(await structureRuleText("", callLLM)).toBeNull();
    expect(await structureRuleText("   \n  ", callLLM)).toBeNull();
    expect(called).toBe(false);
  });

  it("LLM returns null literal → null", async () => {
    const out = await structureRuleText("meaningless rule", async () => "null");
    expect(out).toBeNull();
  });

  it("LLM returns unparseable → null (extractor contract)", async () => {
    const out = await structureRuleText("some rule", async () => "???");
    expect(out).toBeNull();
  });

  it("propagates LLM I/O errors", async () => {
    await expect(
      structureRuleText("rule", async () => {
        throw new Error("LLM offline");
      }),
    ).rejects.toThrow("LLM offline");
  });
});

describe("DEFAULT_IMPORT_CONFIDENCE", () => {
  it("is moderate (0.6–0.8 range)", () => {
    expect(DEFAULT_IMPORT_CONFIDENCE).toBeGreaterThanOrEqual(0.6);
    expect(DEFAULT_IMPORT_CONFIDENCE).toBeLessThanOrEqual(0.8);
  });
});

describe("structureRuleTextsBatch", () => {
  class RecordingBus implements AttributionBus {
    events: AttributionEvent[] = [];
    emit(e: AttributionEvent) {
      this.events.push(e);
    }
    subscribe() {
      return () => {};
    }
    drain() {
      return this.events.splice(0);
    }
  }

  it("structures all rules when LLM is happy", async () => {
    const callLLM = async () => JSON.stringify(STRUCTURED_SAMPLE);
    const r = await structureRuleTextsBatch(["a", "b", "c"], callLLM);
    expect(r.total).toBe(3);
    expect(r.structured).toHaveLength(3);
    expect(r.skipped).toBe(0);
    expect(r.failed).toBe(0);
    expect(r.structured[0]!.sourceText).toBe("a");
  });

  it("splits into structured/skipped/failed by LLM outcome", async () => {
    let call = 0;
    const callLLM = async () => {
      call++;
      if (call === 1) return JSON.stringify(STRUCTURED_SAMPLE); // ok
      if (call === 2) return "null"; // skipped
      throw new Error("boom"); // failed
    };
    const r = await structureRuleTextsBatch(["x", "y", "z"], callLLM);
    expect(r.structured).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.failed).toBe(1);
  });

  it("skips empty strings without calling LLM", async () => {
    let calls = 0;
    const callLLM = async () => {
      calls++;
      return JSON.stringify(STRUCTURED_SAMPLE);
    };
    const r = await structureRuleTextsBatch(["a", "", "  ", "b"], callLLM);
    expect(calls).toBe(2);
    expect(r.structured).toHaveLength(2);
    expect(r.skipped).toBe(2);
  });

  it("emits importer events when bus provided", async () => {
    const bus = new RecordingBus();
    let call = 0;
    const callLLM = async () => {
      call++;
      if (call === 1) return JSON.stringify(STRUCTURED_SAMPLE);
      return "null";
    };
    await structureRuleTextsBatch(["a", "b"], callLLM, { bus });
    const kinds = bus.events.map((e) => e.kind);
    expect(kinds).toContain("importer.structured");
    expect(kinds).toContain("importer.skipped");
  });

  it("empty input list → zero everything", async () => {
    const r = await structureRuleTextsBatch([], async () => "");
    expect(r).toEqual({ total: 0, structured: [], skipped: 0, failed: 0 });
  });
});
