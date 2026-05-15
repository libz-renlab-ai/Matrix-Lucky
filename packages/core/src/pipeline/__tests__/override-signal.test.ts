import { describe, it, expect } from "vitest";
import {
  detectIgnoredSignals,
  detectCompliedSignals,
  detectBlockedCircumventedSignals,
} from "../override-signal.js";

const BASE_TS = "2026-04-16T10:00:00.000Z";
const RECENT_TS = "2026-04-16T10:04:00.000Z"; // 4 min ago → within 5min window
const OLD_TS    = "2026-04-16T09:50:00.000Z"; // 10 min ago → outside window
const NOW = new Date("2026-04-16T10:05:00.000Z");

describe("detectIgnoredSignals", () => {
  it("returns knowledge_id when hook-pre.warned matches same tool_use_id", () => {
    const events = [
      { kind: "hook-pre.warned", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: BASE_TS, tool_name: "Write" },
    ];
    expect(detectIgnoredSignals("t1", events)).toEqual([{ knowledge_id: "rule-A" }]);
  });

  it("returns empty when no warned event for tool_use_id", () => {
    const events = [
      { kind: "hook-pre.warned", tool_use_id: "t2", knowledge_id: "rule-A", timestamp: BASE_TS, tool_name: "Write" },
    ];
    expect(detectIgnoredSignals("t1", events)).toEqual([]);
  });

  it("returns empty when event is hook-pre.blocked (not warned)", () => {
    const events = [
      { kind: "hook-pre.blocked", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: BASE_TS, tool_name: "Write" },
    ];
    expect(detectIgnoredSignals("t1", events)).toEqual([]);
  });

  it("ignores events without knowledge_id", () => {
    const events = [
      { kind: "hook-pre.warned", tool_use_id: "t1", timestamp: BASE_TS, tool_name: "Write" },
    ];
    expect(detectIgnoredSignals("t1", events)).toEqual([]);
  });
});

describe("detectCompliedSignals", () => {
  it("returns knowledge_id when recent warned event exists for same tool_name", () => {
    const events = [
      { kind: "hook-pre.warned", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Write" },
    ];
    expect(detectCompliedSignals("Write", events, NOW)).toEqual([{ knowledge_id: "rule-A" }]);
  });

  it("returns empty when warned event is outside time window", () => {
    const events = [
      { kind: "hook-pre.warned", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: OLD_TS, tool_name: "Write" },
    ];
    expect(detectCompliedSignals("Write", events, NOW)).toEqual([]);
  });

  it("returns empty when tool_name differs", () => {
    const events = [
      { kind: "hook-pre.warned", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Edit" },
    ];
    expect(detectCompliedSignals("Write", events, NOW)).toEqual([]);
  });

  it("deduplicates same knowledge_id from multiple warned events", () => {
    const events = [
      { kind: "hook-pre.warned", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Write" },
      { kind: "hook-pre.warned", tool_use_id: "t2", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Write" },
    ];
    const result = detectCompliedSignals("Write", events, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ knowledge_id: "rule-A" });
  });

  it("respects custom windowMs", () => {
    const events = [
      { kind: "hook-pre.warned", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Write" },
    ];
    // window = 1ms → nothing qualifies
    expect(detectCompliedSignals("Write", events, NOW, 1)).toEqual([]);
  });
});

describe("detectBlockedCircumventedSignals", () => {
  it("returns knowledge_id when recent blocked event exists for same tool_name", () => {
    const events = [
      { kind: "hook-pre.blocked", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Bash" },
    ];
    expect(detectBlockedCircumventedSignals("Bash", events, NOW)).toEqual([
      { knowledge_id: "rule-A" },
    ]);
  });

  it("returns empty when blocked event is outside time window", () => {
    const events = [
      { kind: "hook-pre.blocked", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: OLD_TS, tool_name: "Bash" },
    ];
    expect(detectBlockedCircumventedSignals("Bash", events, NOW)).toEqual([]);
  });

  it("returns empty when tool_name differs", () => {
    const events = [
      { kind: "hook-pre.blocked", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Write" },
    ];
    expect(detectBlockedCircumventedSignals("Bash", events, NOW)).toEqual([]);
  });

  it("skips knowledge_id already consumed by prior blocked_circumvented event", () => {
    const events = [
      { kind: "hook-pre.blocked", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Bash" },
      { kind: "ai.override.blocked_circumvented", tool_use_id: "t2", knowledge_id: "rule-A", timestamp: RECENT_TS },
    ];
    expect(detectBlockedCircumventedSignals("Bash", events, NOW)).toEqual([]);
  });

  it("deduplicates same knowledge_id from multiple blocked events", () => {
    const events = [
      { kind: "hook-pre.blocked", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Bash" },
      { kind: "hook-pre.blocked", tool_use_id: "t2", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Bash" },
    ];
    const result = detectBlockedCircumventedSignals("Bash", events, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ knowledge_id: "rule-A" });
  });

  it("returns multiple distinct knowledge_ids when different rules blocked", () => {
    const events = [
      { kind: "hook-pre.blocked", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Bash" },
      { kind: "hook-pre.blocked", tool_use_id: "t1", knowledge_id: "rule-B", timestamp: RECENT_TS, tool_name: "Bash" },
    ];
    const result = detectBlockedCircumventedSignals("Bash", events, NOW);
    expect(result).toHaveLength(2);
    expect(new Set(result.map((r) => r.knowledge_id))).toEqual(new Set(["rule-A", "rule-B"]));
  });

  it("ignores warned events (only counts blocked)", () => {
    const events = [
      { kind: "hook-pre.warned", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Bash" },
    ];
    expect(detectBlockedCircumventedSignals("Bash", events, NOW)).toEqual([]);
  });

  it("respects custom windowMs", () => {
    const events = [
      { kind: "hook-pre.blocked", tool_use_id: "t1", knowledge_id: "rule-A", timestamp: RECENT_TS, tool_name: "Bash" },
    ];
    expect(detectBlockedCircumventedSignals("Bash", events, NOW, 1)).toEqual([]);
  });
});
