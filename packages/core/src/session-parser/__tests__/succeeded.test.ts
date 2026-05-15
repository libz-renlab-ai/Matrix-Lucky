import { describe, it, expect } from "vitest";
import { parseSessionFile } from "../index.js";

describe("B-052: extractToolResults succeeded heuristic", () => {
  it("succeeded regex: 'errno' in content → succeeded=false", () => {
    const assistant = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }],
      },
    });
    const userInit = JSON.stringify({
      type: "user",
      sessionId: "s1",
      message: { role: "user", content: "run it" },
      timestamp: "2026-04-27T00:00:00Z",
    });
    const toolResult = JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: '{"errno": -13, "code": "EACCES"}' }],
      },
    });
    const raw = [userInit, assistant, toolResult].join("\n");
    const parsed = parseSessionFile(raw);
    const tc = parsed.turns[0]?.toolCalls[0];
    expect(tc?.succeeded).toBe(false);
  });

  it("succeeded regex: 'error' keyword → succeeded=false (existing behavior preserved)", () => {
    const assistant = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t2", name: "Read", input: { file_path: "/x" } }],
      },
    });
    const userInit = JSON.stringify({
      type: "user",
      sessionId: "s1",
      message: { role: "user", content: "read it" },
      timestamp: "2026-04-27T00:00:00Z",
    });
    const toolResult = JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t2", content: "Error: ENOENT no such file" }],
      },
    });
    const raw = [userInit, assistant, toolResult].join("\n");
    const parsed = parseSessionFile(raw);
    const tc = parsed.turns[0]?.toolCalls[0];
    expect(tc?.succeeded).toBe(false);
  });
});
