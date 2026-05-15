import { describe, it, expect } from "vitest";
import {
  runIngestPipeline,
  type IngestPipelineDeps,
} from "../ingest-pipeline.js";
import type {
  ExtractionInput,
  KnowledgeExtractor,
  KnowledgeStore,
  AttributionBus,
  Validator,
  ValidationL0Result,
} from "@teamagent/ports";
import type {
  AttributionEvent,
  KnowledgeEntry,
} from "@teamagent/types";

class QueuedExtractor implements KnowledgeExtractor {
  constructor(
    public behaviors: Array<
      | { kind: "ok"; partial: Partial<KnowledgeEntry> }
      | { kind: "null" }
      | { kind: "throw"; message: string }
    >,
  ) {}
  async extract(): Promise<Partial<KnowledgeEntry> | null> {
    const next = this.behaviors.shift();
    if (!next) throw new Error("queue exhausted");
    if (next.kind === "null") return null;
    if (next.kind === "throw") throw new Error(next.message);
    return next.partial;
  }
}

class InMemoryStoreStub implements KnowledgeStore {
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
    if (i < 0) throw new Error("not found");
    this.entries[i] = { ...this.entries[i]!, ...patch };
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

const passValidator: Pick<Validator, "validateLevel0"> = {
  validateLevel0: (): ValidationL0Result => ({ ok: true, failed_checks: [] }),
};

function makePartial(
  over: Partial<KnowledgeEntry> = {},
): Partial<KnowledgeEntry> {
  return {
    category: "E",
    type: "avoidance",
    nature: "subjective",
    trigger: "t",
    wrong_pattern: "w",
    correct_pattern: "c",
    reasoning: "r",
    ...over,
  };
}

function makeInputs(n: number): ExtractionInput[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: "insights" as const,
    context: `ctx-${i}`,
    weight: 0.8,
  }));
}

function makeDeps(over: Partial<IngestPipelineDeps> = {}): IngestPipelineDeps {
  let counter = 0;
  return {
    inputs: [],
    extractor: new QueuedExtractor([]),
    callLLM: async () => "",
    validator: passValidator as Validator,
    store: new InMemoryStoreStub(),
    scope: { level: "personal" },
    source: "ingested",
    projectStack: ["ts"],
    now: () => new Date("2026-04-16T12:00:00Z"),
    idGen: () => `ing-${++counter}`,
    ...over,
  };
}

describe("runIngestPipeline", () => {
  it("runs extractor + L0 + store.add for each ExtractionInput", async () => {
    const store = new InMemoryStoreStub();
    const deps = makeDeps({
      inputs: makeInputs(3),
      extractor: new QueuedExtractor([
        { kind: "ok", partial: makePartial({ trigger: "t1" }) },
        { kind: "ok", partial: makePartial({ trigger: "t2" }) },
        { kind: "ok", partial: makePartial({ trigger: "t3" }) },
      ]),
      store,
    });
    const r = await runIngestPipeline(deps);
    expect(r.scanned).toBe(3);
    expect(r.accepted).toHaveLength(3);
    expect(r.rejected).toHaveLength(0);
    expect(store.count()).toBe(3);
  });

  it("null extraction → skipped, store untouched", async () => {
    const store = new InMemoryStoreStub();
    const deps = makeDeps({
      inputs: makeInputs(2),
      extractor: new QueuedExtractor([{ kind: "null" }, { kind: "null" }]),
      store,
    });
    const r = await runIngestPipeline(deps);
    expect(r.skipped).toBe(2);
    expect(r.accepted).toHaveLength(0);
    expect(store.count()).toBe(0);
  });

  it("extractor throws → counted as failed, continues to next", async () => {
    const deps = makeDeps({
      inputs: makeInputs(2),
      extractor: new QueuedExtractor([
        { kind: "throw", message: "oops" },
        { kind: "ok", partial: makePartial({ trigger: "t2" }) },
      ]),
    });
    const r = await runIngestPipeline(deps);
    expect(r.failed).toBe(1);
    expect(r.accepted).toHaveLength(1);
  });

  it("L0 reject → pushed to rejected, store untouched", async () => {
    const store = new InMemoryStoreStub();
    let seen = 0;
    const rejectValidator: Pick<Validator, "validateLevel0"> = {
      validateLevel0: (): ValidationL0Result => {
        seen++;
        return seen === 1
          ? { ok: false, failed_checks: ["wrong_pattern_not_in_source"] }
          : { ok: true, failed_checks: [] };
      },
    };
    const deps = makeDeps({
      inputs: makeInputs(2),
      extractor: new QueuedExtractor([
        { kind: "ok", partial: makePartial({ trigger: "t1" }) },
        { kind: "ok", partial: makePartial({ trigger: "t2" }) },
      ]),
      validator: rejectValidator as Validator,
      store,
    });
    const r = await runIngestPipeline(deps);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]!.reasons).toContain("wrong_pattern_not_in_source");
    expect(r.accepted).toHaveLength(1);
    expect(store.count()).toBe(1);
  });

  it("respects dryRun (no writes)", async () => {
    const store = new InMemoryStoreStub();
    const deps = makeDeps({
      inputs: makeInputs(2),
      extractor: new QueuedExtractor([
        { kind: "ok", partial: makePartial({ trigger: "t1" }) },
        { kind: "ok", partial: makePartial({ trigger: "t2" }) },
      ]),
      store,
      dryRun: true,
    });
    const r = await runIngestPipeline(deps);
    expect(r.accepted).toHaveLength(2);
    expect(store.count()).toBe(0);
  });

  it("emits ingest.accepted / ingest.rejected_l0 events via bus", async () => {
    const bus = new RecordingBus();
    let seen = 0;
    const validator: Pick<Validator, "validateLevel0"> = {
      validateLevel0: () =>
        seen++ === 0
          ? { ok: true, failed_checks: [] }
          : { ok: false, failed_checks: ["scope_paths_empty"] },
    };
    const deps = makeDeps({
      inputs: makeInputs(2),
      extractor: new QueuedExtractor([
        { kind: "ok", partial: makePartial({ trigger: "t1" }) },
        { kind: "ok", partial: makePartial({ trigger: "t2" }) },
      ]),
      validator: validator as Validator,
      bus,
    });
    await runIngestPipeline(deps);
    const kinds = bus.events.map((e) => e.kind);
    expect(kinds).toContain("ingest.accepted");
    expect(kinds).toContain("ingest.rejected-l0");
  });

  it("tags accepted entries with source from deps (e.g. 'ingested')", async () => {
    const deps = makeDeps({
      inputs: makeInputs(1),
      extractor: new QueuedExtractor([
        { kind: "ok", partial: makePartial({ trigger: "t1" }) },
      ]),
      source: "ingested",
    });
    const r = await runIngestPipeline(deps);
    expect(r.accepted[0]!.source).toBe("ingested");
  });

  it("uses injected idGen + now for accepted entries", async () => {
    const deps = makeDeps({
      inputs: makeInputs(1),
      extractor: new QueuedExtractor([
        { kind: "ok", partial: makePartial({ trigger: "t1" }) },
      ]),
      idGen: () => "fixed-id",
      now: () => new Date("2027-01-01T00:00:00Z"),
    });
    const r = await runIngestPipeline(deps);
    expect(r.accepted[0]!.id).toBe("fixed-id");
    expect(r.accepted[0]!.created_at).toBe("2027-01-01T00:00:00.000Z");
  });
});
