import { describe, it, expect } from "vitest";
import { parseInsightsReport } from "../insights.js";

describe("parseInsightsReport", () => {
  it("parses insights array into ExtractionInput[]", () => {
    const raw = JSON.stringify({
      insights: [
        { type: "correction", text: "用 fetch 别用 axios", weight: 0.9 },
        { type: "pattern", text: "每次都在 config/ 下新建...", weight: 0.6 },
      ],
    });
    const inputs = parseInsightsReport(raw);
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toEqual({
      kind: "insights",
      context: "[type=correction] 用 fetch 别用 axios",
      weight: 0.9,
    });
    expect(inputs[1]!.weight).toBe(0.6);
  });

  it("defaults weight to 0.7 when missing", () => {
    const raw = JSON.stringify({
      insights: [{ type: "x", text: "hello" }],
    });
    const inputs = parseInsightsReport(raw);
    expect(inputs[0]!.weight).toBe(0.7);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseInsightsReport("not json")).toThrow();
  });

  it("throws when top-level shape is wrong", () => {
    expect(() => parseInsightsReport(JSON.stringify({ foo: "bar" }))).toThrow();
  });

  it("throws when a weight is out of range", () => {
    const raw = JSON.stringify({
      insights: [{ type: "x", text: "y", weight: 2.0 }],
    });
    expect(() => parseInsightsReport(raw)).toThrow();
  });

  it("preserves Chinese / unicode text verbatim", () => {
    const raw = JSON.stringify({
      insights: [{ type: "纠正", text: "用 fetch 别用 axios", weight: 1 }],
    });
    const inputs = parseInsightsReport(raw);
    expect(inputs[0]!.context).toContain("用 fetch");
    expect(inputs[0]!.context).toContain("[type=纠正]");
  });
});
