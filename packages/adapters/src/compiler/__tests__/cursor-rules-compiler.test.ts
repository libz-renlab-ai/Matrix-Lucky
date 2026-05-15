import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CursorRulesCompiler } from "../cursor-rules-compiler.js";
import type { KnowledgeEntry } from "@teamagent/types";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cursor-compiler-"));
}

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "test-1",
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

describe("CursorRulesCompiler", () => {
  let dir: string;

  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("compile() returns non-empty string containing rule content", () => {
    const compiler = new CursorRulesCompiler(path.join(dir, ".cursorrules"));
    const text = compiler.compile([makeEntry()]);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("compile() embeds correct_pattern in output", () => {
    const compiler = new CursorRulesCompiler(path.join(dir, ".cursorrules"));
    const text = compiler.compile([makeEntry({ correct_pattern: "use dayjs not moment" })]);
    expect(text).toContain("dayjs");
  });

  it("compile() embeds reasoning in output", () => {
    const compiler = new CursorRulesCompiler(path.join(dir, ".cursorrules"));
    const entry = makeEntry({ reasoning: "moment is huge, dayjs is tiny" });
    const text = compiler.compile([entry]);
    expect(text).toContain("moment is huge");
  });

  it("compile() includes all passed entries", () => {
    const compiler = new CursorRulesCompiler(path.join(dir, ".cursorrules"));
    const entries = [
      makeEntry({ id: "e1", correct_pattern: "use-fetch", reasoning: "native" }),
      makeEntry({ id: "e2", correct_pattern: "use-dayjs", reasoning: "lightweight" }),
    ];
    const text = compiler.compile(entries);
    expect(text).toContain("use-fetch");
    expect(text).toContain("use-dayjs");
    expect(text).toContain("native");
    expect(text).toContain("lightweight");
  });

  it("compile() returns empty-like string for empty entry list", () => {
    const compiler = new CursorRulesCompiler(path.join(dir, ".cursorrules"));
    const text = compiler.compile([]);
    expect(typeof text).toBe("string");
  });

  it("writeToFile() creates the .cursorrules file", () => {
    const outPath = path.join(dir, ".cursorrules");
    const compiler = new CursorRulesCompiler(outPath);
    compiler.writeToFile([makeEntry()]);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it("writeToFile() file content contains correct_pattern", () => {
    const outPath = path.join(dir, ".cursorrules");
    const compiler = new CursorRulesCompiler(outPath);
    compiler.writeToFile([makeEntry({ correct_pattern: "prefer-const" })]);
    const content = fs.readFileSync(outPath, "utf-8");
    expect(content).toContain("prefer-const");
  });

  it("writeToFile() is idempotent — second call rewrites cleanly", () => {
    const outPath = path.join(dir, ".cursorrules");
    const compiler = new CursorRulesCompiler(outPath);
    compiler.writeToFile([makeEntry({ correct_pattern: "v1-rule" })]);
    compiler.writeToFile([makeEntry({ correct_pattern: "v2-rule" })]);
    const content = fs.readFileSync(outPath, "utf-8");
    expect(content).toContain("v2-rule");
    expect(content).not.toContain("v1-rule");
  });

  it("writeToFile() creates parent directories if missing", () => {
    const outPath = path.join(dir, "deep", "nested", ".cursorrules");
    const compiler = new CursorRulesCompiler(outPath);
    compiler.writeToFile([makeEntry()]);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it("compile() includes a generated-by header", () => {
    const compiler = new CursorRulesCompiler(path.join(dir, ".cursorrules"));
    const text = compiler.compile([makeEntry()]);
    expect(text).toMatch(/generated|teamagent|cursorrules/i);
  });
});
