import { describe, it, expect } from "vitest";
import { StdoutRenderer } from "../stdout-renderer.js";
import type { AttributionEvent, PitfallAddedEvent } from "@teamagent/types";

/**
 * Fixture：pitfall.added 事件最完整（含 knowledge change + skill md 路径 +
 * userFacingValue + counterfactual），覆盖 Renderer 全部输出分支。
 */
function makePitfallEvent(overrides: Partial<PitfallAddedEvent> = {}): PitfallAddedEvent {
  return {
    kind: "pitfall.added",
    source: "pitfall",
    knowledgeId: "rule-abc",
    category: "C",
    tag: "api-hallucination",
    level: "personal",
    knowledgeCountBefore: 15,
    knowledgeCountAfter: 16,
    skillMdPath: "/path/to/SKILL.md",
    severity: "highlight",
    timestamp: "2026-04-14T10:00:00Z",
    userFacingValue: 'AI 遇到 "stripe.charges" 时会改用 "paymentIntents"',
    counterfactual: "你会看到 AI 第二次踩同一个坑",
    ...overrides,
  };
}

describe("StdoutRenderer", () => {
  const renderer = new StdoutRenderer();

  describe("silent mode", () => {
    it("empty events → empty string", () => {
      expect(renderer.render([], "silent")).toBe("");
    });

    it("even with highlight events → empty string", () => {
      expect(renderer.render([makePitfallEvent()], "silent")).toBe("");
    });

    it("even with warning → empty string", () => {
      expect(renderer.render([makePitfallEvent({ severity: "warning" })], "silent")).toBe("");
    });
  });

  describe("smart mode (default)", () => {
    it("hides info severity", () => {
      const out = renderer.render(
        [makePitfallEvent({ severity: "info" })],
        "smart",
      );
      expect(out).toBe("");
    });

    it("shows highlight severity with action line", () => {
      const out = renderer.render([makePitfallEvent({ severity: "highlight" })], "smart");
      expect(out).toContain("添加知识条目 rule-abc");
    });

    it("shows warning severity", () => {
      const blockedEvent: AttributionEvent = {
        kind: "validator.blocked-promotion",
        source: "validator",
        knowledgeId: "rule-x",
        level: "l1",
        fromTier: "stable",
        toTier: "canonical",
        reason: "L1 blocked",
        severity: "warning",
        timestamp: "2026-04-14T10:00:00Z",
      };
      const out = renderer.render([blockedEvent], "smart");
      expect(out).toContain("阻断晋升");
    });

    it("shows userFacingValue line but NOT counterfactual", () => {
      const out = renderer.render([makePitfallEvent()], "smart");
      expect(out).toContain("paymentIntents");
      expect(out).not.toContain("第二次踩同一个坑");
    });

    it("contains divider lines and header", () => {
      const out = renderer.render([makePitfallEvent()], "smart");
      expect(out).toContain("TeamAgent");
      expect(out).toContain("━");
    });

    it("all-info events in smart mode → empty", () => {
      const out = renderer.render(
        [makePitfallEvent({ severity: "info" }), makePitfallEvent({ severity: "info" })],
        "smart",
      );
      expect(out).toBe("");
    });
  });

  describe("verbose mode", () => {
    it("shows info events", () => {
      const out = renderer.render(
        [makePitfallEvent({ severity: "info", knowledgeId: "rule-info" })],
        "verbose",
      );
      expect(out).toContain("rule-info");
    });

    it("shows counterfactual", () => {
      const out = renderer.render([makePitfallEvent()], "verbose");
      expect(out).toContain("第二次踩同一个坑");
    });

    it("appends raw JSON events at the end", () => {
      const out = renderer.render([makePitfallEvent()], "verbose");
      expect(out).toContain('"kind"');
      expect(out).toContain('"pitfall.added"');
    });
  });

  describe("snapshot (smart mode)", () => {
    it("matches the canonical attribution block format", () => {
      const out = renderer.render(
        [
          makePitfallEvent({
            knowledgeId: "rule-abc123",
            category: "C",
            tag: "api-hallucination",
            knowledgeCountBefore: 15,
            knowledgeCountAfter: 16,
            skillMdPath: "/skills/rule-abc123/SKILL.md",
            userFacingValue: 'AI 遇到 "stripe.charges" 时会改用 "paymentIntents"',
          }),
        ],
        "smart",
      );
      expect(out).toMatchInlineSnapshot(`
"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ TeamAgent · 本次操作归因
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▸ 做了什么: 添加知识条目 rule-abc123 (C/api-hallucination)
▸ 知识库变化: 15 → 16 条 (personal/C/api-hallucination)
▸ 传播到: /skills/rule-abc123/SKILL.md
▸ 下次体验: AI 遇到 "stripe.charges" 时会改用 "paymentIntents"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
`);
    });
  });

  describe("change and target rendering (M1 additions)", () => {
    it("renders '知识库变化 X → Y 条' for pitfall.added", () => {
      const out = renderer.render(
        [
          makePitfallEvent({
            knowledgeCountBefore: 15,
            knowledgeCountAfter: 16,
            level: "personal",
            category: "C",
            tag: "api-hallucination",
          }),
        ],
        "smart",
      );
      expect(out).toContain("知识库变化: 15 → 16 条");
      expect(out).toContain("personal/C/api-hallucination");
    });

    it("renders '传播到 <skill-md-path>' for pitfall.added", () => {
      const out = renderer.render(
        [makePitfallEvent({ skillMdPath: "/path/to/SKILL.md" })],
        "smart",
      );
      expect(out).toContain("传播到: /path/to/SKILL.md");
    });

    it("full pitfall-added attribution block snapshot", () => {
      const out = renderer.render(
        [
          makePitfallEvent({
            knowledgeId: "pers-abc123",
            category: "E",
            tag: "tech-choice",
            level: "personal",
            knowledgeCountBefore: 0,
            knowledgeCountAfter: 1,
            skillMdPath: "/skills/pers-abc123/SKILL.md",
            userFacingValue: "AI 遇到 'npm install moment' 时会改用 dayjs",
            counterfactual: "你会看到 AI 第二次踩同一个坑",
          }),
        ],
        "smart",
      );
      expect(out).toMatchInlineSnapshot(`
"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ TeamAgent · 本次操作归因
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▸ 做了什么: 添加知识条目 pers-abc123 (E/tech-choice)
▸ 知识库变化: 0 → 1 条 (personal/E/tech-choice)
▸ 传播到: /skills/pers-abc123/SKILL.md
▸ 下次体验: AI 遇到 'npm install moment' 时会改用 dayjs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
`);
    });
  });
});
