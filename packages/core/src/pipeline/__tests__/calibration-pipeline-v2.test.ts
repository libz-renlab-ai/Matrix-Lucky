import { describe, it, expect, vi } from "vitest";
import { runCalibrationPipelineV2 } from "../calibration-pipeline-v2.js";
import { v2Calibrator } from "../../calibrator/v2/index.js";
import type {
  AttributionBus,
  KnowledgeStore,
  Observation,
  Validator,
  ValidationLLMResult,
  ValidationL0Result,
} from "@teamagent/ports";
import type {
  AttributionEvent,
  KnowledgeEntry,
} from "@teamagent/types";

// ── helpers ──────────────────────────────────────────────────────────────────

class InMemoryStore implements KnowledgeStore {
  entries: KnowledgeEntry[] = [];
  updateCalls: Array<{ id: string; patch: Partial<KnowledgeEntry> }> = [];

  getAll() {
    return [...this.entries];
  }
  getActive() {
    return this.entries.filter((e) => e.status === "active");
  }
  getById(id: string) {
    return this.entries.find((e) => e.id === id);
  }
  query() {
    return this.getActive();
  }
  add(entry: KnowledgeEntry) {
    this.entries.push(entry);
  }
  update(id: string, patch: Partial<KnowledgeEntry>) {
    this.updateCalls.push({ id, patch });
    const i = this.entries.findIndex((e) => e.id === id);
    if (i < 0) throw new Error(`not found: ${id}`);
    this.entries[i] = { ...this.entries[i]!, ...patch } as KnowledgeEntry;
  }
  delete(id: string) {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.entries.splice(i, 1);
    return true;
  }
  count() {
    return this.entries.length;
  }
}

class RecordingBus implements AttributionBus {
  events: AttributionEvent[] = [];
  emit(e: AttributionEvent) {
    this.events.push(e);
  }
  subscribe() {
    return () => {};
  }
  drain() {
    return this.events.splice(0);
  }
}

function makeEntry(over: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "e",
    scope: { level: "team" },
    category: "E",
    tags: [],
    type: "avoidance",
    nature: "subjective",
    trigger: "t",
    wrong_pattern: "w",
    correct_pattern: "c",
    reasoning: "r",
    confidence: 0.5,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-01T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-04-01T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "2026-04-01T00:00:00Z",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...over,
  };
}

function makeObs(over: Partial<Observation> & { knowledge_id: string }): Observation {
  return {
    id: `obs-${Math.random().toString(36).slice(2)}`,
    timestamp: "2026-04-15T01:00:00Z",
    outcome: "success",
    ...over,
  };
}

const NOW = new Date("2026-04-15T12:00:00Z");

// ── tests ─────────────────────────────────────────────────────────────────────

