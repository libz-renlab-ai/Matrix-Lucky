import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseSessionFile } from "../index.js";
import { ruleBasedCorrectionDetector } from "../../correction-detector/rule-based.js";

const FIXTURE_ROOT = path.resolve(process.cwd(), "fixtures/sessions");

/**
 * End-to-end proof for the user-reported bug:
 *   "当用户在对话中明确说"不对""错了"之后，为什么规则没有被扫描出来？"
 *
 * Before the parser fix, tool_result blocks (which Claude Code emits as
 * type:"user" messages) inflated turn counts and corrupted prevTurn, so
 * the denial's offending-behavior context was lost. This test locks that
 * scenario end-to-end.
 */
describe("denial detection on realistic Claude Code jsonl (E2E)", () => {
  it("extracts explicit_denial with correct offending-behavior context after tool_result", () => {
    const raw = fs.readFileSync(
      path.join(FIXTURE_ROOT, "real-claude-code-tool-result-as-user.jsonl"),
      "utf-8",
    );
    const session = parseSessionFile(raw);
    const corrections = ruleBasedCorrectionDetector.detect(session);

    const denial = corrections.find((c) => c.signal === "explicit_denial");
    expect(denial, "denial signal must be produced").toBeDefined();
    expect(denial!.correctionText).toContain("不对");

    // The offending behavior (from the prev turn) must carry through:
    // - the AI actually acknowledged + produced content ("已完成" etc.)
    // - and the tool call must be captured with its result + succeeded flag
    expect(denial!.previousAssistantText.length).toBeGreaterThan(0);
    expect(denial!.previousToolCalls.length).toBeGreaterThan(0);
    expect(denial!.previousToolCalls[0]!).toContain("Edit");
  });
});
