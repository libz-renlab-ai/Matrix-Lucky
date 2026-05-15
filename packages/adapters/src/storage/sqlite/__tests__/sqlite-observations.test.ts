import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDb } from "../schema.js";
import { SqliteObservations } from "../sqlite-observations.js";
import { SqliteKnowledgeStore } from "../sqlite-knowledge-store.js";

let tmpDir: string;
let obs: SqliteObservations;
let store: SqliteKnowledgeStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-obs-"));
  const db = openDb(path.join(tmpDir, "test.db"));
  obs = new SqliteObservations(db);
  store = new SqliteKnowledgeStore(db);
  store.add({
    id: "r-1", scope: { level: "personal" }, category: "E", tags: [],
    type: "avoidance", nature: "subjective", trigger: "t", wrong_pattern: "w",
    correct_pattern: "c", reasoning: "r", confidence: 0,
    enforcement: "passive", status: "active",
    hit_count: 0, success_count: 0, override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-15T00:00:00Z", last_hit_at: "", last_validated_at: "2026-04-15T00:00:00Z",
    source: "accumulated", conflict_with: [],
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
  });
});

afterEach(() => {
  obs.close();
  if (tmpDir && fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("SqliteObservations", () => {
  it("add + listForKnowledge", () => {
    obs.add({ id: "o1", knowledge_id: "r-1", timestamp: "2026-04-15T00:01:00Z", outcome: "success" });
    obs.add({ id: "o2", knowledge_id: "r-1", timestamp: "2026-04-15T00:02:00Z", outcome: "failure" });
    const list = obs.listForKnowledge("r-1");
    expect(list).toHaveLength(2);
    expect(list[0]!.outcome).toBe("failure"); // DESC 默认
    expect(list[1]!.outcome).toBe("success");
  });

  it("cascade delete — 删 knowledge 时 observations 一起删", () => {
    obs.add({ id: "o1", knowledge_id: "r-1", timestamp: "t", outcome: "success" });
    store.delete("r-1");
    expect(obs.listForKnowledge("r-1")).toHaveLength(0);
  });

  it("countByOutcome", () => {
    obs.add({ id: "o1", knowledge_id: "r-1", timestamp: "t1", outcome: "success" });
    obs.add({ id: "o2", knowledge_id: "r-1", timestamp: "t2", outcome: "success" });
    obs.add({ id: "o3", knowledge_id: "r-1", timestamp: "t3", outcome: "failure" });
    expect(obs.countByOutcome("r-1", "success")).toBe(2);
    expect(obs.countByOutcome("r-1", "failure")).toBe(1);
  });
});