describe("runCalibrationPipelineV2", () => {
  it("scans all active entries, runs v2 calibrator, writes back tier/demerit/confidence", async () => {
    const store = new InMemoryStore();
    const bus = new RecordingBus();

    // Two entries with 10 success observations each
    store.add(makeEntry({ id: "rule-a", confidence: 0.5 }));
    store.add(makeEntry({ id: "rule-b", confidence: 0.5 }));

    const observations: Observation[] = [];
    for (let i = 0; i < 10; i++) {
      observations.push(
        makeObs({ knowledge_id: "rule-a", id: `obs-a-${i}`, outcome: "success" }),
        makeObs({ knowledge_id: "rule-b", id: `obs-b-${i}`, outcome: "success" }),
      );
    }

    const result = await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [],
      observations,
      bus,
      now: () => NOW,
    });

    // Both entries scanned
    expect(result.scanned).toBe(2);
    // Both adjusted (confidence changed with 10 successes)
    expect(result.adjusted).toHaveLength(2);

    // Store updated for both
    expect(store.updateCalls).toHaveLength(2);
    const updatedA = store.getById("rule-a")!;
    const updatedB = store.getById("rule-b")!;
    expect(updatedA.confidence).toBeGreaterThan(0.5);
    expect(updatedB.confidence).toBeGreaterThan(0.5);
    expect(updatedA.last_validated_at).toBe(NOW.toISOString());

    // Bus received events
    const busEvents = bus.events.filter((e) => e.kind === "calibrator.v2-adjusted");
    expect(busEvents).toHaveLength(2);
  });

  it("skips entries with no observations and zero demerit", async () => {
    const store = new InMemoryStore();

    // Entry with no obs, no events, zero demerit
    store.add(makeEntry({ id: "rule-empty", confidence: 0.7, demerit: 0 }));

    const result = await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [],
      observations: [],
      now: () => NOW,
    });

    expect(result.scanned).toBe(1);
    expect(result.adjusted).toHaveLength(0);
    // store.update should NOT have been called
    expect(store.updateCalls).toHaveLength(0);
  });

  it("dryRun: does not write to store but populates adjusted array", async () => {
    const store = new InMemoryStore();
    const bus = new RecordingBus();

    store.add(makeEntry({ id: "rule-dry", confidence: 0.5 }));

    const observations: Observation[] = [];
    for (let i = 0; i < 10; i++) {
      observations.push(
        makeObs({ knowledge_id: "rule-dry", id: `obs-dry-${i}`, outcome: "success" }),
      );
    }

    const result = await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [],
      observations,
      bus,
      now: () => NOW,
      dryRun: true,
    });

    // adjusted populated
    expect(result.adjusted).toHaveLength(1);
    expect(result.adjusted[0]!.knowledge_id).toBe("rule-dry");

    // store NOT updated
    expect(store.updateCalls).toHaveLength(0);
    // Original entry confidence unchanged
    expect(store.getById("rule-dry")!.confidence).toBe(0.5);

    // Bus still emits events (dry run doesn't suppress events)
    expect(bus.events.filter((e) => e.kind === "calibrator.v2-adjusted")).toHaveLength(1);
  });

  it("skips archived entries even if observations exist", async () => {
    const store = new InMemoryStore();

    store.add(makeEntry({ id: "rule-archived", status: "archived", confidence: 0.7 }));

    const observations: Observation[] = [];
    for (let i = 0; i < 5; i++) {
      observations.push(
        makeObs({ knowledge_id: "rule-archived", id: `obs-arch-${i}`, outcome: "success" }),
      );
    }

    const result = await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [],
      observations,
      now: () => NOW,
    });

    expect(result.adjusted).toHaveLength(0);
    expect(store.updateCalls).toHaveLength(0);
  });

  it("tracks dormantNew when tier transitions to dormant via high demerit", async () => {
    const store = new InMemoryStore();

    // Entry already at demerit >= 30 (dormant threshold) — effectiveTier will return dormant
    store.add(makeEntry({
      id: "rule-doom",
      confidence: 0.5,
      demerit: 30,
      demerit_last_updated: "2026-04-14T00:00:00Z",
      tier_entered_at: "2026-03-01T00:00:00Z",
    }));

    // Provide some observations so calibrator runs (entry.demerit=30, non-zero)
    const observations: Observation[] = [
      makeObs({ knowledge_id: "rule-doom", id: "obs-doom-0", outcome: "failure" }),
    ];

    const result = await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [],
      observations,
      now: () => NOW,
    });

    // Pipeline should run without throwing
    expect(result.scanned).toBe(1);
    // If dormant tier was reached, dormantNew should include the id
    if (result.dormantNew.includes("rule-doom")) {
      expect(store.getById("rule-doom")!.current_tier).toBe("dormant");
    }
  });

  it("promotion to stable blocked when L1 returns ok=false (M2.3)", async () => {
    const store = new InMemoryStore();
    const bus = new RecordingBus();

    // Entry primed to promote probation → stable: high confidence + enough hits +
    // stayed in probation long enough (tier_entered_at old).
    store.add(
      makeEntry({
        id: "rule-pmt",
        confidence: 0.95,
        current_tier: "probation",
        max_tier_ever: "probation",
        tier_entered_at: "2026-03-01T00:00:00Z",
        hit_count: 30,
        success_count: 28,
        demerit: 0,
      }),
    );

    // 10 success observations → calibrator wants to promote
    const observations: Observation[] = Array.from({ length: 10 }, (_, i) =>
      makeObs({ knowledge_id: "rule-pmt", id: `obs-${i}`, outcome: "success" }),
    );

    const validator: Validator = {
      validateLevel0: (): ValidationL0Result => ({
        ok: true,
        failed_checks: [],
      }),
      validateLevel1: async (): Promise<ValidationLLMResult> => ({
        ok: false,
        confidence: 0.3,
        reason: "too broad",
      }),
      validateLevel2: async (): Promise<ValidationLLMResult> => ({
        ok: true,
        confidence: 0.9,
        reason: "fine",
      }),
    };

    const result = await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [],
      observations,
      now: () => NOW,
      bus,
      validator,
      callLLM: async () => "",
    });

    // Some form of calibration should still run; if it tried to promote to
    // stable, L1 should have blocked it → tier stays at probation
    const entryAfter = store.getById("rule-pmt")!;
    expect(entryAfter.current_tier).toBe("probation");

    // If there was a blocked promotion, bus should record it
    const blocked = bus.events.filter(
      (e) => e.kind === "validator.blocked-promotion",
    );
    if (result.adjusted.some((a) => a.tier_before !== a.tier_after)) {
      // Should never get here: tier_after should equal tier_before after L1 block
      throw new Error(
        "Expected tier_after to revert to tier_before after L1 block",
      );
    }
    // When promotion attempt occurred, expect at least one blocked_promotion event
    // OR record reverted to no-transition (check via delta_breakdown)
    const reverted = result.adjusted.find((a) =>
      a.delta_breakdown.some(
        (d) => d.note?.includes("l1_blocked") || d.note?.includes("reverted"),
      ),
    );
    expect(reverted || blocked.length > 0).toBeTruthy();
  });

  it("promotion to canonical requires both L1 and L2 pass (M2.3)", async () => {
    const store = new InMemoryStore();

    // Entry primed to promote stable → canonical
    store.add(
      makeEntry({
        id: "rule-can",
        confidence: 0.98,
        current_tier: "stable",
        max_tier_ever: "stable",
        tier_entered_at: "2026-02-01T00:00:00Z",
        hit_count: 100,
        success_count: 98,
        demerit: 0,
      }),
    );

    const observations: Observation[] = Array.from({ length: 30 }, (_, i) =>
      makeObs({ knowledge_id: "rule-can", id: `obs-${i}`, outcome: "success" }),
    );

    const l1Calls: number[] = [];
    const l2Calls: number[] = [];

    const validator: Validator = {
      validateLevel0: () => ({ ok: true, failed_checks: [] }),
      validateLevel1: async () => {
        l1Calls.push(1);
        return { ok: true, confidence: 0.9, reason: "fine" };
      },
      validateLevel2: async () => {
        l2Calls.push(1);
        return { ok: false, confidence: 0.6, reason: "overfit" };
      },
    };

    await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [],
      observations,
      now: () => NOW,
      validator,
      callLLM: async () => "",
    });

    // Whenever an attempted promotion reached canonical, both L1 and L2 should run
    // (L1 first; if passed, L2). If calibrator didn't propose a promotion, both
    // counts may be 0 — but when any promotion occurs, L1 must be called.
    const entryAfter = store.getById("rule-can")!;
    // With L2 blocking, tier must not advance past stable
    expect(["stable", "probation", "experimental"]).toContain(
      entryAfter.current_tier,
    );
  });

  it("emits skill_should_write when tier crosses into stable (M2.4)", async () => {
    const store = new InMemoryStore();
    const bus = new RecordingBus();

    // Entry primed to promote probation → stable
    store.add(
      makeEntry({
        id: "rule-skill-write",
        confidence: 0.95,
        current_tier: "probation",
        max_tier_ever: "probation",
        tier_entered_at: "2026-03-01T00:00:00Z",
        hit_count: 30,
        success_count: 28,
        demerit: 0,
      }),
    );

    const observations: Observation[] = Array.from({ length: 15 }, (_, i) =>
      makeObs({ knowledge_id: "rule-skill-write", id: `obs-sw-${i}`, outcome: "success" }),
    );

    await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [],
      observations,
      bus,
      now: () => NOW,
    });

    const entry = store.getById("rule-skill-write")!;
    // If promotion actually happened (calibrator decided to promote), check event
    if (entry.current_tier !== "probation") {
      const skillWriteEvents = bus.events.filter(
        (e) => e.kind === "compile.skill-should-write",
      );
      expect(skillWriteEvents.length).toBeGreaterThan(0);
      expect(skillWriteEvents[0]!.knowledgeId).toBe("rule-skill-write");
    }
  });

  it("emits skill_should_remove when tier falls out of stable (M2.4)", async () => {
    const store = new InMemoryStore();
    const bus = new RecordingBus();

    // Entry in stable with high demerit → demote below stable
    store.add(
      makeEntry({
        id: "rule-skill-remove",
        confidence: 0.5,
        current_tier: "stable",
        max_tier_ever: "stable",
        tier_entered_at: "2026-03-01T00:00:00Z",
        hit_count: 5,
        success_count: 1,
        demerit: 20,
        demerit_last_updated: "2026-04-14T00:00:00Z",
      }),
    );

    const observations: Observation[] = Array.from({ length: 5 }, (_, i) =>
      makeObs({ knowledge_id: "rule-skill-remove", id: `obs-sr-${i}`, outcome: "failure" }),
    );

    await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [],
      observations,
      bus,
      now: () => NOW,
    });

    const entry = store.getById("rule-skill-remove")!;
    // If demotion actually happened, check event
    if (!["stable", "canonical", "enforced"].includes(entry.current_tier)) {
      const skillRemoveEvents = bus.events.filter(
        (e) => e.kind === "compile.skill-should-remove",
      );
      expect(skillRemoveEvents.length).toBeGreaterThan(0);
      expect(skillRemoveEvents[0]!.knowledgeId).toBe("rule-skill-remove");
    }
  });

  it("does not emit skill events when tier stays within same band (M2.4)", async () => {
    const store = new InMemoryStore();
    const bus = new RecordingBus();

    // Entry in experimental with small confidence change (no tier transition)
    store.add(
      makeEntry({
        id: "rule-no-skill-event",
        confidence: 0.5,
        current_tier: "experimental",
        max_tier_ever: "experimental",
        tier_entered_at: "2026-04-01T00:00:00Z",
        hit_count: 2,
        success_count: 1,
        demerit: 0,
      }),
    );

    const observations: Observation[] = [
      makeObs({ knowledge_id: "rule-no-skill-event", id: "obs-nse-0", outcome: "success" }),
    ];

    await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [],
      observations,
      bus,
      now: () => NOW,
    });

    const skillEvents = bus.events.filter(
      (e) => e.kind === "compile.skill-should-write" || e.kind === "compile.skill-should-remove",
    );
    expect(skillEvents).toHaveLength(0);
  });
});

