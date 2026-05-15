import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeMigrate } from "../commands/migrate-v1-to-v2.js";

let tmpHome: string;
let tmpCwd: string;

function mkPhase1Entry(id: string, extra: Record<string, unknown> = {}): any {
  return {
    id,
    scope: { level: "personal" },
    category: "E",
    tags: ["phase1"],
    type: "avoidance",
    nature: "subjective",
    trigger: "trigger-" + id,
    wrong_pattern: "w-" + id,
    correct_pattern: "c-" + id,
    reasoning: "r-" + id,
    confidence: 0.6,
    enforcement: "warn",
    status: "active",
    hit_count: 5,
    success_count: 3,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-01T00:00:00Z",
    last_hit_at: "2026-04-10T00:00:00Z",
    last_validated_at: "2026-04-01T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    ...extra,
  };
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-migrate-home-"));
  tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-migrate-cwd-"));

  const personalPath = path.join(tmpHome, ".teamagent", "personal", "knowledge.jsonl");
  const teamPath = path.join(tmpCwd, ".teamagent", "knowledge.jsonl");
  const globalPath = path.join(tmpHome, ".teamagent", "global", "knowledge.jsonl");

  fs.mkdirSync(path.dirname(personalPath), { recursive: true });
  fs.mkdirSync(path.dirname(teamPath), { recursive: true });
  fs.mkdirSync(path.dirname(globalPath), { recursive: true });

  fs.writeFileSync(personalPath, [
    JSON.stringify(mkPhase1Entry("r-p1")),
    JSON.stringify(mkPhase1Entry("r-p2")),
  ].join("\n") + "\n");

  fs.writeFileSync(teamPath, JSON.stringify(mkPhase1Entry("r-t1", { scope: { level: "team" }})) + "\n");

  fs.writeFileSync(globalPath, JSON.stringify(mkPhase1Entry("r-g1", { scope: { level: "global" }})) + "\n");
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  fs.rmSync(tmpCwd, { recursive: true, force: true });
});

describe("executeMigrate", () => {
  it("reads Phase 1 JSONL from all 3 locations", async () => {
    const r = await executeMigrate({ homeDir: tmpHome, cwd: tmpCwd, dryRun: true });
    expect(r.readEntries).toBeGreaterThanOrEqual(4);
    expect(r.byScope.personal).toBe(2);
    expect(r.byScope.team).toBe(1);
    expect(r.byScope.global).toBe(1);
  });

  it("dry-run does not write to SQLite", async () => {
    await executeMigrate({ homeDir: tmpHome, cwd: tmpCwd, dryRun: true });
    const newDbPath = path.join(tmpCwd, ".teamagent", "knowledge.db");
    expect(fs.existsSync(newDbPath)).toBe(false);
  });

  it("handles empty / missing JSONL gracefully", async () => {
    fs.rmSync(path.join(tmpHome, ".teamagent", "personal", "knowledge.jsonl"));
    const r = await executeMigrate({ homeDir: tmpHome, cwd: tmpCwd, dryRun: true });
    expect(r.readEntries).toBeGreaterThanOrEqual(2);
    expect(r.byScope.personal).toBe(0);
  });
});

describe("executeMigrate write-side", () => {
  it("writes entries to new SQLite DBs", async () => {
    const r = await executeMigrate({ homeDir: tmpHome, cwd: tmpCwd, dryRun: false });
    expect(r.written).toBeGreaterThan(0);

    const projectDb = path.join(tmpCwd, ".teamagent", "knowledge.db");
    const globalDb = path.join(tmpHome, ".teamagent", "global.db");
    expect(fs.existsSync(projectDb)).toBe(true);
    expect(fs.existsSync(globalDb)).toBe(true);
  });

  it("Q5 决策 B: all migrated entries → experimental tier, confidence=0, demerit=0", async () => {
    await executeMigrate({ homeDir: tmpHome, cwd: tmpCwd, dryRun: false });

    const { openDb } = await import("@teamagent/adapters/storage/sqlite/schema");
    const projectDb = openDb(path.join(tmpCwd, ".teamagent", "knowledge.db"));
    const rows = projectDb.prepare("SELECT id, current_tier, confidence, demerit FROM knowledge").all() as any[];
    for (const r of rows) {
      expect(r.current_tier).toBe("experimental");
      expect(r.confidence).toBe(0);
      expect(r.demerit).toBe(0);
    }
    projectDb.close();
  });

  it("preserves hit_count/last_hit_at in tags for reference", async () => {
    await executeMigrate({ homeDir: tmpHome, cwd: tmpCwd, dryRun: false });
    const { openDb } = await import("@teamagent/adapters/storage/sqlite/schema");
    const projectDb = openDb(path.join(tmpCwd, ".teamagent", "knowledge.db"));
    const row = projectDb.prepare("SELECT tags FROM knowledge WHERE id = 'r-p1'").get() as any;
    const tags = JSON.parse(row.tags);
    expect(tags).toContain("phase1_hit_count:5");
    expect(tags.some((t: string) => t.startsWith("phase1_last_hit:"))).toBe(true);
    projectDb.close();
  });

  it("preserves team-scoped Phase 1 entries in the project DB", async () => {
    await executeMigrate({ homeDir: tmpHome, cwd: tmpCwd, dryRun: false });
    const { openDb } = await import("@teamagent/adapters/storage/sqlite/schema");
    const projectDb = openDb(path.join(tmpCwd, ".teamagent", "knowledge.db"));
    const row = projectDb.prepare("SELECT id, scope_level FROM knowledge WHERE id = 'r-t1'").get() as any;
    expect(row.scope_level).toBe("team");
    projectDb.close();
  });
});
