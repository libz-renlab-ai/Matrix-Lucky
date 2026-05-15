import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildInjectionFromPending,
  persistLastInjected,
  scanUserInput,
  formatUserInputFlag,
} from "../user-prompt-inject.js";
import type { KnowledgeEntry, RuleChannel } from "@teamagent/types";

function mkPending(overrides: any = {}) {
  return {
    session_id: "s1",
    turn_index: 1,
    knowledge_id: "n1",
    matched_snippet: "foo-snippet",
    rule_summary: "rule summary",
    confidence: 0.9,
    correct_pattern: "use X",
    reasoning: "history",
    at: "2026-04-23T10:00:00Z",
    ...overrides,
  };
}

function mkRule(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "u1",
    scope: { level: "personal" },
    category: "K",
    tags: [],
    type: "avoidance",
    nature: "subjective",
    trigger: "",
    wrong_pattern: "noise-marker",
    correct_pattern: "ignore",
    reasoning: "",
    confidence: 0.9,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-23T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "user-input",
    ...overrides,
  };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "m4a-upi-"));
}

describe("buildInjectionFromPending", () => {
  it("returns empty when no pending file", () => {
    const dir = tmpDir();
    const r = buildInjectionFromPending({ sessionsDir: dir, sessionId: "missing" });
    expect(r.text).toBe("");
    expect(r.injectedIds).toEqual([]);
  });

  it("reads pending, formats injection, clears file, returns ids", () => {
    const dir = tmpDir();
    const file = path.join(dir, "s1_pending_warnings.json");
    fs.writeFileSync(file, JSON.stringify([mkPending()]));
    const r = buildInjectionFromPending({ sessionsDir: dir, sessionId: "s1" });
    expect(r.text).toContain("TeamAgent");
    expect(r.injectedIds).toEqual(["n1"]);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual([]);
  });

  it("caps injection at 3 by confidence desc", () => {
    const dir = tmpDir();
    const file = path.join(dir, "s1_pending_warnings.json");
    const many = Array.from({ length: 5 }, (_, i) =>
      mkPending({ knowledge_id: `n${i}`, confidence: 0.5 + i * 0.1 }),
    );
    fs.writeFileSync(file, JSON.stringify(many));
    const r = buildInjectionFromPending({ sessionsDir: dir, sessionId: "s1" });
    expect(r.injectedIds).toHaveLength(3);
    expect(r.injectedIds).toContain("n4");
    expect(r.injectedIds).toContain("n3");
    expect(r.injectedIds).toContain("n2");
  });

  it("respects custom max", () => {
    const dir = tmpDir();
    const file = path.join(dir, "s1_pending_warnings.json");
    fs.writeFileSync(
      file,
      JSON.stringify([mkPending({ knowledge_id: "a" }), mkPending({ knowledge_id: "b" })]),
    );
    const r = buildInjectionFromPending({
      sessionsDir: dir,
      sessionId: "s1",
      maxWarnings: 1,
    });
    expect(r.injectedIds).toHaveLength(1);
  });

  it("malformed pending json returns empty gracefully", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "s1_pending_warnings.json"), "not-json");
    const r = buildInjectionFromPending({ sessionsDir: dir, sessionId: "s1" });
    expect(r.injectedIds).toEqual([]);
  });
});

describe("persistLastInjected", () => {
  it("no-op on empty array", () => {
    const dir = tmpDir();
    persistLastInjected(dir, "s1", []);
    expect(fs.existsSync(path.join(dir, "s1_last_injected.json"))).toBe(false);
  });

  it("writes ids array", () => {
    const dir = tmpDir();
    persistLastInjected(dir, "s1", ["a", "b"]);
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, "s1_last_injected.json"), "utf8"));
    expect(parsed).toEqual(["a", "b"]);
  });
});

describe("scanUserInput", () => {
  it("matches user-input channel rule against prompt", () => {
    const hits = scanUserInput("some prompt with noise-marker in it", [mkRule()]);
    expect(hits).toHaveLength(1);
  });

  it("skips rule with different channel", () => {
    const hits = scanUserInput("noise-marker", [
      mkRule({ channel: "tool-action" as RuleChannel }),
    ]);
    expect(hits).toHaveLength(0);
  });

  it("archived rule skipped", () => {
    const hits = scanUserInput("noise-marker", [mkRule({ status: "archived" })]);
    expect(hits).toHaveLength(0);
  });
});

describe("formatUserInputFlag", () => {
  it("empty input → empty output", () => {
    expect(formatUserInputFlag([])).toBe("");
  });

  it("non-empty → formatted flag", () => {
    const text = formatUserInputFlag([
      {
        knowledge_id: "u1",
        matched_snippet: "<noise>",
        rule_summary: "",
        confidence: 0.9,
        correct_pattern: "",
        reasoning: "",
      },
    ]);
    expect(text).toContain("TeamAgent");
    expect(text).toContain("u1");
    expect(text).toContain("<noise>");
  });
});
