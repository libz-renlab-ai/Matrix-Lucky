/**
 * M4-A end-to-end scenario tests.
 *
 * Scenario A — narrative loop closure:
 *   1. Plant an ai-narrative rule
 *   2. Stop scanner finds AI output matching → writes pending, emits bad_pattern
 *   3. UserPromptSubmit consumes pending → injects into AI context, emits injected
 *   4a. Next turn: AI repeats same phrase → Stop emits recurred (education failed)
 *   4b. Next turn: AI changes behavior → Stop emits complied (education succeeded)
 *   5. Calibrator reads events → complied triggers synthetic success observation,
 *      recurred accumulates as demerit
 *
 * Scenario B — tool-action regression:
 *   A channel=tool-action block rule on "--dangerously-skip-permissions"
 *   must still deny a Bash call containing that argument (M3 behavior preserved).
 */
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runStopNarrativeScan, readLastInjected, lastInjectedFilePath, pendingFilePath } from "../stop-narrative-scan.js";
import { buildInjectionFromPending, persistLastInjected, scanUserInput } from "../user-prompt-inject.js";
import { matchRules } from "@teamagent/core";
import { runCalibrationPipelineV2 } from "@teamagent/core";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

function narrativeRule(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "scen-A-rule",
    scope: { level: "personal" },
    category: "K",
    tags: [],
    type: "avoidance",
    nature: "subjective",
    trigger: "",
    wrong_pattern: "task-is-complete-claim",
    correct_pattern: "cite verification output",
    reasoning: "prior incidents of false-done claims",
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

function toolActionRule(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    ...narrativeRule({
      id: "scen-B-rule",
      wrong_pattern: "--dangerously-skip-permissions",
      enforcement: "block",
      confidence: 0.95,
      channel: "tool-action",
    }),
    ...overrides,
  };
}

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `m4a-e2e-${prefix}-`));
}

describe("M4-A scenario A: narrative loop (education succeeds)", () => {
  it("AI says phrase turn 1 → pending written; turn 2 AI is silent → complied event", () => {
    const dir = tmpDir("complied");
    const rule = narrativeRule();
    const events: PersistedEvent[] = [];

    // Turn 1: AI says the narrative phrase
    runStopNarrativeScan({
      aiText: "I believe the task-is-complete-claim now.",
      rules: [rule],
      sessionId: "sA1",
      turnIndex: 1,
      now: "2026-04-23T10:00:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
    });
    expect(fs.existsSync(pendingFilePath(dir, "sA1"))).toBe(true);
    expect(events.find((e) => e.kind === "ai.output.bad_pattern" && e.knowledge_id === rule.id)).toBeTruthy();

    // UserPromptSubmit: drain pending, persist last_injected
    const inj = buildInjectionFromPending({ sessionsDir: dir, sessionId: "sA1" });
    expect(inj.injectedIds).toEqual([rule.id]);
    persistLastInjected(dir, "sA1", inj.injectedIds);
    expect(readLastInjected(dir, "sA1")).toEqual([rule.id]);

    // Turn 2: AI responds without the phrase → complied
    runStopNarrativeScan({
      aiText: "Here is the verification output: tests pass, build succeeds.",
      rules: [rule],
      sessionId: "sA1",
      turnIndex: 2,
      now: "2026-04-23T10:05:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
      lastInjectedKnowledgeIds: readLastInjected(dir, "sA1"),
    });
    expect(events.find((e) => e.kind === "ai.narrative.complied" && e.knowledge_id === rule.id)).toBeTruthy();
    expect(events.find((e) => e.kind === "ai.narrative.recurred")).toBeFalsy();
  });
});

describe("M4-A scenario A: narrative loop (education fails → recurred demerit)", () => {
  it("AI repeats phrase after injection → recurred event → calibrator demerit", async () => {
    const dir = tmpDir("recurred");
    const rule = narrativeRule({ id: "scen-A2" });
    const events: PersistedEvent[] = [];

    // Turn 1: AI says phrase
    runStopNarrativeScan({
      aiText: "The task-is-complete-claim is here.",
      rules: [rule],
      sessionId: "sA2",
      turnIndex: 1,
      now: "2026-04-23T10:00:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
    });

    // Injection
    const inj = buildInjectionFromPending({ sessionsDir: dir, sessionId: "sA2" });
    persistLastInjected(dir, "sA2", inj.injectedIds);

    // Turn 2: AI repeats same phrase
    runStopNarrativeScan({
      aiText: "Actually, I maintain: task-is-complete-claim.",
      rules: [rule],
      sessionId: "sA2",
      turnIndex: 2,
      now: "2026-04-23T10:05:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
      lastInjectedKnowledgeIds: readLastInjected(dir, "sA2"),
    });
    const recurredEvt = events.find((e) => e.kind === "ai.narrative.recurred" && e.knowledge_id === rule.id);
    expect(recurredEvt).toBeTruthy();

    // Calibrator: feed all events through v2 pipeline
    // (Using in-memory store stub would normally go here; we assert the
    // event schema fits the consumer by verifying the signal map handles it.)
    const { v2Calibrator } = await import("@teamagent/core");
    const result = v2Calibrator.calibrate(
      { ...rule, demerit: 0 },
      {
        events: events.filter((e) => e.knowledge_id === rule.id),
        observations: [],
        now: new Date("2026-04-23T11:00:00Z"),
      },
    );
    expect(result.demerit).toBeGreaterThan(0);
  });
});

describe("M4-A scenario B: tool-action regression", () => {
  it("block rule on command substring denies matching Bash invocation", () => {
    const rule = toolActionRule();
    const result = matchRules(
      {
        toolName: "Bash",
        input: { command: "claude --dangerously-skip-permissions" },
      },
      [rule],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.enforcement).toBe("block");
    expect(result[0]!.id).toBe(rule.id);
  });

  it("benign Bash command with same tool but different args does not match", () => {
    const rule = toolActionRule();
    const result = matchRules(
      { toolName: "Bash", input: { command: "echo hello" } },
      [rule],
    );
    expect(result).toHaveLength(0);
  });

  it("tool-action rule has no effect on narrative scanner (channel separation)", () => {
    const rule = toolActionRule();
    const dir = tmpDir("B-iso");
    const events: PersistedEvent[] = [];
    runStopNarrativeScan({
      aiText: "I would use --dangerously-skip-permissions here.",
      rules: [rule],
      sessionId: "sB1",
      turnIndex: 1,
      now: "2026-04-23T00:00:00Z",
      pendingDir: dir,
      emit: (e) => events.push(e),
    });
    // tool-action rule must NOT fire in narrative scanner
    expect(events).toHaveLength(0);
    expect(fs.existsSync(pendingFilePath(dir, "sB1"))).toBe(false);
  });
});

describe("M4-A scenario C: user-input channel flag", () => {
  it("user-input channel rule flags matching user prompt", () => {
    const rule = narrativeRule({
      id: "user-input-rule",
      wrong_pattern: "automation-noise-marker",
      channel: "user-input",
    });
    const hits = scanUserInput(
      "Please process this automation-noise-marker item.",
      [rule],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.knowledge_id).toBe(rule.id);
  });

  it("ai-narrative rule does not fire in user-input path", () => {
    const rule = narrativeRule({ channel: "ai-narrative" });
    const hits = scanUserInput(
      "Contains task-is-complete-claim in the prompt",
      [rule],
    );
    expect(hits).toHaveLength(0);
  });
});
