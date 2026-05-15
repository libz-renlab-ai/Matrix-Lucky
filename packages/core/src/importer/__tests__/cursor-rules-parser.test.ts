import { describe, it, expect } from "vitest";
import { extractCursorRules } from "../cursor-rules-parser.js";

describe("extractCursorRules", () => {
  it("empty input → []", () => {
    expect(extractCursorRules("")).toEqual([]);
    expect(extractCursorRules("   \n\n   ")).toEqual([]);
  });

  it("bullet list: each bullet is a rule", () => {
    const text = `- Use TypeScript strict mode
- Prefer composition over inheritance
- Small PRs under 400 lines`;
    expect(extractCursorRules(text)).toEqual([
      "Use TypeScript strict mode",
      "Prefer composition over inheritance",
      "Small PRs under 400 lines",
    ]);
  });

  it("numbered list: each entry is a rule", () => {
    const text = `1. Write tests first
2. Keep commits small
3. Review before merge`;
    expect(extractCursorRules(text)).toEqual([
      "Write tests first",
      "Keep commits small",
      "Review before merge",
    ]);
  });

  it("paragraphs separated by blank lines", () => {
    const text = `Always prefer fetch over third-party HTTP clients.
This codebase values zero-dependency style.

Database writes should go through the repository abstraction.
Never hit raw SQL in route handlers.

Log errors via the shared logger module.`;
    const out = extractCursorRules(text);
    expect(out).toHaveLength(3);
    expect(out[0]).toContain("fetch");
    expect(out[1]).toContain("repository abstraction");
    expect(out[2]).toContain("shared logger");
  });

  it("single paragraph (prose) → single rule", () => {
    const text = "The team convention is to always run pnpm test before pushing.";
    expect(extractCursorRules(text)).toEqual([text]);
  });

  it("bullets mixed with prose: bullets win", () => {
    const text = `Here are the project rules you must follow:

- Rule one
- Rule two

And some more context that shouldn't be imported.`;
    expect(extractCursorRules(text)).toEqual(["Rule one", "Rule two"]);
  });

  it("strips markdown headers from paragraph list", () => {
    const text = `# Project Rules

Use TypeScript only, no vanilla JS.

# Style

2-space indent.`;
    const out = extractCursorRules(text);
    expect(out).toEqual(["Use TypeScript only, no vanilla JS.", "2-space indent."]);
  });

  it("real-world style: short .cursorrules with mixed content", () => {
    const text = `You are working on a Node.js/TypeScript backend.

- Always validate input with zod
- Use dependency injection
- Tests go in __tests__/ next to source

Avoid introducing new dependencies without discussion.`;
    const out = extractCursorRules(text);
    // bullets present → paragraphs outside bullets are ignored
    expect(out).toEqual([
      "Always validate input with zod",
      "Use dependency injection",
      "Tests go in __tests__/ next to source",
    ]);
  });
});
