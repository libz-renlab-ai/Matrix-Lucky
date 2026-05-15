import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import {
  executeGitSyncPush,
  executeGitSyncPull,
  parseGitSyncArgs,
} from "../commands/git-sync.js";
import { DualLayerStore } from "@teamagent/adapters";
import type { KnowledgeEntry } from "@teamagent/types";

// ── helpers ──────────────────────────────────────────────────────────────────

function mkTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-sync-test-"));
  return {
    dir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "test-rule-001",
    scope: { level: "team" },
    category: "C",
    tags: ["team"],
    type: "avoidance",
    nature: "objective",
    trigger: "use team fetch",
    wrong_pattern: "axios",
    correct_pattern: "fetch",
    reasoning: "native fetch preferred",
    confidence: 0.9,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-05-01T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "accumulated",
    conflict_with: [],
    current_tier: "probation" as const,
    max_tier_ever: "probation" as const,
    tier_entered_at: "2026-05-01T00:00:00Z",
    demerit: 0.1,
    demerit_last_updated: "2026-05-01T00:00:00Z",
    resurrect_count: 0,
    ...overrides,
  };
}

function seedDb(cwd: string, home: string, entries: KnowledgeEntry[]) {
  const projectDbPath = path.join(cwd, ".teamagent", "knowledge.db");
  fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
  const userGlobalDbPath = path.join(home, ".teamagent", "global.db");
  fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  for (const e of entries) store.add(e);
  store.close();
}

function readAllTeamRules(cwd: string, home: string): KnowledgeEntry[] {
  const projectDbPath = path.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path.join(home, ".teamagent", "global.db");
  if (!fs.existsSync(projectDbPath)) return [];
  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  const entries = store.findByScopeLevel("team");
  store.close();
  return entries;
}

function initBareRepo(dir: string): string {
  const repoPath = path.join(dir, "remote.git");
  fs.mkdirSync(repoPath, { recursive: true });
  execSync("git init --bare", { cwd: repoPath, stdio: "pipe" });
  // Default HEAD on `git init --bare` is `master` on older git versions
  // (and on Windows installs where `init.defaultBranch` is not set). The
  // git-sync push path commits/pushes to `main`, so clone-without-args
  // would try to checkout the (nonexistent) master and leave the
  // worktree empty. Pin the bare repo's HEAD to main so clone picks it
  // up by default.
  execSync("git symbolic-ref HEAD refs/heads/main", { cwd: repoPath, stdio: "pipe" });
  return repoPath;
}

// ── parseGitSyncArgs ─────────────────────────────────────────────────────────

describe("parseGitSyncArgs", () => {
  it("parses sync push --remote <path>", () => {
    const args = parseGitSyncArgs(["push", "--remote", "/tmp/remote.git"]);
    expect(args.subcommand).toBe("push");
    expect(args.remote).toBe("/tmp/remote.git");
  });

  it("parses sync pull --remote=<path> --branch=main", () => {
    const args = parseGitSyncArgs(["pull", "--remote=/tmp/r.git", "--branch=main"]);
    expect(args.subcommand).toBe("pull");
    expect(args.remote).toBe("/tmp/r.git");
    expect(args.branch).toBe("main");
  });

  it("parses --cwd flag", () => {
    const args = parseGitSyncArgs(["push", "--remote=/r", "--cwd=/proj"]);
    expect(args.cwd).toBe("/proj");
  });

  it("throws on missing subcommand", () => {
    expect(() => parseGitSyncArgs(["--remote=/r"])).toThrow();
  });

  it("throws on missing --remote", () => {
    expect(() => parseGitSyncArgs(["push"])).toThrow(/--remote/);
  });
});

// ── executeGitSyncPush ───────────────────────────────────────────────────────

describe("executeGitSyncPush", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let machineA: string;
  let machineAHome: string;
  let remoteGit: string;

  beforeEach(() => {
    tmp = mkTmp();
    machineA = path.join(tmp.dir, "machine-a");
    machineAHome = path.join(tmp.dir, "home-a");
    fs.mkdirSync(machineA, { recursive: true });
    fs.mkdirSync(machineAHome, { recursive: true });
    remoteGit = initBareRepo(tmp.dir);
  });

  afterEach(() => tmp.cleanup());

  it("push exports team rules and pushes to bare remote", () => {
    seedDb(machineA, machineAHome, [
      makeEntry({ id: "rule-01", scope: { level: "team" } }),
      makeEntry({ id: "rule-02", scope: { level: "team" }, trigger: "other" }),
    ]);

    const result = executeGitSyncPush({
      cwd: machineA,
      homeDir: machineAHome,
      remote: remoteGit,
    });

    expect(result.ok).toBe(true);
    expect(result.exported).toBe(2);
    expect(result.pushed).toBe(true);
    // bundle file should exist
    const bundlePath = path.join(machineA, ".teamagent", "team-rules.json");
    expect(fs.existsSync(bundlePath)).toBe(true);
  });

  it("push with no team rules still succeeds (0 exported)", () => {
    // No DB at all → export returns ok:true, exported:0
    const result = executeGitSyncPush({
      cwd: machineA,
      homeDir: machineAHome,
      remote: remoteGit,
    });
    expect(result.ok).toBe(true);
    expect(result.exported).toBe(0);
  });

  it("fails gracefully when remote is invalid path", () => {
    seedDb(machineA, machineAHome, [makeEntry()]);
    const result = executeGitSyncPush({
      cwd: machineA,
      homeDir: machineAHome,
      remote: "/nonexistent/no-remote.git",
    });
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/push failed|failed/i);
  });
});

