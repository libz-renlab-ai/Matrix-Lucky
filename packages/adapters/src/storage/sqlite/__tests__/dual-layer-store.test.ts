import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DualLayerStore } from "../dual-layer-store.js";
import type { KnowledgeEntry } from "@teamagent/types";

let tmpDir: string;
let store: DualLayerStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-dual-"));
  store = new DualLayerStore({
    projectDbPath: path.join(tmpDir, "project.db"),
    userGlobalDbPath: path.join(tmpDir, "global.db"),
  });
});

afterEach(() => {
  store.close();
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

function mkEntry(id: string, level: "personal" | "team" | "global"): any {
  return {
    id, scope: { level }, category: "E", tags: [],
    type: "avoidance", nature: "subjective",
    trigger: "t", wrong_pattern: "w", correct_pattern: "c", reasoning: "r",
    confidence: 0, enforcement: "passive", status: "active",
    hit_count: 0, success_count: 0, override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-15T00:00:00Z", last_hit_at: "",
    last_validated_at: "2026-04-15T00:00:00Z",
    source: "accumulated", conflict_with: [],
  };
}

describe("DualLayerStore", () => {
  it("personal → project DB, global → user-global DB", () => {
    store.add(mkEntry("p1", "personal"));
    store.add(mkEntry("g1", "global"));

    expect(store.getProjectStore().getById("p1")?.id).toBe("p1");
    expect(store.getProjectStore().getById("g1")).toBeUndefined();

    expect(store.getGlobalStore().getById("g1")?.id).toBe("g1");
    expect(store.getGlobalStore().getById("p1")).toBeUndefined();
  });

  it("findActive merges both layers", () => {
    store.add(mkEntry("p1", "personal"));
    store.add(mkEntry("p2", "personal"));
    store.add(mkEntry("g1", "global"));
    const all = store.findActive();
    expect(all).toHaveLength(3);
    expect(all.map(e => e.id).sort()).toEqual(["g1", "p1", "p2"]);
  });

  it("getById checks project first then global", () => {
    store.add(mkEntry("only-p", "personal"));
    store.add(mkEntry("only-g", "global"));
    expect(store.getById("only-p")?.id).toBe("only-p");
    expect(store.getById("only-g")?.id).toBe("only-g");
    expect(store.getById("nope")).toBeUndefined();
  });

  it("team → project DB and remains queryable as team scope (M5)", () => {
    store.add(mkEntry("t1", "team"));

    expect(store.getProjectStore().getById("t1")?.scope.level).toBe("team");
    expect(store.getGlobalStore().getById("t1")).toBeUndefined();
    expect(store.findByScopeLevel("team").map((e) => e.id)).toEqual(["t1"]);
    expect(store.getById("t1")?.scope.level).toBe("team");
  });
});

describe("B-063: DualLayerStore implements full KnowledgeStore contract", () => {
  const entry: KnowledgeEntry = {
    id: "b063-test",
    scope: { level: "personal" },
    category: "C", tags: [], type: "avoidance", nature: "objective",
    trigger: "t", wrong_pattern: "bad", correct_pattern: "good", reasoning: "r",
    confidence: 0.7, enforcement: "warn", status: "active",
    hit_count: 0, success_count: 0, override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-27T00:00:00Z", last_hit_at: "", last_validated_at: "",
    source: "accumulated", conflict_with: [],
    current_tier: "experimental", max_tier_ever: "experimental",
    tier_entered_at: "", demerit: 0, demerit_last_updated: "", resurrect_count: 0,
  };

  function makeStore() {
    return new DualLayerStore({
      projectDbPath: ":memory:",
      userGlobalDbPath: ":memory:",
    });
  }

  it("update() patches a personal entry", () => {
    const store = makeStore();
    store.add(entry);
    store.update("b063-test", { confidence: 0.9 });
    const updated = store.getById("b063-test");
    expect(updated?.confidence).toBe(0.9);
    store.close();
  });

  it("delete() removes a personal entry", () => {
    const store = makeStore();
    store.add(entry);
    store.delete("b063-test");
    expect(store.getById("b063-test")).toBeUndefined();
    store.close();
  });

  it("count() returns total entries across both layers", () => {
    const store = makeStore();
    store.add(entry);
    const globalEntry = { ...entry, id: "b063-global", scope: { level: "global" as const } };
    store.add(globalEntry);
    expect(store.count()).toBe(2);
    store.close();
  });

  it("findByScopeLevel() returns only matching scope", () => {
    const store = makeStore();
    store.add(entry);
    const globalEntry = { ...entry, id: "b063-global", scope: { level: "global" as const } };
    store.add(globalEntry);
    const personal = store.findByScopeLevel("personal");
    expect(personal).toHaveLength(1);
    expect(personal[0]?.id).toBe("b063-test");
    store.close();
  });
});
