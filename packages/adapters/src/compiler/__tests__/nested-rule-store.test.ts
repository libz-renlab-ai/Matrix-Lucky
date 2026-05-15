import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { NestedRuleStoreCompiler } from "../nested-rule-store.js";
import type { KnowledgeEntry } from "@teamagent/types";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nested-rules-"));
}

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "test",
    scope: { level: "personal" },
    category: "E",
    tags: ["tech-choice"],
    type: "avoidance",
    nature: "subjective",
    trigger: "date library",
    wrong_pattern: "moment",
    correct_pattern: "dayjs",
    reasoning: "lighter weight",
    confidence: 0.8,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-14T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "accumulated",
    conflict_with: [],
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...overrides,
  };
}

describe("NestedRuleStoreCompiler", () => {
  let dir: string;
  let rulesDir: string;

  beforeEach(() => {
    dir = tmpDir();
    rulesDir = path.join(dir, "rules");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writeToFile() creates root INDEX.md plus tier dirs and rule files", () => {
    const compiler = new NestedRuleStoreCompiler({
      rulesDir,
      now: () => "2026-04-14T00:00:00Z",
    });
    const info = compiler.writeToFile([
      makeEntry({ id: "a", current_tier: "canonical" }),
      makeEntry({ id: "b", current_tier: "stable" }),
    ]);

    expect(fs.existsSync(path.join(rulesDir, "INDEX.md"))).toBe(true);
    expect(fs.existsSync(path.join(rulesDir, "canonical", "INDEX.md"))).toBe(true);
    expect(fs.existsSync(path.join(rulesDir, "canonical", "a.md"))).toBe(true);
    expect(fs.existsSync(path.join(rulesDir, "stable", "b.md"))).toBe(true);

    expect(info.filePath).toBe(path.join(rulesDir, "INDEX.md"));
    expect(info.blockLineCount).toBeGreaterThan(0);
  });

  it("compile() returns string summary (no IO)", () => {
    const compiler = new NestedRuleStoreCompiler({
      rulesDir,
      now: () => "2026-04-14T00:00:00Z",
    });
    const out = compiler.compile([makeEntry({ id: "a" })]);
    expect(typeof out).toBe("string");
    // No file should exist yet
    expect(fs.existsSync(path.join(rulesDir, "INDEX.md"))).toBe(false);
  });

  it("removes orphaned rule files left over from a prior compile", () => {
    const compiler = new NestedRuleStoreCompiler({
      rulesDir,
      now: () => "2026-04-14T00:00:00Z",
    });
    compiler.writeToFile([
      makeEntry({ id: "a", current_tier: "canonical" }),
      makeEntry({ id: "b", current_tier: "canonical" }),
    ]);
    expect(fs.existsSync(path.join(rulesDir, "canonical", "b.md"))).toBe(true);

    // Second pass — only a remains active. b.md must be removed.
    compiler.writeToFile([makeEntry({ id: "a", current_tier: "canonical" })]);
    expect(fs.existsSync(path.join(rulesDir, "canonical", "a.md"))).toBe(true);
    expect(fs.existsSync(path.join(rulesDir, "canonical", "b.md"))).toBe(false);
  });

  it("does NOT touch CLAUDE.md path", () => {
    const claudeMd = path.join(dir, "CLAUDE.md");
    fs.writeFileSync(claudeMd, "# user content\n", "utf-8");
    const compiler = new NestedRuleStoreCompiler({
      rulesDir,
      now: () => "2026-04-14T00:00:00Z",
    });
    compiler.writeToFile([makeEntry({ id: "a", current_tier: "canonical" })]);
    expect(fs.readFileSync(claudeMd, "utf-8")).toBe("# user content\n");
  });

  it("creates rules dir if missing", () => {
    expect(fs.existsSync(rulesDir)).toBe(false);
    const compiler = new NestedRuleStoreCompiler({
      rulesDir,
      now: () => "2026-04-14T00:00:00Z",
    });
    compiler.writeToFile([makeEntry({ id: "a" })]);
    expect(fs.existsSync(rulesDir)).toBe(true);
  });

  it("writes are idempotent — second compile with same input doesn't bloat", () => {
    const compiler = new NestedRuleStoreCompiler({
      rulesDir,
      now: () => "2026-04-14T00:00:00Z",
    });
    compiler.writeToFile([makeEntry({ id: "a", current_tier: "canonical" })]);
    const first = fs.readFileSync(path.join(rulesDir, "canonical", "a.md"), "utf-8");
    compiler.writeToFile([makeEntry({ id: "a", current_tier: "canonical" })]);
    const second = fs.readFileSync(path.join(rulesDir, "canonical", "a.md"), "utf-8");
    expect(second).toBe(first);
  });

  it("preserves user-created files inside tier dirs that don't follow rule naming", () => {
    // user drops a README.md into canonical/ — that should not be wiped
    const compiler = new NestedRuleStoreCompiler({
      rulesDir,
      now: () => "2026-04-14T00:00:00Z",
    });
    compiler.writeToFile([makeEntry({ id: "a", current_tier: "canonical" })]);
    const userFile = path.join(rulesDir, "canonical", "NOTES.md");
    fs.writeFileSync(userFile, "user notes", "utf-8");

    compiler.writeToFile([]);
    expect(fs.existsSync(userFile)).toBe(true);
  });
});
