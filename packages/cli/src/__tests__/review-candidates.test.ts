import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { SqliteCandidateQueue, openDb } from "@teamagent/adapters";
import type { KnowledgeEntry } from "@teamagent/types";
import {
  executeReviewCandidates,
  parseReviewCandidatesArgs,
} from "../commands/review-candidates.js";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function mkTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-candidates-"));
  tmpDirs.push(dir);
  return {
    root: dir,
    cwd: path.join(dir, "project"),
    home: path.join(dir, "home"),
  };
}

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "candidate-rule",
    scope: { level: "personal" },
    category: "E",
    tags: ["review-gate"],
    type: "avoidance",
    nature: "objective",
    trigger: "bad team pattern",
    wrong_pattern: "bad",
    correct_pattern: "good",
    reasoning: "because",
    confidence: 0.5,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-05-04T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-05-04T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...overrides,
  };
}

function captureOutput() {
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return { output, text: () => chunks.join("") };
}

describe("parseReviewCandidatesArgs", () => {
  it("defaults to no limit (Infinity = process all)", () => {
    const opts = parseReviewCandidatesArgs([]);
    expect(opts.limit).toBe(Number.POSITIVE_INFINITY);
    // Sanity: slice(0, Infinity) is identity, so executor still processes every
    // pending candidate when --limit is omitted.
    expect([1, 2, 3].slice(0, opts.limit!)).toEqual([1, 2, 3]);
  });

  it("parses --limit=5", () => {
    const opts = parseReviewCandidatesArgs(["--limit=5"]);
    expect(opts.limit).toBe(5);
  });

  it("parses --limit 3 (space)", () => {
    const opts = parseReviewCandidatesArgs(["--limit", "3"]);
    expect(opts.limit).toBe(3);
  });

  it("parses --approve-scope=team", () => {
    const opts = parseReviewCandidatesArgs(["--approve-scope=team"]);
    expect(opts.approveScope).toBe("team");
  });
});

describe("executeReviewCandidates", () => {
  it("approves a pending candidate as local team scope when requested", async () => {
    const tmp = mkTmp();
    fs.mkdirSync(tmp.cwd, { recursive: true });
    fs.mkdirSync(tmp.home, { recursive: true });

    const candidatesDbPath = path.join(tmp.home, ".teamagent", "candidates.db");
    fs.mkdirSync(path.dirname(candidatesDbPath), { recursive: true });
    const queueDb = openDb(candidatesDbPath);
    const queue = new SqliteCandidateQueue(queueDb);
    queue.enqueue([
      {
        id: "cand-team",
        entry: makeEntry({ id: "team-approved-rule" }),
        sourceSignals: "unit-test signal",
      },
    ]);
    queueDb.close();

    const { output, text } = captureOutput();
    const summary = await executeReviewCandidates({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      candidatesDbPath,
      projectDbPath: path.join(tmp.cwd, ".teamagent", "knowledge.db"),
      userGlobalDbPath: path.join(tmp.home, ".teamagent", "global.db"),
      eventsDbPath: path.join(tmp.home, ".teamagent", "events.db"),
      skillsDir: path.join(tmp.home, ".claude", "skills", "teamagent"),
      approveScope: "team",
      input: Readable.from(["a\n"]),
      output,
      now: () => new Date("2026-05-04T00:00:00Z"),
      docsPropagationScheduler: () => undefined,
    });

    expect(text()).toContain("scope: team");
    expect(summary).toContain("✓批准 1");

    const projectDb = openDb(path.join(tmp.cwd, ".teamagent", "knowledge.db"));
    const row = projectDb
      .prepare("SELECT id, scope_level FROM knowledge WHERE id = ?")
      .get("team-approved-rule") as any;
    expect(row).toMatchObject({ id: "team-approved-rule", scope_level: "team" });
    projectDb.close();

    const verifyQueueDb = openDb(candidatesDbPath);
    const statusRow = verifyQueueDb
      .prepare("SELECT status FROM rule_candidates WHERE id = ?")
      .get("cand-team") as any;
    expect(statusRow.status).toBe("approved");
    verifyQueueDb.close();
  });

  it("blocks approving sensitive candidates into team scope", async () => {
    const tmp = mkTmp();
    fs.mkdirSync(tmp.cwd, { recursive: true });
    fs.mkdirSync(tmp.home, { recursive: true });

    const candidatesDbPath = path.join(tmp.home, ".teamagent", "candidates.db");
    fs.mkdirSync(path.dirname(candidatesDbPath), { recursive: true });
    const queueDb = openDb(candidatesDbPath);
    const queue = new SqliteCandidateQueue(queueDb);
    queue.enqueue([
      {
        id: "cand-sensitive",
        entry: makeEntry({
          id: "sensitive-team-rule",
          trigger: "prod incident from alice@example.com",
          reasoning: "secret host prod-db.internal should not leave local review",
        }),
        sourceSignals: "unit-test signal",
      },
    ]);
    queueDb.close();

    const { output, text } = captureOutput();
    const summary = await executeReviewCandidates({
      cwd: tmp.cwd,
      homeDir: tmp.home,
      candidatesDbPath,
      projectDbPath: path.join(tmp.cwd, ".teamagent", "knowledge.db"),
      userGlobalDbPath: path.join(tmp.home, ".teamagent", "global.db"),
      approveScope: "team",
      input: Readable.from(["a\n"]),
      output,
      now: () => new Date("2026-05-04T00:00:00Z"),
      docsPropagationScheduler: () => undefined,
    });

    expect(text()).toContain("隐私守门拦截");
    expect(summary).toContain("✓批准 0");

    const projectDb = openDb(path.join(tmp.cwd, ".teamagent", "knowledge.db"));
    const row = projectDb
      .prepare("SELECT id FROM knowledge WHERE id = ?")
      .get("sensitive-team-rule") as any;
    expect(row).toBeUndefined();
    projectDb.close();

    const verifyQueueDb = openDb(candidatesDbPath);
    const statusRow = verifyQueueDb
      .prepare("SELECT status FROM rule_candidates WHERE id = ?")
      .get("cand-sensitive") as any;
    expect(statusRow.status).toBe("pending");
    verifyQueueDb.close();
  });
});
