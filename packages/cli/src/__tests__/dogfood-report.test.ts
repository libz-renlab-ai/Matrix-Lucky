import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  executeDogfoodReport,
  renderDogfoodReport,
  parseDogfoodReportArgs,
} from "../commands/dogfood-report.js";
import { DualLayerStore, SqliteEventLog, openDb } from "@teamagent/adapters";
import type { KnowledgeEntry } from "@teamagent/types";

function mkTmp() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "dogfood-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "cwd");
  nodeFs.mkdirSync(home, { recursive: true });
  nodeFs.mkdirSync(cwd, { recursive: true });
  const projectDbPath = path.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path.join(home, ".teamagent", "global.db");
  const eventsDbPath = path.join(home, ".teamagent", "events.db");
  return {
    home,
    cwd,
    projectDbPath,
    userGlobalDbPath,
    eventsDbPath,
    cleanup: () => nodeFs.rmSync(root, { recursive: true, force: true }),
  };
}

function entry(over: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: "e",
    scope: { level: "personal" },
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
    ...over,
  };
}

describe("executeDogfoodReport", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => {
    tmp = mkTmp();
  });
  afterEach(() => tmp.cleanup());

  it("empty state → still writes a report", async () => {
    const r = await executeDogfoodReport({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(nodeFs.existsSync(r.outputPath)).toBe(true);
    expect(r.totalEntries).toBe(0);
    expect(r.totalEvents).toBe(0);
    const md = nodeFs.readFileSync(r.outputPath, "utf-8");
    expect(md).toContain("TeamAgent 自举报告");
  });

  it("seeds entries + events → report counts them correctly", async () => {
    nodeFs.mkdirSync(path.dirname(tmp.projectDbPath), { recursive: true });
    nodeFs.mkdirSync(path.dirname(tmp.userGlobalDbPath), { recursive: true });
    const store = new DualLayerStore({ projectDbPath: tmp.projectDbPath, userGlobalDbPath: tmp.userGlobalDbPath });
    store.add(entry({ id: "rule-a", trigger: "use HTTP" }));
    store.add(entry({ id: "rule-b", trigger: "use DB" }));
    store.close();

    nodeFs.mkdirSync(path.dirname(tmp.eventsDbPath), { recursive: true });
    const log = new SqliteEventLog(openDb(tmp.eventsDbPath));
    log.append({ id: "e1", kind: "hook-pre.matched", knowledge_id: "rule-a", timestamp: "2026-04-15T00:01:00Z", schema_version: 1 });
    log.append({ id: "e2", kind: "hook-pre.matched", knowledge_id: "rule-a", timestamp: "2026-04-15T00:02:00Z", schema_version: 1 });
    log.append({ id: "e3", kind: "hook-pre.matched", knowledge_id: "rule-b", timestamp: "2026-04-15T00:03:00Z", schema_version: 1 });
    log.close();

    const r = await executeDogfoodReport({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      now: () => new Date("2026-04-15T01:00:00Z"),
    });

    expect(r.totalEntries).toBe(2);
    expect(r.totalEvents).toBe(3);
    expect(r.scopes.personal).toBe(2);
    expect(r.topFired[0]!.knowledge_id).toBe("rule-a");
    expect(r.topFired[0]!.fires).toBe(2);
    expect(r.topFired[1]!.knowledge_id).toBe("rule-b");
    expect(r.topFired[1]!.fires).toBe(1);
  });

  it("counts archived entries", async () => {
    nodeFs.mkdirSync(path.dirname(tmp.projectDbPath), { recursive: true });
    nodeFs.mkdirSync(path.dirname(tmp.userGlobalDbPath), { recursive: true });
    const store = new DualLayerStore({ projectDbPath: tmp.projectDbPath, userGlobalDbPath: tmp.userGlobalDbPath });
    store.add(entry({ id: "active", status: "active" }));
    store.add(entry({ id: "old", status: "archived" }));
    store.close();
    const r = await executeDogfoodReport({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(r.archivedCount).toBe(1);
  });

  it("aggregates calibrator confidence deltas top-N", async () => {
    nodeFs.mkdirSync(path.dirname(tmp.projectDbPath), { recursive: true });
    nodeFs.mkdirSync(path.dirname(tmp.userGlobalDbPath), { recursive: true });
    const store = new DualLayerStore({ projectDbPath: tmp.projectDbPath, userGlobalDbPath: tmp.userGlobalDbPath });
    store.add(entry({ id: "rule-up", trigger: "rising rule" }));
    store.close();

    nodeFs.mkdirSync(path.dirname(tmp.eventsDbPath), { recursive: true });
    const log = new SqliteEventLog(openDb(tmp.eventsDbPath));
    log.append({ id: "c1", kind: "calibrator.adjusted", knowledge_id: "rule-up", confidence_before: 0.7, confidence_after: 0.85, timestamp: "2026-04-15T00:01:00Z", schema_version: 1 });
    log.append({ id: "c2", kind: "calibrator.adjusted", knowledge_id: "rule-up", confidence_before: 0.85, confidence_after: 0.9, timestamp: "2026-04-15T00:02:00Z", schema_version: 1 });
    log.close();

    const r = await executeDogfoodReport({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(r.topConfidenceGain[0]!.knowledge_id).toBe("rule-up");
    expect(r.topConfidenceGain[0]!.totalDelta).toBeCloseTo(0.2, 5);
  });

  it("writes report to custom outputPath", async () => {
    const outputPath = path.join(tmp.cwd, "custom", "report.md");
    const r = await executeDogfoodReport({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      outputPath,
      now: () => new Date("2026-04-15T01:00:00Z"),
    });
    expect(r.outputPath).toBe(outputPath);
    expect(nodeFs.existsSync(outputPath)).toBe(true);
  });
});

describe("renderDogfoodReport", () => {
  it("includes all key sections", () => {
    const e = entry({ id: "t1" });
    const md = renderDogfoodReport({
      now: new Date("2026-04-15T01:00:00Z"),
      personal: [e],
      team: [],
      global: [],
      events: [],
      timeline: [{ hash: "abc", date: "2026-04-15", message: "feat(m7): test" }],
      topFired: [],
      topConfidenceGain: [],
      archivedCount: 0,
    });
    expect(md).toContain("TeamAgent 自举报告");
    expect(md).toContain("一句话结论");
    expect(md).toContain("知识库");
    expect(md).toContain("Hook 干预统计");
    expect(md).toContain("命中频次");
    expect(md).toContain("Confidence 变化");
    expect(md).toContain("git 时间线");
  });
});

describe("parseDogfoodReportArgs", () => {
  it("--output forms", () => {
    expect(parseDogfoodReportArgs(["--output", "/tmp/r.md"])).toEqual({
      outputPath: "/tmp/r.md",
    });
    expect(parseDogfoodReportArgs(["--output=/tmp/r.md"])).toEqual({
      outputPath: "/tmp/r.md",
    });
  });
});