// ── executeGitSyncPull ───────────────────────────────────────────────────────

describe("executeGitSyncPull", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let machineA: string;
  let machineAHome: string;
  let machineB: string;
  let machineBHome: string;
  let remoteGit: string;

  beforeEach(() => {
    tmp = mkTmp();
    machineA = path.join(tmp.dir, "machine-a");
    machineAHome = path.join(tmp.dir, "home-a");
    machineB = path.join(tmp.dir, "machine-b");
    machineBHome = path.join(tmp.dir, "home-b");
    fs.mkdirSync(machineA, { recursive: true });
    fs.mkdirSync(machineAHome, { recursive: true });
    fs.mkdirSync(machineB, { recursive: true });
    fs.mkdirSync(machineBHome, { recursive: true });
    remoteGit = initBareRepo(tmp.dir);
  });

  afterEach(() => tmp.cleanup());

  it("pull imports rules pushed from machine-a", () => {
    const entries = [
      makeEntry({ id: "rule-01", confidence: 0.8, demerit: 0.2 }),
      makeEntry({ id: "rule-02", confidence: 0.95, demerit: 0.0 }),
    ];
    seedDb(machineA, machineAHome, entries);

    // Push from A
    const pushResult = executeGitSyncPush({
      cwd: machineA,
      homeDir: machineAHome,
      remote: remoteGit,
    });
    expect(pushResult.ok).toBe(true);

    // Pull to B
    const pullResult = executeGitSyncPull({
      cwd: machineB,
      homeDir: machineBHome,
      remote: remoteGit,
    });
    expect(pullResult.ok).toBe(true);
    expect(pullResult.imported).toBe(2);

    // Verify B has all rules
    const bRules = readAllTeamRules(machineB, machineBHome);
    expect(bRules).toHaveLength(2);
    const ids = bRules.map((r) => r.id).sort();
    expect(ids).toEqual(["rule-01", "rule-02"]);
  });

  it("preserves confidence and demerit on pull", () => {
    const entry = makeEntry({ id: "rule-conf", confidence: 0.77, demerit: 0.33 });
    seedDb(machineA, machineAHome, [entry]);

    executeGitSyncPush({ cwd: machineA, homeDir: machineAHome, remote: remoteGit });
    executeGitSyncPull({ cwd: machineB, homeDir: machineBHome, remote: remoteGit });

    const bRules = readAllTeamRules(machineB, machineBHome);
    const imported = bRules.find((r) => r.id === "rule-conf");
    expect(imported).toBeDefined();
    expect(imported!.confidence).toBeCloseTo(0.77, 2);
    expect(imported!.demerit).toBeCloseTo(0.33, 2);
  });

  it("preserves reasoning (body) on pull", () => {
    const entry = makeEntry({ id: "rule-body", reasoning: "my important reasoning text" });
    seedDb(machineA, machineAHome, [entry]);

    executeGitSyncPush({ cwd: machineA, homeDir: machineAHome, remote: remoteGit });
    executeGitSyncPull({ cwd: machineB, homeDir: machineBHome, remote: remoteGit });

    const bRules = readAllTeamRules(machineB, machineBHome);
    const imported = bRules.find((r) => r.id === "rule-body");
    expect(imported!.reasoning).toBe("my important reasoning text");
  });

  it("skips duplicate rules on second pull", () => {
    seedDb(machineA, machineAHome, [makeEntry({ id: "rule-dup" })]);
    executeGitSyncPush({ cwd: machineA, homeDir: machineAHome, remote: remoteGit });

    // First pull
    const first = executeGitSyncPull({ cwd: machineB, homeDir: machineBHome, remote: remoteGit });
    expect(first.imported).toBe(1);
    expect(first.skipped).toBe(0);

    // Second pull — same bundle, rule already in B
    const second = executeGitSyncPull({ cwd: machineB, homeDir: machineBHome, remote: remoteGit });
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it("fails gracefully when remote has no commits yet", () => {
    const result = executeGitSyncPull({
      cwd: machineB,
      homeDir: machineBHome,
      remote: remoteGit,
    });
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/failed|error|empty|not found/i);
  });
});
