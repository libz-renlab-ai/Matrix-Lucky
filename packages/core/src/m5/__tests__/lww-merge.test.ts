import { describe, it, expect } from "vitest";
import { mergeLww, mergeLwwBatch, type ClaimWithSource } from "../lww-merge.js";
import type { TeamRuleFile } from "../team-rule.js";

function alive(
  ts: string,
  modifiedBy: string,
  content = "x",
  ruleId = "R-1",
  author = "alice"
): TeamRuleFile {
  return {
    rule_id: ruleId,
    author,
    current: {
      deleted: false,
      content,
      confidence: 0.9,
      modified_by: modifiedBy,
      modified_ts: ts,
      scope: "team",
    },
  };
}

function tomb(
  ts: string,
  deletedBy: string,
  ruleId = "R-1",
  author = "alice"
): TeamRuleFile {
  return {
    rule_id: ruleId,
    author,
    current: {
      deleted: true,
      deleted_by: deletedBy,
      deleted_ts: ts,
    },
  };
}

describe("mergeLww", () => {
  it("empty input → undefined winner", () => {
    const r = mergeLww([]);
    expect(r.winner).toBeUndefined();
  });

  it("single claim → that claim wins", () => {
    const r = mergeLww([
      { claim_author: "alice", file: alive("2026-05-06T10:00:00Z", "alice") },
    ]);
    expect(r.winner_claim_author).toBe("alice");
    expect(r.winner?.deleted).toBe(false);
  });

  it("later ts wins (alive vs alive)", () => {
    const r = mergeLww([
      { claim_author: "alice", file: alive("2026-05-06T10:00:00Z", "alice", "old") },
      { claim_author: "bob", file: alive("2026-05-06T11:00:00Z", "bob", "new") },
    ]);
    expect(r.winner_claim_author).toBe("bob");
    expect(r.winner && !r.winner.deleted && r.winner.content).toBe("new");
  });

  it("tombstone wins if its ts > alive ts", () => {
    const r = mergeLww([
      { claim_author: "alice", file: alive("2026-05-06T10:00:00Z", "alice") },
      { claim_author: "bob", file: tomb("2026-05-06T11:00:00Z", "bob") },
    ]);
    expect(r.winner?.deleted).toBe(true);
    expect(r.winner_claim_author).toBe("bob");
  });

  it("alive resurrect: alive ts > earlier tombstone ts → alive wins", () => {
    const r = mergeLww([
      { claim_author: "alice", file: tomb("2026-05-06T10:00:00Z", "alice") },
      { claim_author: "bob", file: alive("2026-05-06T11:00:00Z", "bob", "resurrected") },
    ]);
    expect(r.winner?.deleted).toBe(false);
    expect(r.winner && !r.winner.deleted && r.winner.content).toBe("resurrected");
  });

  it("ts 平局 → claim_author 字典序裁决", () => {
    const r = mergeLww([
      { claim_author: "bob", file: alive("2026-05-06T10:00:00Z", "bob", "bob-version") },
      { claim_author: "alice", file: alive("2026-05-06T10:00:00Z", "alice", "alice-version") },
    ]);
    expect(r.winner_claim_author).toBe("alice");
  });

  it("preserves original_author lineage", () => {
    const r = mergeLww([
      {
        claim_author: "bob",
        file: alive("2026-05-06T11:00:00Z", "bob", "edit-by-bob", "R-1", "alice"),
      },
    ]);
    expect(r.original_author).toBe("alice");
    expect(r.winner_claim_author).toBe("bob");
  });
});

describe("mergeLwwBatch", () => {
  it("groups by rule_id and merges each", () => {
    const claims: ClaimWithSource[] = [
      {
        claim_author: "alice",
        file: alive("2026-05-06T10:00:00Z", "alice", "r1-old", "R-1"),
      },
      {
        claim_author: "bob",
        file: alive("2026-05-06T11:00:00Z", "bob", "r1-new", "R-1"),
      },
      {
        claim_author: "alice",
        file: alive("2026-05-06T09:00:00Z", "alice", "r2-only", "R-2"),
      },
    ];
    const m = mergeLwwBatch(claims);
    expect(m.size).toBe(2);
    const r1 = m.get("R-1");
    expect(r1?.winner_claim_author).toBe("bob");
    const r2 = m.get("R-2");
    expect(r2?.winner_claim_author).toBe("alice");
  });
});
