import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseSessionFile } from "../index.js";

const FIXTURE_ROOT = path.resolve(process.cwd(), "fixtures/sessions");

function load(name: string) {
  return parseSessionFile(fs.readFileSync(path.join(FIXTURE_ROOT, name), "utf-8"));
}

describe("parseSessionFile — real Claude Code jsonl shapes", () => {
  it("treats tool_result-only user messages as attachments to the prior turn, not new turns", () => {
    const session = load("real-claude-code-tool-result-as-user.jsonl");
    // 期望: 2 个真正的用户 turn (u1="改下 X", u2="不对，改错了")
    // 不期望: 每个 tool_result 冒出一个空 turn
    expect(session.turns.length).toBe(2);
    expect(session.turns[0]!.userMessage).toBe("改下 X");
    expect(session.turns[1]!.userMessage).toBe("不对，改错了");
  });

  it("populates tool_result content + succeeded flag from user-message blocks", () => {
    const session = load("real-claude-code-tool-result-as-user.jsonl");
    const turn0 = session.turns[0]!;
    expect(turn0.toolCalls).toHaveLength(1);
    expect(turn0.toolCalls[0]!.name).toBe("Edit");
    expect(turn0.toolCalls[0]!.result).toBe("file modified");
    expect(turn0.toolCalls[0]!.succeeded).toBe(true);
  });

  it("flags tool_result with 'ERR!' as failed", () => {
    const session = load("real-claude-code-tool-failure-in-user.jsonl");
    const turn0 = session.turns[0]!;
    expect(turn0.toolCalls).toHaveLength(1);
    expect(turn0.toolCalls[0]!.succeeded).toBe(false);
    expect(turn0.toolCalls[0]!.result).toContain("npm ERR!");
  });

  it("prevTurn of the denial keeps the offending AI behavior (not an empty shell)", () => {
    const session = load("real-claude-code-tool-result-as-user.jsonl");
    const denialTurn = session.turns[1]!;
    // 前一轮必须保留 AI 真实做的事 — 包括 tool_use
    const prev = session.turns[0]!;
    expect(prev.assistantText).toContain("已完成");
    expect(prev.assistantText).toContain("好的");
    expect(prev.toolCalls.length).toBeGreaterThan(0);
    // 并且 denial turn 自己有文本
    expect(denialTurn.userMessage).toContain("不对");
  });

  it("reads user text when content is an array of text blocks", () => {
    const session = load("real-claude-code-array-user-text.jsonl");
    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]!.userMessage).toContain("不对");
    expect(session.turns[0]!.userMessage).toContain("错了");
  });
});
