import { describe, it, expect } from "vitest";
import { runCalibratorContract } from "@teamagent/ports/contracts";
import { defaultCalibrator } from "../default.js";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

// --- Contract suite ---
describe("defaultCalibrator", () => {
  runCalibratorContract(() => defaultCalibrator);
});

// --- Implementation-specific table-driven tests ---

const baseEntry: KnowledgeEntry = {
  id: "rule-x",
  scope: { level: "team" },
  category: "E",
  tags: [],
  type: "avoidance",
  nature: "subjective",
  trigger: "t",
  wrong_pattern: "w",
  correct_pattern: "c",
  reasoning: "r",
  confidence: 0.7,
  enforcement: "warn",
  status: "active",
  hit_count: 0,
  success_count: 0,
  override_count: 0,
  evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
  created_at: "2026-04-15T00:00:00Z",
  last_hit_at: "",
  last_validated_at: "2026-04-15T00:00:00Z",
  source: "accumulated",
  conflict_with: [],
  current_tier: "experimental" as const,
  max_tier_ever: "experimental" as const,
  tier_entered_at: "",
  demerit: 0,
  demerit_last_updated: "",
  resurrect_count: 0,
};

function pre(
  kind: "hook-pre.matched" | "hook-pre.warned" | "hook-pre.blocked",
  tool_use_id?: string,
  id = "p",
): PersistedEvent {
  return {
    id,
    kind,
    knowledge_id: "rule-x",
    tool_use_id,
    timestamp: "2026-04-15T01:00:00Z",
    schema_version: 1,
  };
}

function post(
  succeeded: boolean,
  tool_use_id: string,
  id = "post",
): PersistedEvent {
  return {
    id,
    kind: "hook-post.result",
    knowledge_id: "rule-x",
    tool_use_id,
    result: { succeeded },
    timestamp: "2026-04-15T01:01:00Z",
    schema_version: 1,
  };
}

