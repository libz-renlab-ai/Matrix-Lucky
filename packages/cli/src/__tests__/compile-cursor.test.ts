import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  executeCompileCursor,
  parseCompileCursorArgs,
  renderCompileCursorResult,
  type CompileCursorOptions,
} from "../commands/compile-cursor.js";
import { DualLayerStore, SqliteKnowledgeStore, openDb } from "@teamagent/adapters";
import type { KnowledgeEntry } from "@teamagent/types";

function mkTmp() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "compile-cursor-cli-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "cwd");
  nodeFs.mkdirSync(home, { recursive: true });
  nodeFs.mkdirSync(cwd, { recursive: true });
  const projectDbPath = path.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path.join(home, ".teamagent", "global.db");
  return {
    home,
    cwd,
    projectDbPath,
    userGlobalDbPath,
    cleanup: () => nodeFs.rmSync(root, { recursive: true, force: true }),
  };
}

function seedEntry(dbPath: string, e: KnowledgeEntry): void {
  nodeFs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new SqliteKnowledgeStore(openDb(dbPath));
  store.add(e);
  store.close();
}

function entry(over: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "rule-cc-1",
    scope: { level: "personal" },
    category: "C",
    tags: [],
    type: "avoidance",
    nature: "objective",
    trigger: "avoid-var",
    wrong_pattern: "var ",
    correct_pattern: "const or let",
    reasoning: "var has function scope, not block scope",
    confidence: 0.9,
    enforcement: "warn",
    status: "active",
    hit_count: 1,
    success_count: 1,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-01-01T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-01-01T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
    tier_entered_at: "2026-01-01T00:00:00Z",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...over,
  };
}

describe("parseCompileCursorArgs", () => {
  it("defaults when no args", () => {
    const opts = parseCompileCursorArgs([]);
    expect(opts.out).toBeUndefined();
    expect(opts.top).toBeUndefined();
  });

  it("parses --out", () => {
    expect(parseCompileCursorArgs(["--out", "/tmp/my.cursorrules"])).toMatchObject({
      out: "/tmp/my.cursorrules",
    });
    expect(parseCompileCursorArgs(["--out=/tmp/other.cursorrules"])).toMatchObject({
      out: "/tmp/other.cursorrules",
    });
  });

  it("parses --top", () => {
    expect(parseCompileCursorArgs(["--top", "5"])).toMatchObject({ top: 5 });
    expect(parseCompileCursorArgs(["--top=10"])).toMatchObject({ top: 10 });
  });
});

describe("executeCompileCursor", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let baseOpts: CompileCursorOptions;

  beforeEach(() => {
    tmp = mkTmp();
    baseOpts = {
      cwd: tmp.cwd,
      homeDir: tmp.home,
      projectDbPath: tmp.projectDbPath,
      userGlobalDbPath: tmp.userGlobalDbPath,
    };
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("empty store writes an empty (or near-empty) .cursorrules file and returns 0 rules", async () => {
    const result = await executeCompileCursor(baseOpts);
    expect(result.ruleCount).toBe(0);
    expect(nodeFs.existsSync(result.outPath)).toBe(true);
    // file content should be plain text (not JSON)
    const content = nodeFs.readFileSync(result.outPath, "utf8");
    expect(content.trimStart().startsWith("{")).toBe(false);
    expect(content.trimStart().startsWith("[")).toBe(false);
  });

  it("single seeded rule is written to .cursorrules output file", async () => {
    seedEntry(tmp.projectDbPath, entry({ current_tier: "canonical" }));
    const outPath = path.join(tmp.cwd, ".cursorrules");
    const result = await executeCompileCursor({ ...baseOpts, out: outPath });

    expect(result.ruleCount).toBe(1);
    expect(nodeFs.existsSync(outPath)).toBe(true);

    const content = nodeFs.readFileSync(outPath, "utf8");
    expect(content.length).toBeGreaterThan(10);
    // Rule text should appear somewhere
    expect(content).toContain("avoid-var");
  });

  it("--top N truncates rules to at most N entries", async () => {
    // Seed 5 rules with varying confidence
    for (let i = 0; i < 5; i++) {
      seedEntry(
        tmp.projectDbPath,
        entry({ id: `rule-${i}`, trigger: `trigger-${i}`, confidence: (5 - i) * 0.1 }),
      );
    }
    const result = await executeCompileCursor({ ...baseOpts, top: 3 });
    // At most 3 rules should be included
    expect(result.ruleCount).toBeLessThanOrEqual(3);
  });
});

describe("renderCompileCursorResult", () => {
  it("includes rule count and path in output", () => {
    const rendered = renderCompileCursorResult({ outPath: "/some/.cursorrules", ruleCount: 7 });
    expect(rendered).toContain("7");
    expect(rendered).toContain(".cursorrules");
  });
});
