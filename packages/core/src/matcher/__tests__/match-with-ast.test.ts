import { describe, it, expect, beforeAll } from "vitest";
import { initAstMatcher } from "../legacy/ast-context.js";
import { matchRules } from "../match.js";

beforeAll(async () => {
  await initAstMatcher();
});

describe("matchRules — AST context filtering", () => {
  const axiosRule: any = {
    id: "axios-to-fetch",
    scope: { level: "personal", file_types: ["*.ts"] },
    wrong_pattern: "axios",
    category: "E",
    type: "avoidance",
    nature: "subjective",
    trigger: "use axios",
    correct_pattern: "fetch",
    reasoning: "",
    confidence: 0.6,
    enforcement: "warn",
    status: "active",
    hit_count: 0, success_count: 0, override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "", last_hit_at: "", last_validated_at: "",
    source: "accumulated", conflict_with: [],
    tags: [],
  };

  it("real axios usage → match", async () => {
    const result = await matchRules(
      { file_path: "/a.ts", content: `import axios from "axios";` },
      [axiosRule],
      {}
    );
    expect(result.matched).toContainEqual(expect.objectContaining({ id: "axios-to-fetch" }));
  });

  it("axios in comment → filtered out", async () => {
    const result = await matchRules(
      { file_path: "/a.ts", content: `// TODO: replace axios\nconst x = fetch(url);` },
      [axiosRule],
      {}
    );
    expect(result.matched).toHaveLength(0);
  });

  it("axios in markdown .md → filtered out", async () => {
    const result = await matchRules(
      { file_path: "/readme.md", content: "Use `axios` cautiously." },
      [axiosRule],
      {}
    );
    expect(result.matched).toHaveLength(0);
  });
});
