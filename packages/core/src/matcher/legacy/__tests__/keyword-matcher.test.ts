import { describe, it, expect } from "vitest";
import { matchRules } from "../keyword-matcher.js";
import type { KnowledgeEntry } from "@teamagent/types";

function makeRule(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "r",
    scope: { level: "personal" },
    category: "E",
    tags: ["t"],
    type: "avoidance",
    nature: "objective",
    trigger: "",
    wrong_pattern: "",
    correct_pattern: "",
    reasoning: "",
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
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...overrides,
  };
}

describe("matchRules — basic matching", () => {
  it("empty rules → no matches", () => {
    expect(
      matchRules({ toolName: "Bash", input: { command: "ls" } }, []),
    ).toEqual([]);
  });

  it("matches Bash command containing wrong_pattern", () => {
    const rule = makeRule({
      id: "moment",
      wrong_pattern: "moment",
      correct_pattern: "dayjs",
      reasoning: "deprecated",
    });
    const matches = matchRules(
      { toolName: "Bash", input: { command: "npm install moment" } },
      [rule],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe("moment");
  });

  it("M3 洞1: matches type=practice rule that carries wrong_pattern", () => {
    const rule = makeRule({
      id: "practice-with-wp",
      type: "practice",
      wrong_pattern: "等通知",
      correct_pattern: "立即读 output-file",
    });
    const matches = matchRules(
      { toolName: "Bash", input: { command: "echo 等通知" } },
      [rule],
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe("practice-with-wp");
  });

  it("M3 洞1: skips rule with empty wrong_pattern regardless of type", () => {
    const practiceNoWp = makeRule({ id: "practice-empty", type: "practice", wrong_pattern: "" });
    const avoidanceNoWp = makeRule({ id: "avoidance-empty", type: "avoidance", wrong_pattern: "" });
    const matches = matchRules(
      { toolName: "Bash", input: { command: "anything" } },
      [practiceNoWp, avoidanceNoWp],
    );
    expect(matches).toEqual([]);
  });

  it("does not match when pattern absent", () => {
    const rule = makeRule({ wrong_pattern: "moment" });
    const matches = matchRules(
      { toolName: "Bash", input: { command: "npm install dayjs" } },
      [rule],
    );
    expect(matches).toEqual([]);
  });

  it("matches only avoidance type rules (not practice)", () => {
    const practice = makeRule({
      id: "p",
      type: "practice",
      wrong_pattern: "",
      correct_pattern: "好的实践",
    });
    const matches = matchRules(
      { toolName: "Bash", input: { command: "anything" } },
      [practice],
    );
    expect(matches).toEqual([]);
  });

  it("ignores archived rules", () => {
    const rule = makeRule({
      id: "old",
      wrong_pattern: "rm -rf",
      status: "archived",
    });
    const matches = matchRules(
      { toolName: "Bash", input: { command: "rm -rf /" } },
      [rule],
    );
    expect(matches).toEqual([]);
  });

  it("matches case-insensitively", () => {
    const rule = makeRule({ wrong_pattern: "moment" });
    const matches = matchRules(
      { toolName: "Bash", input: { command: "NPM INSTALL MOMENT" } },
      [rule],
    );
    expect(matches).toHaveLength(1);
  });
});

describe("matchRules — multi-field input scanning", () => {
  it("matches Write tool against file_path", () => {
    const rule = makeRule({
      wrong_pattern: ".env.production",
    });
    const matches = matchRules(
      {
        toolName: "Write",
        input: { file_path: "config/.env.production", content: "SECRET=x" },
      },
      [rule],
    );
    expect(matches).toHaveLength(1);
  });

  it("matches Write tool against content", () => {
    const rule = makeRule({ wrong_pattern: "console.log" });
    const matches = matchRules(
      {
        toolName: "Write",
        input: { file_path: "src/index.ts", content: "console.log('debug')" },
      },
      [rule],
    );
    expect(matches).toHaveLength(1);
  });

  it("matches Edit tool against new_string", () => {
    const rule = makeRule({ wrong_pattern: "TODO" });
    const matches = matchRules(
      {
        toolName: "Edit",
        input: { file_path: "x.ts", old_string: "ok", new_string: "TODO later" },
      },
      [rule],
    );
    expect(matches).toHaveLength(1);
  });

  it("matches WebFetch url", () => {
    const rule = makeRule({ wrong_pattern: "internal.company.com" });
    const matches = matchRules(
      { toolName: "WebFetch", input: { url: "https://internal.company.com/x", prompt: "p" } },
      [rule],
    );
    expect(matches).toHaveLength(1);
  });
});

describe("matchRules — multi-pattern OR semantics", () => {
  it("multiple patterns separated by | match any", () => {
    const rule = makeRule({ wrong_pattern: "moment|lodash|jquery" });
    expect(
      matchRules({ toolName: "Bash", input: { command: "npm install lodash" } }, [rule]),
    ).toHaveLength(1);
    expect(
      matchRules({ toolName: "Bash", input: { command: "npm install jquery" } }, [rule]),
    ).toHaveLength(1);
    expect(
      matchRules({ toolName: "Bash", input: { command: "npm install dayjs" } }, [rule]),
    ).toEqual([]);
  });

  it("tokens shorter than 3 chars are dropped (would otherwise match everything)", () => {
    // wrong_pattern 含 "如 a|b|c" 这种散文 → 切出 1 字符 token a/b/c
    // 这些不应该参与匹配，否则任何含 'a' 的代码都被命中
    const rule = makeRule({
      wrong_pattern: "wget|a|b|curl",
    });
    // 含 "b" 的内容不应命中（b 是被丢弃的短 token）
    expect(
      matchRules(
        { toolName: "Bash", input: { command: "echo b just b" } },
        [rule],
      ),
    ).toEqual([]);
    // 长 token "wget" 命中
    expect(
      matchRules(
        { toolName: "Bash", input: { command: "wget url" } },
        [rule],
      ),
    ).toHaveLength(1);
    // 长 token "curl" 命中
    expect(
      matchRules(
        { toolName: "Bash", input: { command: "curl url" } },
        [rule],
      ),
    ).toHaveLength(1);
  });

  it("if no token survives min-length filter, fallback to whole pattern", () => {
    // wrong_pattern 全是短 token → 不切分，整体匹配
    const rule = makeRule({ wrong_pattern: "a|b|c" });
    expect(
      matchRules({ toolName: "Bash", input: { command: "a|b|c here" } }, [rule]),
    ).toHaveLength(1);
    expect(
      matchRules({ toolName: "Bash", input: { command: "just a here" } }, [rule]),
    ).toEqual([]);
  });

  it("'/' is NOT a separator (it appears in unix paths and breaks rules)", () => {
    // wrong_pattern 含 / 应被当成单个字面 token，而不是切成 'a','b','c'
    const rule = makeRule({
      wrong_pattern: 'import ... from "@teamagent/ports/src/__tests__/foo.js"',
    });
    // 不包含完整 wrong_pattern → 不命中
    expect(
      matchRules(
        {
          toolName: "Write",
          input: { file_path: "src/whatever.ts", content: "export const x = 1" },
        },
        [rule],
      ),
    ).toEqual([]);
    // 完整出现 → 命中
    expect(
      matchRules(
        {
          toolName: "Write",
          input: { file_path: "x.ts", content: 'import ... from "@teamagent/ports/src/__tests__/foo.js"' },
        },
        [rule],
      ),
    ).toHaveLength(1);
  });
});

describe("matchRules — scope filtering", () => {
  it("scope.file_types filters by extension", () => {
    const cssRule = makeRule({
      wrong_pattern: ".module.css",
      scope: { level: "team", file_types: ["*.css"] },
    });

    // matches .css file
    expect(
      matchRules(
        {
          toolName: "Write",
          input: { file_path: "src/x.module.css", content: "" },
        },
        [cssRule],
      ),
    ).toHaveLength(1);

    // does not match .ts even if pattern is in content
    expect(
      matchRules(
        {
          toolName: "Write",
          input: { file_path: "src/x.ts", content: "import './x.module.css'" },
        },
        [cssRule],
      ),
    ).toEqual([]);
  });

  it("scope restrictions don't block ops with no file_path (e.g. Bash)", () => {
    // Regression: a rule scoped to *.ts used to block ALL Bash commands
    // because checkScope returned false when filePath was absent.
    // Correct semantics: scope restricts which FILES the rule covers;
    // non-file operations (Bash, WebFetch, etc.) should still match.
    const tsRule = makeRule({
      wrong_pattern: "deprecated-lib",
      scope: { level: "team", file_types: ["*.ts"] },
    });
    expect(
      matchRules(
        {
          toolName: "Bash",
          input: { command: "npm install deprecated-lib" },
        },
        [tsRule],
      ),
    ).toHaveLength(1);
  });

  it("scope.file_types blocks matches on excluded file types", () => {
    // A rule scoped to *.ts should NOT match Write on a .md file
    // even if the content contains the trigger keyword (the self-reference bug).
    const tsRule = makeRule({
      wrong_pattern: "deprecated-lib",
      scope: { level: "team", file_types: ["*.ts", "*.tsx"] },
    });
    expect(
      matchRules(
        {
          toolName: "Write",
          input: {
            file_path: "docs/evaluation.md",
            content: "we replaced deprecated-lib with a new approach",
          },
        },
        [tsRule],
      ),
    ).toEqual([]);
  });

  it("scope.paths filters by path glob (prefix match Phase 1 simple)", () => {
    const rule = makeRule({
      wrong_pattern: "import",
      scope: { level: "team", paths: ["packages/core/**"] },
    });
    expect(
      matchRules(
        {
          toolName: "Write",
          input: { file_path: "packages/core/src/x.ts", content: "import x" },
        },
        [rule],
      ),
    ).toHaveLength(1);
    expect(
      matchRules(
        {
          toolName: "Write",
          input: { file_path: "packages/cli/src/x.ts", content: "import x" },
        },
        [rule],
      ),
    ).toEqual([]);
  });
});

describe("matchRules — multiple rules", () => {
  it("returns all matching rules", () => {
    const r1 = makeRule({ id: "a", wrong_pattern: "moment" });
    const r2 = makeRule({ id: "b", wrong_pattern: "install" });
    const matches = matchRules(
      { toolName: "Bash", input: { command: "npm install moment" } },
      [r1, r2],
    );
    expect(matches.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("matches sorted by enforcement strength (block > warn > suggest)", () => {
    const block = makeRule({
      id: "block",
      wrong_pattern: "x",
      enforcement: "block",
    });
    const warn = makeRule({ id: "warn", wrong_pattern: "x", enforcement: "warn" });
    const suggest = makeRule({
      id: "suggest",
      wrong_pattern: "x",
      enforcement: "suggest",
    });
    const matches = matchRules(
      { toolName: "Bash", input: { command: "x" } },
      [warn, suggest, block],
    );
    expect(matches.map((r) => r.id)).toEqual(["block", "warn", "suggest"]);
  });
});

describe("matchRules — performance", () => {
  it("100 rules: matching takes < 5ms", () => {
    const rules = Array.from({ length: 100 }, (_, i) =>
      makeRule({ id: `r${i}`, wrong_pattern: `pattern${i}` }),
    );
    const ctx = { toolName: "Bash", input: { command: "pattern50 in command" } };

    const start = performance.now();
    matchRules(ctx, rules);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(5);
  });
});

describe("matchRules — channel gate (M4-A)", () => {
  it("tool-action channel participates in matching", () => {
    const rules = [
      makeRule({ id: "t1", wrong_pattern: "moment", channel: "tool-action" }),
    ];
    const result = matchRules(
      { toolName: "Bash", input: { command: "npm install moment" } },
      rules,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("t1");
  });

  it("plain tokens match on boundaries, not inside larger words", () => {
    const rules = [
      makeRule({ id: "moment-rule", wrong_pattern: "moment", channel: "tool-action" }),
    ];

    expect(
      matchRules(
        { toolName: "Bash", input: { command: "echo momentum is useful" } },
        rules,
      ),
    ).toHaveLength(0);

    expect(
      matchRules(
        { toolName: "Bash", input: { command: "npm install moment" } },
        rules,
      ),
    ).toHaveLength(1);
  });

  it("ai-narrative channel excluded from PreToolUse matcher", () => {
    const rules = [
      makeRule({ id: "n1", wrong_pattern: "narrative-phrase", channel: "ai-narrative" }),
    ];
    const result = matchRules(
      { toolName: "Bash", input: { command: "echo narrative-phrase here" } },
      rules,
    );
    expect(result).toHaveLength(0);
  });

  it("user-input channel excluded from PreToolUse matcher", () => {
    const rules = [
      makeRule({ id: "u1", wrong_pattern: "input-tag", channel: "user-input" }),
    ];
    const result = matchRules(
      { toolName: "Bash", input: { command: "echo input-tag here" } },
      rules,
    );
    expect(result).toHaveLength(0);
  });

  it("passive-knowledge channel excluded from PreToolUse matcher", () => {
    const rules = [
      makeRule({ id: "p1", wrong_pattern: "moment", channel: "passive-knowledge" }),
    ];
    const result = matchRules(
      { toolName: "Bash", input: { command: "npm install moment" } },
      rules,
    );
    expect(result).toHaveLength(0);
  });

  it("legacy rule without channel field defaults to tool-action (backward compat)", () => {
    const rule = makeRule({ id: "legacy", wrong_pattern: "moment" });
    delete (rule as any).channel;
    const result = matchRules(
      { toolName: "Bash", input: { command: "npm install moment" } },
      [rule],
    );
    expect(result).toHaveLength(1);
  });

  it("mixed rule set: only tool-action survives", () => {
    const rules = [
      makeRule({ id: "t", wrong_pattern: "axios", channel: "tool-action" }),
      makeRule({ id: "n", wrong_pattern: "axios", channel: "ai-narrative" }),
      makeRule({ id: "u", wrong_pattern: "axios", channel: "user-input" }),
      makeRule({ id: "p", wrong_pattern: "axios", channel: "passive-knowledge" }),
    ];
    const result = matchRules(
      { toolName: "Bash", input: { command: "npm install axios" } },
      rules,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("t");
  });
});

describe("matchRules — B-055 wrong_pattern plural extension over-fire", () => {
  it("'product feature' does NOT fire on 'list all product features'", () => {
    const rule = makeRule({
      id: "pf-avoidance",
      wrong_pattern: "product feature",
      channel: "tool-action",
    });
    const result = matchRules(
      { toolName: "Write", input: { content: "list all product features including unverified" } },
      [rule],
    );
    expect(result).toHaveLength(0);
  });

  it("'product feature' still fires on exact phrase without extension", () => {
    const rule = makeRule({
      id: "pf-avoidance",
      wrong_pattern: "product feature",
      channel: "tool-action",
    });
    const result = matchRules(
      { toolName: "Write", input: { content: "this product feature is wrong" } },
      [rule],
    );
    expect(result).toHaveLength(1);
  });

  it("'product feature' fires when followed by punctuation", () => {
    const rule = makeRule({
      id: "pf-avoidance",
      wrong_pattern: "product feature",
      channel: "tool-action",
    });
    const result = matchRules(
      { toolName: "Write", input: { content: "the product feature. is incomplete" } },
      [rule],
    );
    expect(result).toHaveLength(1);
  });
});

describe("matchRules — B-047 glob scope bypass", () => {
  it("scope.paths 'src/**/*.ts' does NOT match /evil/src/foo.ts (unanchored bypass fixed)", () => {
    const rule = makeRule({
      wrong_pattern: "moment",
      scope: { level: "personal", paths: ["src/**/*.ts"] },
    });
    const ctx = {
      toolName: "Write",
      input: { file_path: "/home/user/evil/src/foo.ts", content: "import moment from 'moment'" },
    };
    expect(matchRules(ctx, [rule])).toHaveLength(0);
  });

  it("scope.paths 'src/**/*.ts' still matches src/components/Foo.ts (relative path)", () => {
    const rule = makeRule({
      wrong_pattern: "moment",
      scope: { level: "personal", paths: ["src/**/*.ts"] },
    });
    const ctx = {
      toolName: "Write",
      input: { file_path: "src/components/Foo.ts", content: "import moment from 'moment'" },
    };
    expect(matchRules(ctx, [rule])).toHaveLength(1);
  });
});

describe("matchRules — B-050 invalid enforcement sort", () => {
  it("invalid enforcement value does not crash matchRules", () => {
    const rule = makeRule({
      wrong_pattern: "moment",
      enforcement: "BLOCK" as any,   // simulates DB corruption
    });
    const ctx = { toolName: "Bash", input: { command: "npm install moment" } };
    expect(() => matchRules(ctx, [rule])).not.toThrow();
    expect(matchRules(ctx, [rule])).toHaveLength(1);
  });
});
