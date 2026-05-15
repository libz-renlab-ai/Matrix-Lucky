import { describe, it, expect } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import { ruleBasedSuccessDetector } from "../rule-based.js";
import { parseSessionFile } from "../../session-parser/index.js";

const FIXTURE_ROOT = path.resolve(process.cwd(), "fixtures/sessions");

function loadFixture(name: string) {
  return parseSessionFile(
    nodeFs.readFileSync(path.join(FIXTURE_ROOT, name), "utf-8"),
  );
}

describe("ruleBasedSuccessDetector", () => {
  describe("explicit_praise signal", () => {
    it("catches '完美' + '就是这样' praise", () => {
      const session = loadFixture("success-praise-01.jsonl");
      const signals = ruleBasedSuccessDetector.detect(session);
      const hit = signals.find((s) => s.signal === "explicit_praise");
      expect(hit).toBeDefined();
      expect(hit!.weight).toBeGreaterThanOrEqual(0.7);
    });

    it("also catches '很好' in mixed fixture", () => {
      const session = loadFixture("mixed-01.jsonl");
      const signals = ruleBasedSuccessDetector.detect(session);
      const hit = signals.find((s) => s.signal === "explicit_praise");
      expect(hit).toBeDefined();
    });
  });

  describe("one_shot_success signal", () => {
    it("fires when first task completes and user moves to next", () => {
      const session = loadFixture("success-oneshot-01.jsonl");
      const signals = ruleBasedSuccessDetector.detect(session);
      const hit = signals.find((s) => s.signal === "one_shot_success");
      expect(hit).toBeDefined();
    });

    it("does NOT fire after correction pattern", () => {
      const session = loadFixture("correction-denial-01.jsonl");
      const signals = ruleBasedSuccessDetector.detect(session);
      // 被纠正的 turn 不应报 one_shot_success
      expect(signals.find((s) => s.signal === "one_shot_success")).toBeUndefined();
    });
  });

  describe("repeated_pattern signal", () => {
    it("fires when same tool + similar intent repeats 3+ times", () => {
      const session = loadFixture("success-repeated-01.jsonl");
      const signals = ruleBasedSuccessDetector.detect(session);
      const hit = signals.find((s) => s.signal === "repeated_pattern");
      expect(hit).toBeDefined();
      expect(hit!.weight).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe("negative cases", () => {
    it("pure info query has no explicit_praise", () => {
      const session = loadFixture("negative-no-signal-01.jsonl");
      const signals = ruleBasedSuccessDetector.detect(session);
      expect(signals.find((s) => s.signal === "explicit_praise")).toBeUndefined();
    });
  });

  describe("ordering", () => {
    it("returns signals sorted by turnIndex", () => {
      const session = loadFixture("mixed-01.jsonl");
      const signals = ruleBasedSuccessDetector.detect(session);
      for (let i = 1; i < signals.length; i++) {
        expect(signals[i]!.turnIndex).toBeGreaterThanOrEqual(
          signals[i - 1]!.turnIndex,
        );
      }
    });
  });
});
