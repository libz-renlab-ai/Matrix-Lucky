import { describe, it, expect } from "vitest";
import { computeBootstrapDiff } from "../bootstrap-diff.js";
import type { Manifest, LocalState } from "@teamagent/types";

const m: Manifest = {
  schema_version: 1,
  teamagent_version: "0.9.4",
  required_plugins: ["playground", "code-review"],
  required_project_skills: [".claude/skills/canary"],
  required_hooks: ["UserPromptSubmit", "Stop"],
  created_by: "alice",
  created_at: "2026-05-06T10:00:00Z",
};

const fullySatisfied: LocalState = {
  teamagent_version: "0.9.4",
  installed_plugins: ["playground", "code-review"],
  installed_project_skills: [".claude/skills/canary"],
  installed_hooks: ["UserPromptSubmit", "Stop"],
};

describe("computeBootstrapDiff", () => {
  it("fully satisfied: needs_bootstrap=false", () => {
    const d = computeBootstrapDiff(m, fullySatisfied);
    expect(d.needs_bootstrap).toBe(false);
    expect(d.install_teamagent_version).toBeNull();
    expect(d.install_plugins).toEqual([]);
    expect(d.install_hooks).toEqual([]);
  });

  it("missing teamagent: install_teamagent_version set", () => {
    const d = computeBootstrapDiff(m, {
      ...fullySatisfied,
      teamagent_version: null,
    });
    expect(d.needs_bootstrap).toBe(true);
    expect(d.install_teamagent_version).toBe("0.9.4");
  });

  it("older teamagent version: needs upgrade", () => {
    const d = computeBootstrapDiff(m, {
      ...fullySatisfied,
      teamagent_version: "0.9.0",
    });
    expect(d.needs_bootstrap).toBe(true);
    expect(d.install_teamagent_version).toBe("0.9.4");
  });

  it("newer teamagent version: no install (forward compatible)", () => {
    const d = computeBootstrapDiff(m, {
      ...fullySatisfied,
      teamagent_version: "0.9.5",
    });
    expect(d.install_teamagent_version).toBeNull();
  });

  it("missing plugins/skills/hooks: each listed", () => {
    const d = computeBootstrapDiff(m, {
      teamagent_version: "0.9.4",
      installed_plugins: ["playground"],
      installed_project_skills: [],
      installed_hooks: ["UserPromptSubmit"],
    });
    expect(d.needs_bootstrap).toBe(true);
    expect(d.install_plugins).toEqual(["code-review"]);
    expect(d.install_project_skills).toEqual([".claude/skills/canary"]);
    expect(d.install_hooks).toEqual(["Stop"]);
  });

  it("empty manifest version means no version constraint", () => {
    const m2 = { ...m, teamagent_version: "" };
    const d = computeBootstrapDiff(m2, {
      ...fullySatisfied,
      teamagent_version: "0.0.1",
    });
    expect(d.install_teamagent_version).toBeNull();
  });
});
