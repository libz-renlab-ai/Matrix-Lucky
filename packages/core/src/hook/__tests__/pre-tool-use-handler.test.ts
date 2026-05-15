import { describe, it, expect, vi } from "vitest";
import {
  createPreToolUseHandler,
  type PreToolUseDeps,
} from "../pre-tool-use-handler.js";

/**
 * Default deps factory — production ids/now/formatStyle are injected so tests are deterministic.
 * Override individual fields via spread; pass real mocks for matcher / eventLog.
 */
function makeDeps(overrides: Partial<PreToolUseDeps> = {}): PreToolUseDeps {
  return {
    matcher: { match: vi.fn().mockResolvedValue({ matched: [] }) } as any,
    eventLog: { append: vi.fn(), readLast: vi.fn().mockReturnValue([]) } as any,
    idGen: () => "fixed-uuid",
    now: () => "2026-05-08T00:00:00.000Z",
    formatStyle: "ascii-box",
    ...overrides,
  };
}

describe("createPreToolUseHandler (core)", () => {
  it("clean pass with no rules → allow + emits hook-pre.passed using injected idGen and now", async () => {
    const append = vi.fn();
    const handler = createPreToolUseHandler(
      makeDeps({
        eventLog: { append, readLast: vi.fn().mockReturnValue([]) } as any,
        idGen: () => "id-from-test",
        now: () => "2026-05-08T12:34:56.000Z",
      }),
    );

    const result = await handler({
      tool_name: "Edit",
      tool_input: { file_path: "/a.ts", new_string: "x" },
      // tool_use_id omitted → handler must use injected idGen
    });

    expect(result.permissionDecision).toBe("allow");
    expect(result.systemMessage).toBeUndefined();
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "hook-pre.passed",
        tool_use_id: "id-from-test",
        timestamp: "2026-05-08T12:34:56.000Z",
      }),
    );
  });

  it("block enforcement → allow + ascii-box systemMessage + hook-pre.blocked event", async () => {
    const append = vi.fn();
    const blockRule = {
      id: "r1",
      enforcement: "block",
      trigger: "use axios",
      correct_pattern: "use fetch",
      reasoning: "project is fetch-only",
      confidence: 0.92,
      created_at: "2026-04-24T00:00:00.000Z", // 14 days before fixed now
      hit_count: 3,
    };
    const handler = createPreToolUseHandler(
      makeDeps({
        matcher: { match: vi.fn().mockResolvedValue({ matched: [blockRule] }) } as any,
        eventLog: { append, readLast: vi.fn().mockReturnValue([]) } as any,
        formatStyle: "ascii-box",
      }),
    );

    const result = await handler({
      tool_name: "Edit",
      tool_input: {},
      tool_use_id: "tu-block",
    });

    expect(result.permissionDecision).toBe("allow");
    expect(result.systemMessage).toMatch(/\+-- TeamAgent 强烈提醒 -+\+/);
    expect(result.systemMessage).toContain("fetch");
    expect(result.systemMessage).toMatch(/置信度 0\.\d+/);
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "hook-pre.blocked",
        tool_name: "Edit",
        tool_use_id: "tu-block",
      }),
    );
  });

  it("warn enforcement → allow + ascii-box systemMessage + hook-pre.warned with tool_name", async () => {
    const append = vi.fn();
    const warnRule = {
      id: "r1",
      enforcement: "warn",
      trigger: "use axios",
      correct_pattern: "use fetch",
      confidence: 0.85,
      created_at: "2026-04-24T00:00:00.000Z",
      hit_count: 5,
    };
    const handler = createPreToolUseHandler(
      makeDeps({
        matcher: { match: vi.fn().mockResolvedValue({ matched: [warnRule] }) } as any,
        eventLog: { append, readLast: vi.fn().mockReturnValue([]) } as any,
      }),
    );

    const result = await handler({
      tool_name: "Edit",
      tool_input: {},
      tool_use_id: "tu-warn",
    });

    expect(result.permissionDecision).toBe("allow");
    expect(result.systemMessage).toMatch(/\+-- TeamAgent 经验提醒 -+\+/);
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "hook-pre.warned",
        tool_name: "Edit",
      }),
    );
  });

  it("passive enforcement → allow silently (NO systemMessage) + hook-pre.passive_matched", async () => {
    const append = vi.fn();
    const passiveRule = {
      id: "r-passive",
      enforcement: "passive",
      trigger: "observe pattern X",
      correct_pattern: "do Y instead",
      confidence: 0.4,
      created_at: "2026-05-01T00:00:00.000Z",
      hit_count: 0,
    };
    const handler = createPreToolUseHandler(
      makeDeps({
        matcher: { match: vi.fn().mockResolvedValue({ matched: [passiveRule] }) } as any,
        eventLog: { append, readLast: vi.fn().mockReturnValue([]) } as any,
      }),
    );

    const result = await handler({
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      tool_use_id: "tu-passive",
    });

    expect(result.permissionDecision).toBe("allow");
    expect(result.systemMessage).toBeUndefined();
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "hook-pre.passive_matched",
        knowledge_id: "r-passive",
        tool_name: "Bash",
      }),
    );
    // Must NOT emit warned
    const kinds = append.mock.calls.map((c: any[]) => c[0]?.kind);
    expect(kinds).not.toContain("hook-pre.warned");
  });

  it("formatStyle 'humane' → no '+-- ... -+' box border, uses '⚠️ TeamAgent 提醒' 3-line shape", async () => {
    const warnRule = {
      id: "r1",
      enforcement: "warn",
      trigger: "use axios",
      correct_pattern: "use fetch",
      confidence: 0.85,
      created_at: "2026-04-24T00:00:00.000Z",
      hit_count: 5,
    };
    const handler = createPreToolUseHandler(
      makeDeps({
        matcher: { match: vi.fn().mockResolvedValue({ matched: [warnRule] }) } as any,
        formatStyle: "humane",
      }),
    );

    const result = await handler({
      tool_name: "Edit",
      tool_input: {},
      tool_use_id: "tu-humane",
    });

    expect(result.permissionDecision).toBe("allow");
    expect(result.systemMessage).toBeDefined();
    expect(result.systemMessage).not.toMatch(/\+--/); // no ascii-box border
    expect(result.systemMessage).not.toMatch(/^\|/m); // no pipe-bordered rows
    // Issue #86 humane shape: 3 lines starting with ⚠️ TeamAgent 提醒 (warn) /
    // ⚠️ TeamAgent 拦了一下 (block).
    expect(result.systemMessage).toMatch(/^⚠️ TeamAgent 提醒 — /);
    expect(result.systemMessage).toContain("fetch");
  });

  it("idGen + now are deterministic — no Date.now / no crypto.randomUUID coupling", async () => {
    let counter = 0;
    const ids: string[] = [];
    const append = vi.fn((e: any) => ids.push(e.tool_use_id));
    const handler = createPreToolUseHandler(
      makeDeps({
        eventLog: { append, readLast: vi.fn().mockReturnValue([]) } as any,
        idGen: () => `det-${++counter}`,
        now: () => "2026-05-08T00:00:00.000Z",
      }),
    );

    // tool_use_id omitted → handler calls deps.idGen()
    await handler({ tool_name: "Edit", tool_input: {} });
    await handler({ tool_name: "Edit", tool_input: {} });

    expect(ids).toEqual(["det-1", "det-2"]);
  });
});
