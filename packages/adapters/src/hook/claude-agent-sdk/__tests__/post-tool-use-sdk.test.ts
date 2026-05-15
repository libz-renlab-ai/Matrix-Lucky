import { describe, it, expect, vi } from "vitest";
import { createPostToolUseHandler, inferToolSuccess } from "../post-tool-use-sdk.js";

describe("createPostToolUseHandler (SDK)", () => {
  it("emits hook-post.result events for each rule that fired in Pre", async () => {
    const mockEventLog = {
      append: vi.fn(),
      readLast: vi.fn().mockReturnValue([
        { id: "pre-1", kind: "hook-pre.warned", knowledge_id: "r1", tool_use_id: "tu-X", timestamp: "t" },
      ]),
    };
    const handler = createPostToolUseHandler({ eventLog: mockEventLog as any });

    await handler({
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "/a.ts" },
      tool_response: { success: true },
      tool_use_id: "tu-X",
    } as any);

    expect(mockEventLog.append).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "hook-post.result", knowledge_id: "r1" })
    );
  });

  it("infers success from tool_response", async () => {
    const handler = createPostToolUseHandler({
      eventLog: { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) } as any,
    });
    const result = await handler({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo" },
      tool_response: { is_error: false, exit_code: 0 },
      tool_use_id: "tu-OK",
    } as any);
    expect(result).toBeDefined();
  });

  it("infers failure from error tool_response", async () => {
    const mockEventLog = {
      append: vi.fn(),
      readLast: vi.fn().mockReturnValue([
        { id: "pre-1", kind: "hook-pre.blocked", knowledge_id: "r1", tool_use_id: "tu-FAIL", timestamp: "t" },
      ]),
    };
    const handler = createPostToolUseHandler({ eventLog: mockEventLog as any });
    await handler({
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: {},
      tool_response: { is_error: true, error: "something broke" },
      tool_use_id: "tu-FAIL",
    } as any);
    const call = mockEventLog.append.mock.calls.find((c: any[]) => c[0].kind === "hook-post.result");
    expect(call).toBeDefined();
    expect(call![0].payload?.success).toBe(false);
  });

  it("emits ai.override.ignored when hook-pre.warned exists for same tool_use_id", async () => {
    const recentEvents = [
      {
        kind: "hook-pre.warned",
        tool_use_id: "t1",
        knowledge_id: "rule-A",
        timestamp: new Date().toISOString(),
      },
    ];
    const appended: any[] = [];
    const handler = createPostToolUseHandler({
      eventLog: {
        append: (e: any) => appended.push(e),
        readLast: (_n: number) => recentEvents,
      } as any,
    });
    await handler({ tool_use_id: "t1", tool_response: { is_error: false } } as any);
    const ignored = appended.filter((e: any) => e.kind === "ai.override.ignored");
    expect(ignored).toHaveLength(1);
    expect(ignored[0]).toMatchObject({ knowledge_id: "rule-A", tool_use_id: "t1" });
  });

  it("does NOT emit ai.override.ignored when only hook-pre.blocked exists", async () => {
    const recentEvents = [
      {
        kind: "hook-pre.blocked",
        tool_use_id: "t1",
        knowledge_id: "rule-A",
        timestamp: new Date().toISOString(),
      },
    ];
    const appended: any[] = [];
    const handler = createPostToolUseHandler({
      eventLog: {
        append: (e: any) => appended.push(e),
        readLast: (_n: number) => recentEvents,
      } as any,
    });
    await handler({ tool_use_id: "t1", tool_response: {} } as any);
    expect(appended.filter((e: any) => e.kind === "ai.override.ignored")).toHaveLength(0);
  });

  it("emits ai.override.blocked_circumvented when recent blocked exists for same tool_name and tool succeeded", async () => {
    const recentEvents = [
      {
        kind: "hook-pre.blocked",
        tool_use_id: "t-prev",
        knowledge_id: "rule-B",
        tool_name: "Bash",
        timestamp: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
      },
    ];
    const appended: any[] = [];
    const handler = createPostToolUseHandler({
      eventLog: {
        append: (e: any) => appended.push(e),
        readLast: (_n: number) => recentEvents,
      } as any,
    });
    await handler({
      tool_name: "Bash",
      tool_use_id: "t-curr",
      tool_response: { is_error: false, exit_code: 0 },
    } as any);
    const circum = appended.filter((e: any) => e.kind === "ai.override.blocked_circumvented");
    expect(circum).toHaveLength(1);
    expect(circum[0]).toMatchObject({ knowledge_id: "rule-B", tool_use_id: "t-curr" });
  });

  it("does NOT emit blocked_circumvented when tool failed", async () => {
    const recentEvents = [
      {
        kind: "hook-pre.blocked",
        tool_use_id: "t-prev",
        knowledge_id: "rule-B",
        tool_name: "Bash",
        timestamp: new Date(Date.now() - 60_000).toISOString(),
      },
    ];
    const appended: any[] = [];
    const handler = createPostToolUseHandler({
      eventLog: {
        append: (e: any) => appended.push(e),
        readLast: (_n: number) => recentEvents,
      } as any,
    });
    await handler({
      tool_name: "Bash",
      tool_use_id: "t-curr",
      tool_response: { is_error: true, error: "failed" },
    } as any);
    expect(appended.filter((e: any) => e.kind === "ai.override.blocked_circumvented")).toHaveLength(0);
  });

  it("does NOT emit blocked_circumvented when tool_name differs", async () => {
    const recentEvents = [
      {
        kind: "hook-pre.blocked",
        tool_use_id: "t-prev",
        knowledge_id: "rule-B",
        tool_name: "Bash",
        timestamp: new Date(Date.now() - 60_000).toISOString(),
      },
    ];
    const appended: any[] = [];
    const handler = createPostToolUseHandler({
      eventLog: {
        append: (e: any) => appended.push(e),
        readLast: (_n: number) => recentEvents,
      } as any,
    });
    await handler({
      tool_name: "Write",
      tool_use_id: "t-curr",
      tool_response: { is_error: false },
    } as any);
    expect(appended.filter((e: any) => e.kind === "ai.override.blocked_circumvented")).toHaveLength(0);
  });
});

describe("B-057: inferToolSuccess non-boolean is_error", () => {
  it('is_error = "true" (string) → returns false', () => {
    expect(inferToolSuccess({ is_error: "true" })).toBe(false);
  });

  it("is_error = 1 (number) → returns false", () => {
    expect(inferToolSuccess({ is_error: 1 })).toBe(false);
  });

  it("is_error = false (bool) → returns true (not an error)", () => {
    expect(inferToolSuccess({ is_error: false })).toBe(true);
  });

  it("is_error = 0 (falsy number) → returns true (not an error)", () => {
    expect(inferToolSuccess({ is_error: 0 })).toBe(true);
  });
});
