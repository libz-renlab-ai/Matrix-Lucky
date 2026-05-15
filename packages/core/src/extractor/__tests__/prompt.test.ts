import { describe, it, expect } from "vitest";
import { buildExtractionPrompt, buildRetrofitPrompt } from "../prompt.js";
import type { ExtractionInput } from "@teamagent/ports";

const SAMPLE: ExtractionInput = {
  kind: "correction",
  context: "USER: 不用 axios，用 fetch，项目要零依赖\nAI: 好的。",
  weight: 0.95,
};

describe("buildExtractionPrompt", () => {
  it("embeds the context verbatim", () => {
    const p = buildExtractionPrompt(SAMPLE);
    expect(p).toContain("不用 axios，用 fetch");
  });

  it("includes the weight in the context block", () => {
    const p = buildExtractionPrompt(SAMPLE);
    expect(p).toContain("0.95");
  });

  it("names all 8 output fields", () => {
    const p = buildExtractionPrompt(SAMPLE);
    for (const field of [
      "category",
      "tags",
      "type",
      "nature",
      "trigger",
      "wrong_pattern",
      "correct_pattern",
      "reasoning",
    ]) {
      expect(p).toContain(field);
    }
  });

  it("lists all category letters C/E/S/K with Chinese labels", () => {
    const p = buildExtractionPrompt(SAMPLE);
    expect(p).toMatch(/C.*代码层/);
    expect(p).toMatch(/E.*工程层/);
    expect(p).toMatch(/S.*策略层/);
    expect(p).toMatch(/K.*认知层/);
  });

  it("includes both type values and both nature values", () => {
    const p = buildExtractionPrompt(SAMPLE);
    expect(p).toContain("avoidance");
    expect(p).toContain("practice");
    expect(p).toContain("objective");
    expect(p).toContain("subjective");
  });

  it("instructs null output for low-signal cases", () => {
    const p = buildExtractionPrompt(SAMPLE);
    expect(p).toContain("null");
  });

  it("requests JSON fenced block format", () => {
    const p = buildExtractionPrompt(SAMPLE);
    expect(p).toMatch(/```json/);
  });

  it("has at least one few-shot example with a full JSON answer", () => {
    const p = buildExtractionPrompt(SAMPLE);
    // Example should show a full JSON blob with keys
    expect(p).toMatch(/"category"\s*:\s*"[CESK]"/);
    expect(p).toMatch(/"trigger"\s*:\s*"[^"]+"/);
  });

  it("adapts header to success input kind", () => {
    const p = buildExtractionPrompt({ ...SAMPLE, kind: "success" });
    expect(p).toContain("成功模式");
  });

  it("adapts header to rule-text input kind", () => {
    const p = buildExtractionPrompt({ ...SAMPLE, kind: "rule-text" });
    expect(p).toContain("规则文本");
  });

  it.each([
    ["insights", "/insights"],
    ["npm-audit", "npm audit"],
    ["pr-review", "PR review"],
    ["git-hotspot", "热点文件"],
    ["ci-failure", "CI"],
  ] as const)("kind=%s → header mentions '%s'", (kind, fragment) => {
    const p = buildExtractionPrompt({ ...SAMPLE, kind });
    expect(p).toContain(fragment);
  });

  it("enforces generic keyword rule on wrong_pattern with 18 categories", () => {
    const p = buildExtractionPrompt(SAMPLE);
    // 元原则 3 条
    expect(p).toContain("字面稳定");
    expect(p).toContain("substring 命中");
    expect(p).toContain("脱离上下文");
    // 5 大组
    for (const group of ["A1", "A2", "A3", "A4", "A5", "B1", "B2", "B3", "B4", "B5", "C1", "C2", "C3", "D1", "D2", "E1", "E2", "E3"]) {
      expect(p).toContain(group);
    }
    // 四条铁律 + 禁止
    expect(p).toContain("最长公共片段");
    expect(p).toContain("不写正则");
    expect(p).toContain("整句自然语言");
    // 反例 (先前加的)
    expect(p).toContain("不要这样做");
  });

  it("trims the context to avoid stray whitespace", () => {
    const p = buildExtractionPrompt({
      ...SAMPLE,
      context: "\n\n   hello world   \n\n",
    });
    expect(p).toContain("hello world");
    // No 4+ consecutive newlines around the context
    expect(p).not.toMatch(/\n\n\n\n/);
  });
});

describe("buildRetrofitPrompt", () => {
  const SAMPLE_RULE = {
    trigger: "需要发 HTTP 请求时",
    wrong_pattern: "AI 直接跑 npm install moment, 没先查项目用没用别的",
    correct_pattern: "用 fetch 或 dayjs 这类轻量方案",
    reasoning: "项目零依赖偏好",
    tags: ["http-client", "tech-choice"],
  };

  it("embeds all 4 rule fields in the prompt", () => {
    const p = buildRetrofitPrompt(SAMPLE_RULE);
    expect(p).toContain("需要发 HTTP 请求时");
    expect(p).toContain("npm install moment");
    expect(p).toContain("fetch 或 dayjs");
    expect(p).toContain("零依赖偏好");
  });

  it("lists all 18 allowed keyword categories A1..E3", () => {
    const p = buildRetrofitPrompt(SAMPLE_RULE);
    for (const g of ["A1", "A2", "A3", "A4", "A5", "B1", "B2", "B3", "B4", "B5", "C1", "C2", "C3", "D1", "D2", "E1", "E2", "E3"]) {
      expect(p).toContain(g);
    }
  });

  it("includes the 3 meta-principles", () => {
    const p = buildRetrofitPrompt(SAMPLE_RULE);
    expect(p).toContain("字面稳定");
    expect(p).toContain("substring 命中");
    expect(p).toContain("脱离上下文");
  });

  it("includes the 4 iron rules", () => {
    const p = buildRetrofitPrompt(SAMPLE_RULE);
    expect(p).toContain("最长公共片段");
    expect(p).toContain("pipe 分多");
    expect(p).toContain("避免过度通用");
    expect(p).toContain("不写正则");
  });

  it("forbids the anti-patterns explicitly", () => {
    const p = buildRetrofitPrompt(SAMPLE_RULE);
    expect(p).toMatch(/禁止/);
    expect(p).toContain("整句自然语言");
    expect(p).toContain("项目内部路径");
    expect(p).toContain("超长字面量");
  });

  it("asks for plain text output (one line), not JSON", () => {
    const p = buildRetrofitPrompt(SAMPLE_RULE);
    expect(p).toContain("一行纯文本");
    expect(p).not.toMatch(/```json/);
  });

  it("instructs `null` literal when no generic keyword found", () => {
    const p = buildRetrofitPrompt(SAMPLE_RULE);
    expect(p).toMatch(/null/);
  });
});
