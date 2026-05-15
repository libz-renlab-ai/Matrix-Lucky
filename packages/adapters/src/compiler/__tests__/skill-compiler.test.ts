import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { makeSkillCompiler } from "../skill-compiler.js";
import { runSkillCompilerContract } from "@teamagent/ports/contracts";
import type { KnowledgeEntry } from "@teamagent/types";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "skill-adapter-"));
}

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

// 跑契约测试
runSkillCompilerContract(() => {
  const d = mkTmp();
  tmpDirs.push(d);
  return makeSkillCompiler({ skillsDir: d });
});

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "test-rule",
    scope: { level: "personal" },
    category: "C",
    tags: [],
    type: "avoidance",
    nature: "objective",
    trigger: "bad",
    wrong_pattern: "bad",
    correct_pattern: "good",
    reasoning: "good > bad",
    confidence: 0.8,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-16T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "accumulated",
    conflict_with: [],
    current_tier: "stable" as const,
    max_tier_ever: "stable" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...overrides,
  };
}

describe("SkillCompiler adapter IO tests", () => {
  it("write() creates SKILL.md file in skillsDir/<id>/", async () => {
    const tmpDir = mkTmp();
    tmpDirs.push(tmpDir);
    const compiler = makeSkillCompiler({ skillsDir: tmpDir });
    const entry = makeEntry({ id: "my-rule" });
    const artifacts = compiler.compile([entry]);
    const { written } = await compiler.write(artifacts);
    expect(written).toEqual(["my-rule"]);
    const skillPath = path.join(tmpDir, "my-rule", "SKILL.md");
    expect(fs.existsSync(skillPath)).toBe(true);
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).toContain("name: my-rule");
  });

  it("cleanup() removes skill directory", async () => {
    const tmpDir = mkTmp();
    tmpDirs.push(tmpDir);
    const compiler = makeSkillCompiler({ skillsDir: tmpDir });
    const entry = makeEntry({ id: "to-remove" });
    const artifacts = compiler.compile([entry]);
    await compiler.write(artifacts);
    expect(fs.existsSync(path.join(tmpDir, "to-remove"))).toBe(true);
    const { removed } = await compiler.cleanup(["to-remove"]);
    expect(removed).toEqual(["to-remove"]);
    expect(fs.existsSync(path.join(tmpDir, "to-remove"))).toBe(false);
  });

  it("cleanup() is idempotent (non-existent id does not throw)", async () => {
    const tmpDir = mkTmp();
    tmpDirs.push(tmpDir);
    const compiler = makeSkillCompiler({ skillsDir: tmpDir });
    await expect(compiler.cleanup(["does-not-exist"])).resolves.toBeDefined();
  });
});
