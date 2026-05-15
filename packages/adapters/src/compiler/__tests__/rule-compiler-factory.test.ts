import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createRuleCompiler } from "../rule-compiler-factory.js";

describe("createRuleCompiler", () => {
  const prev = process.env["TEAMAGENT_LEGACY_CLAUDE_MD"];
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rule-cf-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (prev === undefined) delete process.env["TEAMAGENT_LEGACY_CLAUDE_MD"];
    else process.env["TEAMAGENT_LEGACY_CLAUDE_MD"] = prev;
  });

  it("default returns nested compiler", () => {
    delete process.env["TEAMAGENT_LEGACY_CLAUDE_MD"];
    const compiler = createRuleCompiler({ rulesDir: dir });
    compiler.writeToFile([]);
    expect(fs.existsSync(path.join(dir, "INDEX.md"))).toBe(true);
  });

  it("explicit legacy: true returns CLAUDE.md compiler", () => {
    const claudeMd = path.join(dir, "CLAUDE.md");
    const compiler = createRuleCompiler({ legacy: true, claudeMdPath: claudeMd });
    compiler.writeToFile([]);
    expect(fs.existsSync(claudeMd)).toBe(true);
  });

  it("explicit legacy: false beats env=1", () => {
    process.env["TEAMAGENT_LEGACY_CLAUDE_MD"] = "1";
    const compiler = createRuleCompiler({ legacy: false, rulesDir: dir });
    compiler.writeToFile([]);
    expect(fs.existsSync(path.join(dir, "INDEX.md"))).toBe(true);
    // No CLAUDE.md created
    expect(fs.existsSync(path.join(dir, "CLAUDE.md"))).toBe(false);
  });

  it("env TEAMAGENT_LEGACY_CLAUDE_MD=1 routes to legacy", () => {
    process.env["TEAMAGENT_LEGACY_CLAUDE_MD"] = "1";
    const claudeMd = path.join(dir, "CLAUDE.md");
    const compiler = createRuleCompiler({ claudeMdPath: claudeMd });
    compiler.writeToFile([]);
    expect(fs.existsSync(claudeMd)).toBe(true);
  });

  it("legacy without claudeMdPath throws", () => {
    expect(() => createRuleCompiler({ legacy: true })).toThrow(/claudeMdPath/);
  });
});
