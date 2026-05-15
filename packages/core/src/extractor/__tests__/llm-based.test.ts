import { describe, it, expect } from "vitest";
import {
  llmBasedKnowledgeExtractor,
  parseExtractionResponse,
} from "../llm-based.js";
import type { ExtractionInput } from "@teamagent/ports";

const VALID_JSON_OBJECT = {
  category: "E",
  tags: ["http-client", "dependency"],
  type: "avoidance",
  nature: "subjective",
  trigger: "需要发起 HTTP 请求",
  wrong_pattern: "axios",
  correct_pattern: "fetch",
  reasoning: "项目偏好零依赖",
};

const SAMPLE_INPUT: ExtractionInput = {
  kind: "correction",
  context: "USER: 不用 axios，用 fetch",
  weight: 0.95,
};

describe("parseExtractionResponse", () => {
  describe("raw JSON (no wrapper)", () => {
    it("parses clean JSON object", () => {
      const out = parseExtractionResponse(JSON.stringify(VALID_JSON_OBJECT));
      expect(out).toMatchObject({
        category: "E",
        type: "avoidance",
        nature: "subjective",
        wrong_pattern: "axios",
        correct_pattern: "fetch",
      });
      expect(out?.tags).toEqual(["http-client", "dependency"]);
    });
  });

  describe("fenced JSON block", () => {
    it("extracts from ```json ... ``` block", () => {
      const raw = "好的，这是答案:\n\n```json\n" +
        JSON.stringify(VALID_JSON_OBJECT) +
        "\n```\n\n希望有用！";
      const out = parseExtractionResponse(raw);
      expect(out?.category).toBe("E");
    });

    it("extracts from ``` ... ``` without json tag", () => {
      const raw = "```\n" + JSON.stringify(VALID_JSON_OBJECT) + "\n```";
      const out = parseExtractionResponse(raw);
      expect(out?.category).toBe("E");
    });
  });

  describe("null literal", () => {
    it("returns null for bare 'null'", () => {
      expect(parseExtractionResponse("null")).toBeNull();
    });

    it("returns null for 'null' in fenced block", () => {
      expect(parseExtractionResponse("```json\nnull\n```")).toBeNull();
    });

    it("returns null for 'Null' case-insensitively", () => {
      expect(parseExtractionResponse("  Null  ")).toBeNull();
    });
  });

  describe("braced-object fallback", () => {
    it("recovers JSON when surrounded by prose without fences", () => {
      const raw = `I think the answer is: ${JSON.stringify(VALID_JSON_OBJECT)} Does that help?`;
      const out = parseExtractionResponse(raw);
      expect(out?.category).toBe("E");
    });
  });

  describe("malformed input", () => {
    it("returns null for empty string", () => {
      expect(parseExtractionResponse("")).toBeNull();
    });

    it("returns null for unparseable garbage", () => {
      expect(parseExtractionResponse("not json at all")).toBeNull();
    });

    it("returns null for JSON array (not object)", () => {
      expect(parseExtractionResponse("[1,2,3]")).toBeNull();
    });

    it("returns null when JSON is truncated", () => {
      expect(parseExtractionResponse('{"category":"E"')).toBeNull();
    });
  });

  describe("field validation", () => {
    it("rejects invalid category", () => {
      const bad = { ...VALID_JSON_OBJECT, category: "X" };
      expect(parseExtractionResponse(JSON.stringify(bad))).toBeNull();
    });

    it("rejects invalid type enum", () => {
      const bad = { ...VALID_JSON_OBJECT, type: "other" };
      expect(parseExtractionResponse(JSON.stringify(bad))).toBeNull();
    });

    it("rejects invalid nature enum", () => {
      const bad = { ...VALID_JSON_OBJECT, nature: "neutral" };
      expect(parseExtractionResponse(JSON.stringify(bad))).toBeNull();
    });

    it("rejects empty trigger", () => {
      const bad = { ...VALID_JSON_OBJECT, trigger: "" };
      expect(parseExtractionResponse(JSON.stringify(bad))).toBeNull();
    });

    it("rejects empty correct_pattern", () => {
      const bad = { ...VALID_JSON_OBJECT, correct_pattern: "   " };
      expect(parseExtractionResponse(JSON.stringify(bad))).toBeNull();
    });

    it("accepts empty wrong_pattern (practice knowledge)", () => {
      const ok = { ...VALID_JSON_OBJECT, wrong_pattern: "" };
      const out = parseExtractionResponse(JSON.stringify(ok));
      expect(out?.wrong_pattern).toBe("");
    });

    it("coerces missing tags to empty array", () => {
      const { tags: _tags, ...rest } = VALID_JSON_OBJECT;
      const out = parseExtractionResponse(JSON.stringify(rest));
      expect(out?.tags).toEqual([]);
    });

    it("filters non-string tag entries", () => {
      const mixed = { ...VALID_JSON_OBJECT, tags: ["ok", 42, "", null, "good"] };
      const out = parseExtractionResponse(JSON.stringify(mixed));
      expect(out?.tags).toEqual(["ok", "good"]);
    });

    it("trims whitespace in string fields", () => {
      const padded = {
        ...VALID_JSON_OBJECT,
        trigger: "  x  ",
        correct_pattern: "  y  ",
        reasoning: "  z  ",
      };
      const out = parseExtractionResponse(JSON.stringify(padded));
      expect(out?.trigger).toBe("x");
      expect(out?.correct_pattern).toBe("y");
      expect(out?.reasoning).toBe("z");
    });
  });
});

describe("llmBasedKnowledgeExtractor.extract", () => {
  it("passes built prompt to callLLM and parses its response", async () => {
    let seenPrompt = "";
    const callLLM = async (prompt: string) => {
      seenPrompt = prompt;
      return JSON.stringify(VALID_JSON_OBJECT);
    };
    const out = await llmBasedKnowledgeExtractor.extract(SAMPLE_INPUT, callLLM);
    expect(out?.category).toBe("E");
    expect(seenPrompt).toContain("不用 axios");
    expect(seenPrompt).toContain("category");
  });

  it("returns null when LLM says null", async () => {
    const callLLM = async () => "null";
    const out = await llmBasedKnowledgeExtractor.extract(SAMPLE_INPUT, callLLM);
    expect(out).toBeNull();
  });

  it("returns null when LLM returns garbage", async () => {
    const callLLM = async () => "I don't know what to say";
    const out = await llmBasedKnowledgeExtractor.extract(SAMPLE_INPUT, callLLM);
    expect(out).toBeNull();
  });

  it("propagates LLM rejection (I/O errors)", async () => {
    const callLLM = async () => {
      throw new Error("network down");
    };
    await expect(
      llmBasedKnowledgeExtractor.extract(SAMPLE_INPUT, callLLM),
    ).rejects.toThrow("network down");
  });
});
