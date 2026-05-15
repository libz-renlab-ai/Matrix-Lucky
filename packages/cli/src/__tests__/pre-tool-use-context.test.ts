import { describe, it, expect } from "vitest";
import { buildToolActionSummary } from "../pre-tool-use-context.js";

describe("buildToolActionSummary", () => {
  it("Bash: extracts command text", () => {
    const s = buildToolActionSummary("Bash", { command: "git push --force origin main" });
    expect(s).toContain("git push --force origin main");
    expect(s).not.toBe("");
  });

  it("Edit: includes file path and content snippet", () => {
    const s = buildToolActionSummary("Edit", {
      file_path: "src/auth.ts",
      old_string: "old",
      new_string: "const hash = bcrypt.hash(password)",
    });
    expect(s).toContain("auth.ts");
    expect(s).toContain("bcrypt");
  });

  it("Write: includes file path and content snippet", () => {
    const s = buildToolActionSummary("Write", {
      file_path: "migration.sql",
      content: "DROP TABLE users;",
    });
    expect(s).toContain("migration.sql");
    expect(s).toContain("DROP TABLE");
  });

  it("Read: includes file path", () => {
    const s = buildToolActionSummary("Read", { file_path: "CLAUDE.md" });
    expect(s).toContain("CLAUDE.md");
  });

  it("Grep: includes pattern", () => {
    const s = buildToolActionSummary("Grep", { pattern: "dangerously-skip" });
    expect(s).toContain("dangerously-skip");
  });

  it("unknown tool: falls back to tool name + json snippet", () => {
    const s = buildToolActionSummary("UnknownTool", { foo: "bar" });
    expect(s).toContain("UnknownTool");
  });

  it("Bash: very long command is truncated", () => {
    const longCmd = "a".repeat(300);
    const s = buildToolActionSummary("Bash", { command: longCmd });
    expect(s.length).toBeLessThan(300);
  });
});
