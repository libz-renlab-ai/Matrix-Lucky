import { describe, it, expect } from "vitest";
import { validateLevel0 } from "../l0.js";
import type { ValidateL0Input } from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";

const baseAvoidance: Partial<KnowledgeEntry> = {
  id: "r1",
  scope: { level: "team", paths: ["src/**"], file_types: ["ts"] },
  type: "avoidance",
  trigger: "use-fetch-not-axios",
  wrong_pattern: "axios",
  correct_pattern: "fetch",
};

const baseInput = (
  overrides: Partial<ValidateL0Input> = {},
): ValidateL0Input => ({
  entry: baseAvoidance,
  sourceText: "import axios from 'axios';",
  existingRules: [],
  projectStack: ["ts", "tsx"],
  ...overrides,
});

describe("validateLevel0 — all green", () => {
  it("ok=true with all 5 checks passing", () => {
    const r = validateLevel0(baseInput());
    expect(r.ok).toBe(true);
    expect(r.failed_checks).toEqual([]);
    expect(r.notes).toBeUndefined();
  });
});

describe("validateLevel0 — check 1: wrong_pattern in source", () => {
  it("fails when wrong_pattern not in sourceText", () => {
    const r = validateLevel0(baseInput({ sourceText: "console.log('hi');" }));
    expect(r.failed_checks).toContain("wrong_pattern_not_in_source");
  });

  it("passes when any of | separated patterns matches", () => {
    const r = validateLevel0(
      baseInput({
        entry: { ...baseAvoidance, wrong_pattern: "axios|fetch-polyfill" },
        sourceText: "import axios from 'axios';",
      }),
    );
    expect(r.failed_checks).not.toContain("wrong_pattern_not_in_source");
  });

  it("skips for type=practice (no wrong_pattern required)", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          type: "practice",
          wrong_pattern: undefined,
        },
        sourceText: "unrelated source",
      }),
    );
    expect(r.failed_checks).not.toContain("wrong_pattern_not_in_source");
  });

  it("B-049: single 1-char wrong_pattern fails check-1 (too short)", () => {
    const r = validateLevel0(
      baseInput({
        entry: { ...baseAvoidance, wrong_pattern: "a", scope: { level: "team", paths: ["src/"] } },
        sourceText: "arbitrary text containing the letter a",
      }),
    );
    expect(r.failed_checks).toContain("wrong_pattern_not_in_source");
  });

  it("B-049: pipe-separated all-short tokens 'a|b' fails check-1", () => {
    const r = validateLevel0(
      baseInput({
        entry: { ...baseAvoidance, wrong_pattern: "a|b", scope: { level: "team", paths: ["src/"] } },
        sourceText: "import a from 'b'",
      }),
    );
    expect(r.failed_checks).toContain("wrong_pattern_not_in_source");
  });

  it("B-049: mixed 'a|axios' passes — long token 'axios' is in sourceText", () => {
    const r = validateLevel0(
      baseInput({
        entry: { ...baseAvoidance, wrong_pattern: "a|axios", scope: { level: "team", paths: ["src/"] } },
        sourceText: "import axios from 'axios'",
      }),
    );
    expect(r.failed_checks).not.toContain("wrong_pattern_not_in_source");
  });
});

describe("validateLevel0 — check 2: import_path format", () => {
  it("fails on malformed import_path", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          correct_pattern_import_path: "has spaces! and $pecial",
        } as Partial<KnowledgeEntry>,
      }),
    );
    expect(r.failed_checks).toContain("invalid_import_path_format");
  });

  it("passes on normal import_path", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          correct_pattern_import_path: "@teamagent/core",
        } as Partial<KnowledgeEntry>,
      }),
    );
    expect(r.failed_checks).not.toContain("invalid_import_path_format");
  });
});

describe("validateLevel0 — check 3: file_types vs stack", () => {
  it("fails when no overlap between file_types and projectStack", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          scope: { level: "team", paths: ["src/**"], file_types: ["py"] },
        },
      }),
    );
    expect(r.failed_checks).toContain("file_types_stack_mismatch");
  });

  it("passes when intersection non-empty (normalizes '*.ts' → 'ts')", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          scope: { level: "team", paths: ["src/**"], file_types: ["*.ts"] },
        },
      }),
    );
    expect(r.failed_checks).not.toContain("file_types_stack_mismatch");
  });

  it("skips when file_types empty/undefined", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          scope: { level: "team", paths: ["src/**"] },
        },
      }),
    );
    expect(r.failed_checks).not.toContain("file_types_stack_mismatch");
  });

  it("skips when projectStack empty (unknown stack)", () => {
    const r = validateLevel0(baseInput({ projectStack: [] }));
    expect(r.failed_checks).not.toContain("file_types_stack_mismatch");
  });
});

