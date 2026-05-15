import { describe, it, expect, vi } from "vitest";
import {
  createPostToolUseHandler,
  inferToolSuccess,
  type PostToolUseDeps,
} from "../post-tool-use-handler.js";

/**
 * Default deps factory — production ids/now are injected so tests are deterministic.
 * Override individual fields via spread; pass real mocks for eventLog.
 */
function makeDeps(overrides: Partial<PostToolUseDeps> = {}): PostToolUseDeps {
  return {
    eventLog: { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) } as any,
    idGen: () => "fixed-uuid",
    now: () => "2026-05-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("createPostToolUseHandler (core)", () => {
  it("emits hook-post.result for each Pre event with knowledge_id and forwards injected now", async () => {
    const append = vi.fn();
    const readLast = vi.fn().mockReturnValue([
      {
        id: "pre-1",
        kind: "hook-pre.warned",
        knowledge_id: "rule-A",
        tool_use_id: "tu-X",
        timestamp: "t-pre",
      },
    ]);
    const handler = createPostToolUseHandler(
      makeDeps({
        eventLog: { append, readLast } as any,
        now: () => "2026-05-08T12:34:56.000Z",
      }),
    );

    await handler({
      tool_name: "Edit",
      tool_input: { file_path: "/a.ts" },
      tool_response: { success: true },
      tool_use_id: "tu-X",
    });

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "hook-post.result",
        knowledge_id: "rule-A",
        tool_use_id: "tu-X",
        timestamp: "2026-05-08T12:34:56.000Z",
        payload: { success: true, source_pre_kind: "hook-pre.warned" },
      }),
    );
  });

  it("uses injected idGen as fallback when input.tool_use_id is omitted", async () => {
    const append = vi.fn();
    let counter = 0;
    const readLast = vi.fn().mockReturnValue([]);
    const handler = createPostToolUseHandler(
      makeDeps({
        eventLog: { append, readLast } as any,
        idGen: () => `det-${++counter}`,
      }),
    );

    // tool_use_id omitted → handler must use deps.idGen()
    await handler({
      tool_name: "Bash",
      tool_input: {},
      tool_response: {},
    });
    await handler({
      tool_name: "Bash",
      tool_input: {},
      tool_response: {},
    });

    // idGen runs even when no events fire (fallback for tool_use_id)
    expect(counter).toBe(2);
  });

  it("emits ai.override.ignored when hook-pre.warned exists for same tool_use_id", async () => {
    const append = vi.fn();
    const readLast = vi.fn().mockReturnValue([
      {
        kind: "hook-pre.warned",
        tool_use_id: "t1",
        knowledge_id: "rule-A",
        timestamp: "2026-05-08T00:00:00.000Z",
      },
    ]);
    const handler = createPostToolUseHandler(
      makeDeps({
        eventLog: { append, readLast } as any,
        now: () => "2026-05-08T00:00:01.000Z",
      }),
    );

    await handler({ tool_use_id: "t1", tool_response: { is_error: false } });

    const ignored = append.mock.calls
      .map((c: any[]) => c[0])
      .filter((e: any) => e.kind === "ai.override.ignored");
    expect(ignored).toHaveLength(1);
    expect(ignored[0]).toMatchObject({
      knowledge_id: "rule-A",
      tool_use_id: "t1",
      timestamp: "2026-05-08T00:00:01.000Z",
    });
  });

  it("does NOT emit ai.override.blocked_circumvented when tool failed", async () => {
    const append = vi.fn();
    const readLast = vi.fn().mockReturnValue([
      {
        kind: "hook-pre.blocked",
        tool_use_id: "t-prev",
        knowledge_id: "rule-B",
        tool_name: "Bash",
        // 1 minute before fixed `now` → recent enough to qualify in detection window
        timestamp: "2026-05-08T11:59:00.000Z",
      },
    ]);
    const handler = createPostToolUseHandler(
      makeDeps({
        eventLog: { append, readLast } as any,
        now: () => "2026-05-08T12:00:00.000Z",
      }),
    );

    await handler({
      tool_name: "Bash",
      tool_use_id: "t-curr",
      tool_response: { is_error: true, error: "broke" },
    });

    expect(
      append.mock.calls
        .map((c: any[]) => c[0])
        .filter((e: any) => e.kind === "ai.override.blocked_circumvented"),
    ).toHaveLength(0);
  });

  it("emits ai.override.blocked_circumvented when same tool_name was recently blocked AND tool succeeded — uses injected now as 'currentTime'", async () => {
    const append = vi.fn();
    // 1 minute before fixed `now` puts the prev block well inside the detection window
    const readLast = vi.fn().mockReturnValue([
      {
        kind: "hook-pre.blocked",
        tool_use_id: "t-prev",
        knowledge_id: "rule-B",
        tool_name: "Bash",
        timestamp: "2026-05-08T11:59:00.000Z",
      },
    ]);
    const handler = createPostToolUseHandler(
      makeDeps({
        eventLog: { append, readLast } as any,
        now: () => "2026-05-08T12:00:00.000Z",
      }),
    );

    await handler({
      tool_name: "Bash",
      tool_use_id: "t-curr",
      tool_response: { is_error: false, exit_code: 0 },
    });

    const circum = append.mock.calls
      .map((c: any[]) => c[0])
      .filter((e: any) => e.kind === "ai.override.blocked_circumvented");
    expect(circum).toHaveLength(1);
    expect(circum[0]).toMatchObject({
      knowledge_id: "rule-B",
      tool_use_id: "t-curr",
      timestamp: "2026-05-08T12:00:00.000Z",
    });
  });
});

describe("B-057: inferToolSuccess non-boolean is_error (re-exported from core)", () => {
  it('is_error = "true" (string) → returns false', () => {
    expect(inferToolSuccess({ is_error: "true" })).toBe(false);
  });

  it("is_error = 1 (number) → returns false", () => {
    expect(inferToolSuccess({ is_error: 1 })).toBe(false);
  });

  it("is_error = false (bool) → returns true", () => {
    expect(inferToolSuccess({ is_error: false })).toBe(true);
  });

  it("is_error = 0 (falsy number) → returns true", () => {
    expect(inferToolSuccess({ is_error: 0 })).toBe(true);
  });

  it("null / undefined / non-object → treated as success", () => {
    expect(inferToolSuccess(null)).toBe(true);
    expect(inferToolSuccess(undefined)).toBe(true);
    expect(inferToolSuccess("string-payload")).toBe(true);
    expect(inferToolSuccess(123)).toBe(true);
  });

  it("error field truthy → returns false", () => {
    expect(inferToolSuccess({ error: "boom" })).toBe(false);
    expect(inferToolSuccess({ error: { msg: "boom" } })).toBe(false);
  });

  it("exit_code non-zero number → returns false", () => {
    expect(inferToolSuccess({ exit_code: 1 })).toBe(false);
    expect(inferToolSuccess({ exit_code: 127 })).toBe(false);
  });
});