describe("defaultCalibrator weights (M6 + Stage A hotfix: log-normalized)", () => {
  // log2(1+n) factors: n=1→1.0, n=2→1.585, n=5→2.585, n=10→3.459, n=100→6.658
  it.each([
    {
      name: "single hook-pre.blocked (n=1) → 0.05 × log2(2) = 0.05",
      events: [pre("hook-pre.blocked", undefined, "b1")],
      expectedDelta: 0.05,
    },
    {
      name: "single hook-pre.warned (n=1) → 0.02 × log2(2) = 0.02",
      events: [pre("hook-pre.warned", undefined, "w1")],
      expectedDelta: 0.02,
    },
    {
      name: "two blocked (n=2) → 0.05 × log2(3) ≈ 0.0792",
      events: [
        pre("hook-pre.blocked", undefined, "b1"),
        pre("hook-pre.blocked", undefined, "b2"),
      ],
      expectedDelta: 0.05 * Math.log2(3),
    },
    {
      name: "warned + post.success (n=1 each) → 0.02 + 0.03 = 0.05",
      events: [pre("hook-pre.warned", "t1", "w1"), post(true, "t1", "ps1")],
      expectedDelta: 0.05,
    },
    {
      name: "blocked + post.fail (n=1 each) → 0.05 - 0.10 = -0.05",
      events: [pre("hook-pre.blocked", "t1", "b1"), post(false, "t1", "pf1")],
      expectedDelta: -0.05,
    },
    {
      name: "matched only (no decision) → 0",
      events: [pre("hook-pre.matched", undefined, "m1")],
      expectedDelta: 0,
    },
  ])("$name", ({ events, expectedDelta }) => {
    const r = defaultCalibrator.calibrate(baseEntry, events);
    expect(r.delta).toBeCloseTo(expectedDelta, 5);
  });

  it("100 blocked → log-normalized cap (no longer linear runaway)", () => {
    const events = Array.from({ length: 100 }, (_, i) =>
      pre("hook-pre.blocked", undefined, `b${i}`),
    );
    const r = defaultCalibrator.calibrate(
      { ...baseEntry, confidence: 0.5 },
      events,
    );
    // 0.05 × log2(101) ≈ 0.333. Pre-hotfix would have been 5.0 (clamped to 1).
    expect(r.delta).toBeLessThan(0.4);
    expect(r.delta).toBeGreaterThan(0.3);
  });

  it("5-streak bonus: 5 success_after_fire (no fail) → +bonus", () => {
    const events: PersistedEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(pre("hook-pre.warned", `t${i}`, `w${i}`));
      events.push(post(true, `t${i}`, `ps${i}`));
    }
    const r = defaultCalibrator.calibrate(baseEntry, events);
    // log2(6) ≈ 2.585; 0.02*2.585 + 0.03*2.585 + 0.05 ≈ 0.179
    const expected = 0.02 * Math.log2(6) + 0.03 * Math.log2(6) + 0.05;
    expect(r.delta).toBeCloseTo(expected, 5);
    const bonusSig = r.applied_signals.find((s) => s.kind === "streak_bonus");
    expect(bonusSig).toBeDefined();
    expect(bonusSig!.weight).toBe(0.05);
  });

  it("no streak bonus if any fail present", () => {
    const events: PersistedEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(pre("hook-pre.warned", `t${i}`, `w${i}`));
      events.push(post(true, `t${i}`, `ps${i}`));
    }
    // Add one fail-after-block to break the streak
    events.push(pre("hook-pre.blocked", "tFail", "bFail"));
    events.push(post(false, "tFail", "pfFail"));
    const r = defaultCalibrator.calibrate(baseEntry, events);
    expect(r.applied_signals.find((s) => s.kind === "streak_bonus")).toBeUndefined();
  });

  it("auto-archive: active 0.32 + heavy negatives → archived", () => {
    const events: PersistedEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(pre("hook-pre.blocked", `t${i}`, `b${i}`));
      events.push(post(false, `t${i}`, `pf${i}`));
    }
    // log2(4) = 2; 0.05*2 (blocked) + (-0.10)*2 (fail) = 0.10 - 0.20 = -0.10
    // 0.32 - 0.10 = 0.22 < 0.3 → archived
    const r = defaultCalibrator.calibrate(
      { ...baseEntry, confidence: 0.32 },
      events,
    );
    expect(r.confidence).toBeCloseTo(0.22, 5);
    expect(r.status).toBe("archived");
  });

  it("does not archive when confidence stays >= 0.3", () => {
    const events: PersistedEvent[] = [];
    for (let i = 0; i < 1; i++) {
      events.push(pre("hook-pre.blocked", `t${i}`, `b${i}`));
      events.push(post(false, `t${i}`, `pf${i}`));
    }
    // 0.7 + 0.05 - 0.10 = 0.65
    const r = defaultCalibrator.calibrate(baseEntry, events);
    expect(r.status).toBe("active");
  });

  it("clamps to 1.0 max", () => {
    const events: PersistedEvent[] = Array.from({ length: 100 }, (_, i) =>
      pre("hook-pre.blocked", undefined, `b${i}`),
    );
    const r = defaultCalibrator.calibrate(
      { ...baseEntry, confidence: 0.95 },
      events,
    );
    expect(r.confidence).toBe(1);
  });

  it("clamps to 0.0 min (and archives)", () => {
    const events: PersistedEvent[] = [];
    for (let i = 0; i < 20; i++) {
      events.push(pre("hook-pre.blocked", `t${i}`, `b${i}`));
      events.push(post(false, `t${i}`, `pf${i}`));
    }
    const r = defaultCalibrator.calibrate(
      { ...baseEntry, confidence: 0.05 },
      events,
    );
    expect(r.confidence).toBe(0);
    expect(r.status).toBe("archived");
  });

  it("applied_signals breakdown is rendered correctly", () => {
    const events: PersistedEvent[] = [
      pre("hook-pre.blocked", "t1", "b1"),
      post(true, "t1", "ps1"),
    ];
    const r = defaultCalibrator.calibrate(baseEntry, events);
    const kinds = r.applied_signals.map((s) => s.kind).sort();
    expect(kinds).toEqual(["hook-pre.blocked", "post.success_after_fire"]);
  });
});

