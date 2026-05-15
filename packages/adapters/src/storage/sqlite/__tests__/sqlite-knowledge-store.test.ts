import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { KnowledgeEntry } from "@teamagent/types";
import { openDb, closeDb } from "../schema.js";
import { SqliteKnowledgeStore } from "../sqlite-knowledge-store.js";

let tmpDir: string;
let store: SqliteKnowledgeStore;

function tmpDbPath(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-ks-"));
  return path.join(tmpDir, "test.db");
}

function mkEntry(over: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "r1",
    scope: { level: "personal" },
    category: "E",
    tags: ["test"],
    type: "avoidance",
    nature: "subjective",
    trigger: "use axios",
    wrong_pattern: "axios",
    correct_pattern: "fetch",
    reasoning: "project is fetch-only",
    confidence: 0,
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "2026-04-15T00:00:00Z",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    enforcement: "passive",
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
    ...over,
  };
}

/** Seed multiple entries into the store in one call. */
function seedEntries(entries: KnowledgeEntry[]): void {
  for (const e of entries) store.add(e);
}

beforeEach(() => {
  const db = openDb(tmpDbPath());
  store = new SqliteKnowledgeStore(db);
});

afterEach(() => {
  try { store.close(); } catch { /* already closed */ }
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("SqliteKnowledgeStore", () => {
  // 1. getById returns undefined for unknown id
  it("getById returns undefined for unknown id", () => {
    expect(store.getById("nonexistent")).toBeUndefined();
  });

  // 2. add + getById roundtrip preserves all fields
  it("add + getById roundtrip preserves all fields", () => {
    const entry = mkEntry({
      id: "rt1",
      scope: {
        level: "team",
        project: "my-proj",
        paths: ["src/**"],
        file_types: ["*.ts", "*.tsx"],
        branches: ["main"],
      },
      category: "C",
      tags: ["perf", "sql"],
      type: "practice",
      nature: "objective",
      trigger: "use batch operations",
      wrong_pattern: "sequential-ops",
      correct_pattern: "grouped operations",
      reasoning: "perf improvement",
      confidence: 0.85,
      enforcement: "warn",
      status: "active",
      hit_count: 5,
      success_count: 3,
      override_count: 1,
      evidence: { success_sessions: 2, success_users: 1, correction_sessions: 1 },
      created_at: "2026-04-10T00:00:00Z",
      last_hit_at: "2026-04-14T12:00:00Z",
      last_validated_at: "2026-04-13T00:00:00Z",
      source: "imported",
      conflict_with: ["r99", "r100"],
    });

    store.add(entry);
    const got = store.getById("rt1");
    expect(got).toBeDefined();
    expect(got!.id).toBe("rt1");
    expect(got!.scope).toEqual({
      level: "team",
      project: "my-proj",
      paths: ["src/**"],
      file_types: ["*.ts", "*.tsx"],
      branches: ["main"],
    });
    expect(got!.category).toBe("C");
    expect(got!.tags).toEqual(["perf", "sql"]);
    expect(got!.type).toBe("practice");
    expect(got!.nature).toBe("objective");
    expect(got!.trigger).toBe("use batch operations");
    expect(got!.wrong_pattern).toBe("sequential-ops");
    expect(got!.correct_pattern).toBe("grouped operations");
    expect(got!.reasoning).toBe("perf improvement");
    expect(got!.confidence).toBe(0.85);
    expect(got!.enforcement).toBe("warn");
    expect(got!.status).toBe("active");
    expect(got!.hit_count).toBe(5);
    expect(got!.success_count).toBe(3);
    expect(got!.override_count).toBe(1);
    expect(got!.evidence).toEqual({ success_sessions: 2, success_users: 1, correction_sessions: 1 });
    expect(got!.created_at).toBe("2026-04-10T00:00:00Z");
    expect(got!.last_hit_at).toBe("2026-04-14T12:00:00Z");
    expect(got!.last_validated_at).toBe("2026-04-13T00:00:00Z");
    expect(got!.source).toBe("imported");
    expect(got!.conflict_with).toEqual(["r99", "r100"]);
  });

  // 3. Duplicate id throws
  it("duplicate id throws", () => {
    store.add(mkEntry({ id: "dup1" }));
    expect(() => store.add(mkEntry({ id: "dup1" }))).toThrow();
  });

  // 4. JSON arrays (tags, scope.paths) preserved
  it("JSON arrays preserved through roundtrip", () => {
    const entry = mkEntry({
      id: "json1",
      tags: ["a", "b", "c"],
      scope: { level: "personal", paths: ["lib/**", "src/**"], file_types: ["*.go"] },
      conflict_with: ["x1"],
    });
    store.add(entry);
    const got = store.getById("json1")!;
    expect(got.tags).toEqual(["a", "b", "c"]);
    expect(got.scope.paths).toEqual(["lib/**", "src/**"]);
    expect(got.scope.file_types).toEqual(["*.go"]);
    expect(got.conflict_with).toEqual(["x1"]);
  });

  // 5. getAll returns all entries
  it("getAll returns all entries", () => {
    seedEntries([
      mkEntry({ id: "a1" }),
      mkEntry({ id: "a2" }),
      mkEntry({ id: "a3" }),
    ]);
    const all = store.getAll();
    expect(all).toHaveLength(3);
    const ids = all.map(e => e.id).sort();
    expect(ids).toEqual(["a1", "a2", "a3"]);
  });

  // 6. findByScopeLevel filters correctly
  it("findByScopeLevel filters correctly", () => {
    seedEntries([
      mkEntry({ id: "p1", scope: { level: "personal" } }),
      mkEntry({ id: "t1", scope: { level: "team" } }),
      mkEntry({ id: "g1", scope: { level: "global" } }),
      mkEntry({ id: "t2", scope: { level: "team" } }),
    ]);

    const team = store.findByScopeLevel("team");
    expect(team).toHaveLength(2);
    expect(team.map(e => e.id).sort()).toEqual(["t1", "t2"]);

    const personal = store.findByScopeLevel("personal");
    expect(personal).toHaveLength(1);
    expect(personal[0]!.id).toBe("p1");
  });

  // 7. findActive excludes archived
  it("findActive excludes non-active entries", () => {
    seedEntries([
      mkEntry({ id: "act1", status: "active" }),
      mkEntry({ id: "arc1", status: "archived" }),
      mkEntry({ id: "act2", status: "active" }),
      mkEntry({ id: "stl1", status: "stale" }),
    ]);

    const active = store.findActive();
    expect(active).toHaveLength(2);
    expect(active.map(e => e.id).sort()).toEqual(["act1", "act2"]);
  });

  // 8. update modifies fields
  it("update modifies fields", () => {
    store.add(mkEntry({ id: "u1", confidence: 0.3, hit_count: 0 }));
    store.update("u1", { confidence: 0.9, hit_count: 10, enforcement: "block" });
    const got = store.getById("u1")!;
    expect(got.confidence).toBe(0.9);
    expect(got.hit_count).toBe(10);
    expect(got.enforcement).toBe("block");
    // Unchanged fields preserved
    expect(got.trigger).toBe("use axios");
    expect(got.tags).toEqual(["test"]);
  });

  // 9. update throws for missing id
  it("update throws for missing id", () => {
    expect(() => store.update("ghost", { confidence: 1 })).toThrow(
      "Knowledge entry not found: ghost",
    );
  });

  // 10. delete removes entry
  it("delete removes entry", () => {
    store.add(mkEntry({ id: "d1" }));
    expect(store.getById("d1")).toBeDefined();
    store.delete("d1");
    expect(store.getById("d1")).toBeUndefined();
  });
});

// Need a baseEntry alias for the v2 tests
const baseEntry = mkEntry();

describe("v2 tier/demerit fields round-trip", () => {
  it("persists and reads back tier/demerit fields", () => {
    const entry = {
      ...baseEntry,
      id: "r-v2",
      current_tier: "stable" as const,
      max_tier_ever: "stable" as const,
      tier_entered_at: "2026-04-16T00:00:00Z",
      demerit: 3.5,
      demerit_last_updated: "2026-04-16T00:00:00Z",
      resurrect_count: 1,
    };
    store.add(entry);
    const back = store.getById("r-v2");
    expect(back?.current_tier).toBe("stable");
    expect(back?.demerit).toBe(3.5);
    expect(back?.resurrect_count).toBe(1);
    expect(back?.max_tier_ever).toBe("stable");
    expect(back?.tier_entered_at).toBe("2026-04-16T00:00:00Z");
  });

  it("partial update preserves v2 fields not in patch", () => {
    store.add({
      ...baseEntry,
      id: "r-partial",
      demerit: 5,
      current_tier: "probation" as const,
      max_tier_ever: "probation" as const,
      tier_entered_at: "2026-04-16T00:00:00Z",
    });
    store.update("r-partial", { confidence: 0.8 });
    const back = store.getById("r-partial");
    expect(back?.demerit).toBe(5);
    expect(back?.current_tier).toBe("probation");
  });

  it("update({ demerit, current_tier }) persists to DB", () => {
    store.add({ ...baseEntry, id: "r-u", tier_entered_at: "2026-04-01T00:00:00Z" });
    store.update("r-u", {
      demerit: 3,
      current_tier: "probation" as const,
      tier_entered_at: "2026-04-16T00:00:00Z",
    });
    const back = store.getById("r-u");
    expect(back?.demerit).toBe(3);
    expect(back?.current_tier).toBe("probation");
  });

  it("add() fills tier_entered_at from created_at when empty", () => {
    const entry = { ...baseEntry, id: "r-empty-tier", tier_entered_at: "", created_at: "2026-01-01T00:00:00Z" };
    store.add(entry);
    const back = store.getById("r-empty-tier");
    expect(back?.tier_entered_at).toBe("2026-01-01T00:00:00Z");
  });
});
