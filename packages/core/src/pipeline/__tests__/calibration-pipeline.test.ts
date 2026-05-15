import { describe, it, expect } from "vitest";
import { runCalibrationPipeline } from "../calibration-pipeline.js";
import { defaultCalibrator } from "../../calibrator/default.js";
import type {
  AttributionBus,
  KnowledgeStore,
} from "@teamagent/ports";
import type {
  AttributionEvent,
  KnowledgeEntry,
  PersistedEvent,
} from "@teamagent/types";

class InMemoryStore implements KnowledgeStore {
  entries: KnowledgeEntry[] = [];
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

function makeEntry(over: Partial<KnowledgeEntry>): KnowledgeEntry {
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
    confidence: 0.7,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-15T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-04-15T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...over,
  };
}

function evt(over: Partial<PersistedEvent>): PersistedEvent {
  return {
    id: "evt",
    kind: "hook-pre.matched",
    timestamp: "2026-04-15T01:00:00Z",
    schema_version: 1,
    ...over,
  } as PersistedEvent;
}

describe("runCalibrationPipeline", () => {
  it("no events → no adjustments", async () => {
    const store = new InMemoryStore();
    store.add(makeEntry({ id: "rule-a" }));
    const r = await runCalibrationPipeline({
      calibrator: defaultCalibrator,
      store,
      events: [],
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(r.scanned).toBe(1);
    expect(r.adjusted).toHaveLength(0);
  });

  it("entry with positive events → confidence increases + store updated", async () => {
    const store = new InMemoryStore();
    store.add(makeEntry({ id: "rule-a", confidence: 0.7 }));
    const events: PersistedEvent[] = [
      evt({ id: "p1", kind: "hook-pre.blocked", knowledge_id: "rule-a" }),
    ];
    const r = await runCalibrationPipeline({
      calibrator: defaultCalibrator,
      store,
      events,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(r.adjusted).toHaveLength(1);
    expect(r.adjusted[0]!.delta).toBeCloseTo(0.05, 5);
    expect(store.getById("rule-a")!.confidence).toBeCloseTo(0.75, 5);
    expect(store.getById("rule-a")!.last_validated_at).toBe(
      "2026-04-15T02:00:00.000Z",
    );
  });

  it("auto-archives entry that drops below threshold", async () => {
    const store = new InMemoryStore();
    store.add(makeEntry({ id: "rule-a", confidence: 0.32 }));
    const events: PersistedEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        evt({
          id: `b${i}`,
          kind: "hook-pre.blocked",
          knowledge_id: "rule-a",
          tool_use_id: `t${i}`,
        }),
      );
      events.push(
        evt({
          id: `pf${i}`,
          kind: "hook-post.result",
          knowledge_id: "rule-a",
          tool_use_id: `t${i}`,
          result: { succeeded: false },
        }),
      );
    }
    const r = await runCalibrationPipeline({
      calibrator: defaultCalibrator,
      store,
      events,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(r.archivedNew).toEqual(["rule-a"]);
    expect(store.getById("rule-a")!.status).toBe("archived");
  });

  it("multiple entries: only those with events get adjusted", async () => {
    const store = new InMemoryStore();
    store.add(makeEntry({ id: "rule-a" }));
    store.add(makeEntry({ id: "rule-b" }));
    store.add(makeEntry({ id: "rule-c" }));
    const events: PersistedEvent[] = [
      evt({ id: "p1", kind: "hook-pre.blocked", knowledge_id: "rule-b" }),
    ];
    const r = await runCalibrationPipeline({
      calibrator: defaultCalibrator,
      store,
      events,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(r.scanned).toBe(3);
    expect(r.adjusted).toHaveLength(1);
    expect(r.adjusted[0]!.knowledge_id).toBe("rule-b");
  });

  it("skips already-archived entries (no work even if events present)", async () => {
    const store = new InMemoryStore();
    store.add(makeEntry({ id: "rule-a", status: "archived" }));
    const events: PersistedEvent[] = [
      evt({ id: "p1", kind: "hook-pre.blocked", knowledge_id: "rule-a" }),
    ];
    const r = await runCalibrationPipeline({
      calibrator: defaultCalibrator,
      store,
      events,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(r.adjusted).toHaveLength(0);
  });

  it("emits calibrator.adjusted bus events for each adjustment", async () => {
    const store = new InMemoryStore();
    store.add(makeEntry({ id: "rule-a" }));
    store.add(makeEntry({ id: "rule-b" }));
    const events: PersistedEvent[] = [
      evt({ id: "p1", kind: "hook-pre.blocked", knowledge_id: "rule-a" }),
      evt({ id: "p2", kind: "hook-pre.warned", knowledge_id: "rule-b" }),
    ];
    const bus = new RecordingBus();
    await runCalibrationPipeline({
      calibrator: defaultCalibrator,
      store,
      events,
      bus,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    expect(bus.events.filter((e) => e.kind === "calibrator.adjusted")).toHaveLength(2);
  });

  it("archive event emitted at warning severity", async () => {
    const store = new InMemoryStore();
    store.add(makeEntry({ id: "rule-a", confidence: 0.32 }));
    const events: PersistedEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(
        evt({
          id: `b${i}`,
          kind: "hook-pre.blocked",
          knowledge_id: "rule-a",
          tool_use_id: `t${i}`,
        }),
        evt({
          id: `pf${i}`,
          kind: "hook-post.result",
          knowledge_id: "rule-a",
          tool_use_id: `t${i}`,
          result: { succeeded: false },
        }),
      );
    }
    const bus = new RecordingBus();
    await runCalibrationPipeline({
      calibrator: defaultCalibrator,
      store,
      events,
      bus,
      now: () => new Date("2026-04-15T02:00:00Z"),
    });
    const archiveEvent = bus.events.find((e) =>
      e.userFacingValue?.includes("自动归档"),
    );
    expect(archiveEvent).toBeDefined();
    expect(archiveEvent!.severity).toBe("warning");
  });
});