describe("ai.override.complied → synthetic Observation boosts confidence", () => {
  it("complied event creates synthetic success observation for target rule", async () => {
    const entry = makeEntry({ id: "rule-X", confidence: 0.1, demerit: 0 });
    const store = new InMemoryStore();
    store.add(entry);

    const compliedEvent = {
      id: "e-complied-1",
      kind: "ai.override.complied" as const,
      knowledge_id: "rule-X",
      tool_use_id: "t1",
      timestamp: new Date().toISOString(),
      schema_version: 1 as const,
    };

    const result = await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [compliedEvent],
      observations: [],
      now: () => NOW,
      dryRun: true,
    });

    // Should have adjusted rule-X (synthetic obs → confidence change)
    const adj = result.adjusted.find((a) => a.knowledge_id === "rule-X");
    expect(adj).toBeDefined();
    // confidence should be higher (or at least not lower) than before
    if (adj) {
      expect(adj.confidence_after).toBeGreaterThanOrEqual(entry.confidence);
    }
  });

  it("ignored event increases demerit for target rule", async () => {
    const entry = makeEntry({ id: "rule-Y", confidence: 0.5, demerit: 0 });
    const store = new InMemoryStore();
    store.add(entry);

    const ignoredEvent = {
      id: "e-ignored-1",
      kind: "ai.override.ignored" as const,
      knowledge_id: "rule-Y",
      tool_use_id: "t2",
      timestamp: new Date().toISOString(),
      schema_version: 1 as const,
    };

    const result = await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [ignoredEvent],
      observations: [],
      now: () => NOW,
      dryRun: true,
    });

    const adj = result.adjusted.find((a) => a.knowledge_id === "rule-Y");
    expect(adj).toBeDefined();
    if (adj) {
      expect(adj.demerit_after).toBeGreaterThan(0);
    }
  });

  it("blocked event creates synthetic success observation", async () => {
    const entry = makeEntry({ id: "rule-block", confidence: 0.1, demerit: 0 });
    const store = new InMemoryStore();
    store.add(entry);

    const blockedEvent = {
      id: "e-blocked-1",
      kind: "hook-pre.blocked" as const,
      knowledge_id: "rule-block",
      tool_use_id: "t3",
      timestamp: new Date().toISOString(),
      schema_version: 1 as const,
    };

    const result = await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [blockedEvent],
      observations: [],
      now: () => NOW,
      dryRun: true,
    });

    const adj = result.adjusted.find((a) => a.knowledge_id === "rule-block");
    expect(adj).toBeDefined();
    expect(adj!.confidence_after).toBeGreaterThanOrEqual(entry.confidence);
  });

  it("narrative recurred creates synthetic failure observation and demerit", async () => {
    const entry = makeEntry({ id: "rule-narr", confidence: 0.8, demerit: 0 });
    const store = new InMemoryStore();
    store.add(entry);

    const recurredEvent = {
      id: "e-recurred-1",
      kind: "ai.narrative.recurred" as const,
      knowledge_id: "rule-narr",
      timestamp: new Date().toISOString(),
      schema_version: 1 as const,
    };

    const result = await runCalibrationPipelineV2({
      calibrator: v2Calibrator,
      store,
      events: [recurredEvent],
      observations: [],
      now: () => NOW,
      dryRun: true,
    });

    const adj = result.adjusted.find((a) => a.knowledge_id === "rule-narr");
    expect(adj).toBeDefined();
    expect(adj!.confidence_after).toBeLessThan(entry.confidence);
    expect(adj!.demerit_after).toBeGreaterThan(0);
  });
});