describe("validateLevel0 — check 4: trigger collision", () => {
  it("fails when existing rule shares trigger", () => {
    const r = validateLevel0(
      baseInput({
        existingRules: [
          { id: "r-old", trigger: "use-fetch-not-axios", wrong_pattern: "axios" },
        ],
      }),
    );
    expect(r.failed_checks).toContain("trigger_collision");
  });

  it("does not collide with self (same id)", () => {
    const r = validateLevel0(
      baseInput({
        existingRules: [
          { id: "r1", trigger: "use-fetch-not-axios", wrong_pattern: "axios" },
        ],
      }),
    );
    expect(r.failed_checks).not.toContain("trigger_collision");
  });

  it("passes when trigger differs", () => {
    const r = validateLevel0(
      baseInput({
        existingRules: [
          { id: "r-old", trigger: "other-trigger", wrong_pattern: "x" },
        ],
      }),
    );
    expect(r.failed_checks).not.toContain("trigger_collision");
  });
});

describe("validateLevel0 — check 5: scope.paths", () => {
  it("fails avoidance with empty scope.paths", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          scope: { level: "team", paths: [], file_types: ["ts"] },
        },
      }),
    );
    expect(r.failed_checks).toContain("scope_paths_empty");
  });

  it("fails avoidance with undefined scope.paths", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          scope: { level: "team", file_types: ["ts"] },
        },
      }),
    );
    expect(r.failed_checks).toContain("scope_paths_empty");
  });

  it("fails on malformed path (empty string)", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          scope: { level: "team", paths: [""], file_types: ["ts"] },
        },
      }),
    );
    expect(r.failed_checks).toContain("scope_paths_malformed");
  });

  it("skips requirement for type=practice", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          type: "practice",
          wrong_pattern: undefined,
          scope: { level: "team" },
        },
      }),
    );
    expect(r.failed_checks).not.toContain("scope_paths_empty");
  });
});

describe("validateLevel0 — check 6: type/wrong_pattern alignment (M3)", () => {
  it("fails when type=practice has non-empty wrong_pattern", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          type: "practice",
          wrong_pattern: "等通知",
        },
      }),
    );
    expect(r.failed_checks).toContain("practice_must_not_have_wrong_pattern");
  });

  it("fails when type=avoidance has empty wrong_pattern", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          type: "avoidance",
          wrong_pattern: "",
        },
      }),
    );
    expect(r.failed_checks).toContain("avoidance_must_have_wrong_pattern");
  });

  it("passes when avoidance + wrong_pattern non-empty", () => {
    const r = validateLevel0(baseInput());
    expect(r.failed_checks).not.toContain("practice_must_not_have_wrong_pattern");
    expect(r.failed_checks).not.toContain("avoidance_must_have_wrong_pattern");
  });

  it("passes when practice + wrong_pattern empty", () => {
    const r = validateLevel0(
      baseInput({
        entry: {
          ...baseAvoidance,
          type: "practice",
          wrong_pattern: "",
          scope: { level: "team" },
        },
      }),
    );
    expect(r.failed_checks).not.toContain("practice_must_not_have_wrong_pattern");
    expect(r.failed_checks).not.toContain("avoidance_must_have_wrong_pattern");
  });
});

describe("validateLevel0 — combined & purity", () => {
  it("accumulates multiple failures", () => {
    const r = validateLevel0(
      baseInput({
        sourceText: "no match",
        entry: {
          ...baseAvoidance,
          scope: { level: "team", paths: [], file_types: ["ts"] },
        },
        existingRules: [
          { id: "r-old", trigger: "use-fetch-not-axios", wrong_pattern: "x" },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.failed_checks).toEqual(
      expect.arrayContaining([
        "wrong_pattern_not_in_source",
        "scope_paths_empty",
        "trigger_collision",
      ]),
    );
    expect(r.notes).toContain("L0 failed");
  });

  it("is a pure function: same input → same output", () => {
    const input = baseInput();
    const a = validateLevel0(input);
    const b = validateLevel0(input);
    expect(a).toEqual(b);
  });
});
