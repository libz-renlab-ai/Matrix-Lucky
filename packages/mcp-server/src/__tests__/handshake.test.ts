import { describe, it, expect, beforeEach } from "vitest";
import type { KnowledgeEntry } from "@teamagent/types";
import { setRules, getRules } from "../server.js";

// Re-export dispatch for white-box testing via dynamic import
// We test by calling the exported helpers + constructing requests manually.

const FIXTURE_RULE: KnowledgeEntry = {
  id: "test-rule-001",
  scope: { level: "team" },
  category: "C",
  tags: ["test"],
  type: "avoidance",
  nature: "objective",
  trigger: "hardcode_credentials",
  wrong_pattern: "hardcoded_secret|const API_KEY",
  correct_pattern: "read from process.env.API_KEY",
  reasoning: "Hardcoded secrets get committed to git and leaked.",
  confidence: 0.95,
  enforcement: "block",
  status: "active",
  hit_count: 0,
  success_count: 0,
  override_count: 0,
  evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
  created_at: "2026-01-01T00:00:00Z",
  last_hit_at: "",
  last_validated_at: "",
  source: "team-shared",
  conflict_with: [],
  current_tier: "experimental",
  max_tier_ever: "experimental",
  tier_entered_at: "",
  demerit: 0,
  demerit_last_updated: "",
  resurrect_count: 0,
};

describe("MCP server handshake sequence", () => {
  beforeEach(() => {
    setRules([FIXTURE_RULE]);
  });

  it("setRules + getRules round-trips", () => {
    expect(getRules()).toHaveLength(1);
    expect(getRules()[0]!.id).toBe("test-rule-001");
  });

  it("initialize returns correct protocol version and capabilities", async () => {
    // Dynamic import so we can test dispatch without spawning a process
    const { default: dispatchFn } = await import("../dispatch.js");

    const req = { jsonrpc: "2.0" as const, id: 1, method: "initialize", params: {} };
    const res = await dispatchFn(req, getRules());

    expect(res).not.toBeNull();
    expect(res!.id).toBe(1);
    const result = res!.result as { protocolVersion: string; capabilities: object };
    expect(result.protocolVersion).toBe("2024-11-05");
    expect(result.capabilities).toHaveProperty("tools");
  });

  it("tools/list returns check_pitfall tool", async () => {
    const { default: dispatchFn } = await import("../dispatch.js");

    const req = { jsonrpc: "2.0" as const, id: 2, method: "tools/list" };
    const res = await dispatchFn(req, getRules());

    expect(res).not.toBeNull();
    const result = res!.result as { tools: Array<{ name: string }> };
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]!.name).toBe("check_pitfall");
  });

  it("tools/call check_pitfall returns at least one matched rule for fixture query", async () => {
    const { default: dispatchFn } = await import("../dispatch.js");

    const req = {
      jsonrpc: "2.0" as const,
      id: 3,
      method: "tools/call",
      params: {
        name: "check_pitfall",
        arguments: { query: 'const API_KEY = "sk-abc123"' },
      },
    };
    const res = await dispatchFn(req, getRules());

    expect(res).not.toBeNull();
    expect(res!.error).toBeUndefined();
    const result = res!.result as { content: Array<{ type: string; text: string }> };
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    // Should mention the fixture rule
    expect(result.content[0]!.text).toContain("BLOCK");
  });

  it("tools/call with unknown tool returns error", async () => {
    const { default: dispatchFn } = await import("../dispatch.js");

    const req = {
      jsonrpc: "2.0" as const,
      id: 4,
      method: "tools/call",
      params: { name: "unknown_tool", arguments: {} },
    };
    const res = await dispatchFn(req, getRules());

    expect(res).not.toBeNull();
    expect(res!.error).toBeDefined();
    expect(res!.error!.code).toBe(-32602);
  });

  it("unknown method returns -32601 error", async () => {
    const { default: dispatchFn } = await import("../dispatch.js");

    const req = { jsonrpc: "2.0" as const, id: 5, method: "not/a/thing" };
    const res = await dispatchFn(req, getRules());

    expect(res).not.toBeNull();
    expect(res!.error!.code).toBe(-32601);
  });
});