describe("Stage A: self-reference detection (doc/test context)", () => {
  function preWithFile(
    kind: "hook-pre.warned" | "hook-pre.blocked",
    filePath: string,
    id = "p",
  ): PersistedEvent {
    return {
      id,
      kind,
      knowledge_id: "rule-x",
      timestamp: "2026-04-15T01:00:00Z",
      schema_version: 1,
      tool: { name: "Write", input: { file_path: filePath, content: "x" } },
    };
  }

  it.each([
    ["docs/foo.md", true],
    ["docs/dogfood/m6-calibration.md", true],
    ["packages/core/src/__tests__/foo.test.ts", true],
    ["packages/cli/test/integration.ts", true],
    ["fixtures/sessions/sample.jsonl", true],
    ["examples/demo.ts", true],
    ["README.md", true],
    ["notes.txt", true],
    ["spec.adoc", true],
    ["~/.teamagent/personal/knowledge.jsonl", true],
    ["packages/core/src/calibrator/default.ts", false],
    ["src/api/users.ts", false],
    ["scripts/build.sh", false],
    ["index.html", false],
    ["", false],
  ])("isDocOrTestContext(%s) = %s", (filePath, expectIsDoc) => {
    const events = [preWithFile("hook-pre.warned", filePath, "w1")];
    const r = defaultCalibrator.calibrate(baseEntry, events);
    if (expectIsDoc) {
      // doc 上下文 → 反转，权重为负
      expect(r.delta).toBeLessThan(0);
      expect(r.applied_signals[0]!.kind).toBe("hook-pre.warned.doc_context");
    } else {
      // 真实代码 → 正常加分
      expect(r.delta).toBeGreaterThan(0);
      expect(r.applied_signals[0]!.kind).toBe("hook-pre.warned");
    }
  });

  it("mixed: 5 doc fires + 5 real fires → near-zero net", () => {
    const events: PersistedEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(preWithFile("hook-pre.warned", "docs/x.md", `d${i}`));
      events.push(
        preWithFile("hook-pre.warned", `src/api/file${i}.ts`, `r${i}`),
      );
    }
    const r = defaultCalibrator.calibrate(baseEntry, events);
    // 5 real + 5 doc: weights cancel exactly (same n, same coefficient)
    expect(Math.abs(r.delta)).toBeLessThan(0.001);
  });

  it("more doc-context than real → negative net (rule getting punished)", () => {
    const events: PersistedEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(preWithFile("hook-pre.warned", "docs/x.md", `d${i}`));
    }
    events.push(preWithFile("hook-pre.warned", "src/x.ts", "r1"));
    const r = defaultCalibrator.calibrate(baseEntry, events);
    expect(r.delta).toBeLessThan(0);
  });

  it("hook-pre.blocked.doc_context produces matching signal kind", () => {
    const events = [preWithFile("hook-pre.blocked", "docs/x.md", "b1")];
    const r = defaultCalibrator.calibrate(baseEntry, events);
    expect(r.applied_signals[0]!.kind).toBe("hook-pre.blocked.doc_context");
    expect(r.applied_signals[0]!.weight).toBeLessThan(0);
  });

  it("event without file_path treated as real (Bash command default)", () => {
    const events = [pre("hook-pre.warned", undefined, "w1")];
    // Bash 命令没 file_path → 视为真实命中 → 正向
    const r = defaultCalibrator.calibrate(baseEntry, events);
    expect(r.delta).toBeGreaterThan(0);
  });

  it("repeated doc-context fires can drive confidence toward archive", () => {
    const events: PersistedEvent[] = [];
    for (let i = 0; i < 50; i++) {
      events.push(preWithFile("hook-pre.warned", "docs/x.md", `d${i}`));
    }
    const r = defaultCalibrator.calibrate(
      { ...baseEntry, confidence: 0.4 },
      events,
    );
    // log2(51) ≈ 5.67; 0.02 × 5.67 ≈ 0.113 negative; 0.4 - 0.113 = 0.287 < 0.3 → archive
    expect(r.status).toBe("archived");
  });
});
