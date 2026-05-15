import { describe, it, expect } from "vitest";
import {
  formatPendingRecord,
  mergePending,
  selectTopForInjection,
  formatInjectionText,
  type PendingWarning,
} from "../pending-warnings.js";
import type { NarrativeHit } from "../scan.js";

const mkHit = (overrides: Partial<NarrativeHit> = {}): NarrativeHit => ({
  knowledge_id: "n1",
  matched_snippet: "claims-victory-phrase",
  rule_summary: "back with evidence",
  confidence: 0.9,
  correct_pattern: "cite verification output",
  reasoning: "past incidents of false done claims",
  ...overrides,
});

const mkPending = (overrides: Partial<PendingWarning> = {}): PendingWarning => ({
  session_id: "s1",
  turn_index: 1,
  knowledge_id: "n1",
  matched_snippet: "x",
  rule_summary: "y",
  confidence: 0.9,
  correct_pattern: "",
  reasoning: "",
  at: "2026-04-23T00:00:00Z",
  ...overrides,
});

describe("formatPendingRecord", () => {
  it("builds record from hit + session + turn", () => {
    const rec = formatPendingRecord(mkHit(), {
      session_id: "s1",
      turn_index: 5,
      at: "2026-04-23T10:00:00Z",
    });
    expect(rec.session_id).toBe("s1");
    expect(rec.turn_index).toBe(5);
    expect(rec.knowledge_id).toBe("n1");
    expect(rec.matched_snippet).toBe("claims-victory-phrase");
    expect(rec.at).toBe("2026-04-23T10:00:00Z");
    expect(rec.correct_pattern).toBe("cite verification output");
  });
});

describe("mergePending", () => {
  it("appends new entries to empty existing", () => {
    const result = mergePending([], [mkPending({ knowledge_id: "a" })]);
    expect(result).toHaveLength(1);
  });

  it("dedups same (session,turn,knowledge_id) triple", () => {
    const p = mkPending({ knowledge_id: "a" });
    const result = mergePending([p], [p]);
    expect(result).toHaveLength(1);
  });

  it("different knowledge_id is not deduped", () => {
    const result = mergePending(
      [mkPending({ knowledge_id: "a" })],
      [mkPending({ knowledge_id: "b" })],
    );
    expect(result).toHaveLength(2);
  });

  it("different turn_index is not deduped", () => {
    const result = mergePending(
      [mkPending({ knowledge_id: "a", turn_index: 1 })],
      [mkPending({ knowledge_id: "a", turn_index: 2 })],
    );
    expect(result).toHaveLength(2);
  });

  it("preserves order: existing first then new", () => {
    const a = mkPending({ knowledge_id: "a" });
    const b = mkPending({ knowledge_id: "b" });
    const c = mkPending({ knowledge_id: "c" });
    expect(mergePending([a, b], [c]).map((p) => p.knowledge_id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("selectTopForInjection", () => {
  it("returns top N by confidence desc", () => {
    const pending: PendingWarning[] = [
      mkPending({ knowledge_id: "a", confidence: 0.5 }),
      mkPending({ knowledge_id: "b", confidence: 0.9 }),
      mkPending({ knowledge_id: "c", confidence: 0.7 }),
    ];
    const top = selectTopForInjection(pending, 2);
    expect(top.map((p) => p.knowledge_id)).toEqual(["b", "c"]);
  });

  it("returns all when N exceeds length", () => {
    expect(selectTopForInjection([mkPending()], 10)).toHaveLength(1);
  });

  it("empty input → empty output", () => {
    expect(selectTopForInjection([], 3)).toEqual([]);
  });
});

describe("formatInjectionText", () => {
  it("empty input → empty string", () => {
    expect(formatInjectionText([])).toBe("");
  });

  it("single warning produces expected structure", () => {
    const text = formatInjectionText([
      mkPending({
        knowledge_id: "n1",
        matched_snippet: "all-fixed-claim",
        correct_pattern: "show evidence",
        confidence: 0.9,
      }),
    ]);
    expect(text).toContain("TeamAgent");
    expect(text).toContain("n1");
    expect(text).toContain("all-fixed-claim");
    expect(text).toContain("show evidence");
    expect(text).toContain("0.90");
  });

  it("multiple warnings each appear as bullet", () => {
    const text = formatInjectionText([
      mkPending({ knowledge_id: "n1", matched_snippet: "a" }),
      mkPending({ knowledge_id: "n2", matched_snippet: "b" }),
    ]);
    const lines = text.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(2);
  });
});
