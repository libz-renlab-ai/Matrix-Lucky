import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runStopNarrativeScan, readLastInjected, pendingFilePath, lastInjectedFilePath } from "../stop-narrative-scan.js";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

function makeRule(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "n1",
    scope: { level: "personal" },
    category: "K",
    tags: [],
    type: "avoidance",
    nature: "subjective",
    trigger: "",
    wrong_pattern: "claims-victory-phrase",
    correct_pattern: "cite evidence",
    reasoning: "",
    confidence: 0.9,
    enforcement: "warn",
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
    channel: "ai-narrative",
    ...overrides,
  };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "m4a-stop-"));
}

describe("runStopNarrativeScan", () => {
  it("no hits, no injected → no-op", () => {
    const dir = tmpDir();
    const events: PersistedEvent[] = [];
    const hits = runStopNarrativeScan({
      aiText: "some unrelated text",
      rules: [makeRule()],
      sessionId: "s1",
      turnIndex: 1,
      now: "2026-04-23T00:00:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
    });
    expect(hits).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(fs.existsSync(pendingFilePath(dir, "s1"))).toBe(false);
  });

  it("hit writes pending + emits bad_pattern", () => {
    const dir = tmpDir();
    const events: PersistedEvent[] = [];
    const hits = runStopNarrativeScan({
      aiText: "I already claims-victory-phrase on this task.",
      rules: [makeRule({ id: "n1", wrong_pattern: "claims-victory-phrase" })],
      sessionId: "s1",
      turnIndex: 3,
      now: "2026-04-23T10:00:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
    });
    expect(hits).toHaveLength(1);
    expect(events.find((e) => e.kind === "ai.output.bad_pattern")).toBeTruthy();
    const file = pendingFilePath(dir, "s1");
    expect(fs.existsSync(file)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].knowledge_id).toBe("n1");
  });

  it("two consecutive turns: hits from each accumulate in pending", () => {
    const dir = tmpDir();
    const events: PersistedEvent[] = [];
    const rule = makeRule({ id: "n1", wrong_pattern: "claims-victory-phrase" });
    runStopNarrativeScan({
      aiText: "claims-victory-phrase here",
      rules: [rule],
      sessionId: "s1",
      turnIndex: 1,
      now: "2026-04-23T10:00:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
    });
    runStopNarrativeScan({
      aiText: "claims-victory-phrase again",
      rules: [rule],
      sessionId: "s1",
      turnIndex: 2,
      now: "2026-04-23T10:05:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
    });
    const parsed = JSON.parse(fs.readFileSync(pendingFilePath(dir, "s1"), "utf8"));
    expect(parsed).toHaveLength(2);
  });

  it("lastInjected rule recurred → emits recurred event", () => {
    const dir = tmpDir();
    const events: PersistedEvent[] = [];
    runStopNarrativeScan({
      aiText: "claims-victory-phrase",
      rules: [makeRule({ id: "n1", wrong_pattern: "claims-victory-phrase" })],
      sessionId: "s1",
      turnIndex: 2,
      now: "2026-04-23T10:10:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
      lastInjectedKnowledgeIds: ["n1"],
    });
    expect(events.find((e) => e.kind === "ai.narrative.recurred" && e.knowledge_id === "n1")).toBeTruthy();
  });

  it("lastInjected rule not re-hit → emits complied event", () => {
    const dir = tmpDir();
    const events: PersistedEvent[] = [];
    runStopNarrativeScan({
      aiText: "a completely different reply with evidence",
      rules: [makeRule({ id: "n1", wrong_pattern: "claims-victory-phrase" })],
      sessionId: "s1",
      turnIndex: 2,
      now: "2026-04-23T10:10:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
      lastInjectedKnowledgeIds: ["n1"],
    });
    expect(events.find((e) => e.kind === "ai.narrative.complied" && e.knowledge_id === "n1")).toBeTruthy();
    expect(events.find((e) => e.kind === "ai.narrative.recurred")).toBeFalsy();
  });

  it("complied but correct_pattern absent → emits validator.failure", () => {
    const dir = tmpDir();
    const events: PersistedEvent[] = [];
    runStopNarrativeScan({
      aiText: "I will look into this",
      rules: [makeRule({ id: "n1", wrong_pattern: "claims-victory-phrase", correct_pattern: "cite evidence" })],
      sessionId: "s1",
      turnIndex: 3,
      now: "2026-04-23T10:15:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
      lastInjectedKnowledgeIds: ["n1"],
    });
    expect(events.find((e) => e.kind === "ai.narrative.complied" && e.knowledge_id === "n1")).toBeTruthy();
    expect(events.find((e) => e.kind === "validator.failure" && e.knowledge_id === "n1")).toBeTruthy();
  });

  it("complied and correct_pattern present → no validator.failure", () => {
    const dir = tmpDir();
    const events: PersistedEvent[] = [];
    runStopNarrativeScan({
      aiText: "Here is my cite evidence for the claim",
      rules: [makeRule({ id: "n1", wrong_pattern: "claims-victory-phrase", correct_pattern: "cite evidence" })],
      sessionId: "s1",
      turnIndex: 3,
      now: "2026-04-23T10:15:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
      lastInjectedKnowledgeIds: ["n1"],
    });
    expect(events.find((e) => e.kind === "ai.narrative.complied" && e.knowledge_id === "n1")).toBeTruthy();
    expect(events.find((e) => e.kind === "validator.failure")).toBeFalsy();
  });

  it("rule has no correct_pattern → no validator.failure on complied", () => {
    const dir = tmpDir();
    const events: PersistedEvent[] = [];
    runStopNarrativeScan({
      aiText: "I will look into this",
      rules: [makeRule({ id: "n1", wrong_pattern: "claims-victory-phrase", correct_pattern: "" })],
      sessionId: "s1",
      turnIndex: 3,
      now: "2026-04-23T10:15:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
      lastInjectedKnowledgeIds: ["n1"],
    });
    expect(events.find((e) => e.kind === "ai.narrative.complied" && e.knowledge_id === "n1")).toBeTruthy();
    expect(events.find((e) => e.kind === "validator.failure")).toBeFalsy();
  });
});

describe("readLastInjected", () => {
  it("returns empty when file missing", () => {
    const dir = tmpDir();
    expect(readLastInjected(dir, "s1")).toEqual([]);
  });

  it("reads array of knowledge_ids", () => {
    const dir = tmpDir();
    fs.writeFileSync(lastInjectedFilePath(dir, "s1"), JSON.stringify(["a", "b", "c"]));
    expect(readLastInjected(dir, "s1")).toEqual(["a", "b", "c"]);
  });

  it("malformed JSON returns empty", () => {
    const dir = tmpDir();
    fs.writeFileSync(lastInjectedFilePath(dir, "s1"), "not-json");
    expect(readLastInjected(dir, "s1")).toEqual([]);
  });

  it("non-array returns empty", () => {
    const dir = tmpDir();
    fs.writeFileSync(lastInjectedFilePath(dir, "s1"), JSON.stringify({ x: 1 }));
    expect(readLastInjected(dir, "s1")).toEqual([]);
  });
});
