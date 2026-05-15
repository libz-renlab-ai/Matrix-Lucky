import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeStats, renderExplain } from "../commands/stats.js";
import { DualLayerStore } from "@teamagent/adapters";
import type { KnowledgeEntry } from "@teamagent/types";

function mkTmp() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "stats-explain-cwd-"));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "stats-explain-home-"));
  return {
    cwd,
    home,
    cleanup: () => {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "test-rule",
    scope: { level: "personal" },
    category: "C",
    tags: ["tag1"],
    type: "avoidance",
    nature: "objective",
    trigger: "use fetch",
    wrong_pattern: "axios",
    correct_pattern: "fetch",
    reasoning: "native fetch preferred",
    confidence: 0.85,
    enforcement: "warn",
    status: "active",
    hit_count: 3,
    success_count: 2,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-16T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "accumulated",
    conflict_with: [],
    current_tier: "probation" as const,
    max_tier_ever: "enforced" as const,
    tier_entered_at: "2026-04-10T00:00:00Z",
    demerit: 0.25,
    demerit_last_updated: "2026-04-15T12:00:00Z",
    resurrect_count: 0,
    ...overrides,
  };
}

describe("renderExplain (pure)", () => {
  it("prints tier/confidence/demerit for a known entry", () => {
    const entry = makeEntry();
    const out = renderExplain(entry, "test-rule");
    expect(out).toContain("rule test-rule");
    expect(out).toContain("tier: probation (max ever: enforced)");
    expect(out).toContain("confidence: 0.850");
    expect(out).toContain("demerit: 0.25");
    expect(out).toContain("updated 2026-04-15T12:00:00Z");
  });

  it("shows 'never' when demerit_last_updated is empty", () => {
    const entry = makeEntry({ demerit_last_updated: "" });
    const out = renderExplain(entry, "test-rule");
    expect(out).toContain("updated never");
  });

  it("prints 'not found' for unknown rule", () => {
    const out = renderExplain(undefined, "nonexistent-rule");
    expect(out).toContain("rule nonexistent-rule not found");
  });
});

describe("stats --explain (IO)", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  function seedEntry(entry: KnowledgeEntry) {
    const projectDbPath = path.join(tmp.cwd, ".teamagent", "knowledge.db");
    fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
    const userGlobalDbPath = path.join(tmp.home, ".teamagent", "global.db");
    fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
    const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    store.add(entry);
    store.close();
  }

  it("prints tier/confidence/demerit for a known rule", () => {
    const entry = makeEntry({ id: "my-rule" });
    seedEntry(entry);

    const out = executeStats({ cwd: tmp.cwd, homeDir: tmp.home, explain: "my-rule" });
    expect(out).toContain("rule my-rule");
    expect(out).toContain("tier:");
    expect(out).toContain("confidence:");
    expect(out).toContain("demerit:");
  });

  it("prints 'not found' for unknown rule", () => {
    const out = executeStats({ cwd: tmp.cwd, homeDir: tmp.home, explain: "no-such-rule" });
    expect(out).toContain("rule no-such-rule not found");
  });

  it("prints 'not found' when no store exists", () => {
    const out = executeStats({ cwd: tmp.cwd, homeDir: tmp.home, explain: "ghost-rule" });
    expect(out).toContain("rule ghost-rule not found");
  });

  it("shows correct tier values from entry", () => {
    const entry = makeEntry({
      id: "tier-check",
      current_tier: "experimental" as const,
      max_tier_ever: "probation" as const,
      confidence: 0.72,
      demerit: 0.1,
      demerit_last_updated: "2026-04-14T00:00:00Z",
    });
    seedEntry(entry);

    const out = executeStats({ cwd: tmp.cwd, homeDir: tmp.home, explain: "tier-check" });
    expect(out).toContain("tier: experimental (max ever: probation)");
    expect(out).toContain("confidence: 0.720");
    expect(out).toContain("demerit: 0.10");
    expect(out).toContain("updated 2026-04-14T00:00:00Z");
  });
});
