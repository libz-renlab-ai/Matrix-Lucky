import { describe, it, expect, beforeEach } from "vitest";
import type { KnowledgeStore } from "../knowledge-store.js";
import type { KnowledgeEntry } from "@teamagent/types";

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "test-001",
    scope: { level: "personal" },
    category: "C",
    tags: ["syntax-error"],
    type: "avoidance",
    nature: "objective",
    trigger: "python command",
    wrong_pattern: "python ",
    correct_pattern: "python3",
    reasoning: "local python points to 2.7",
    confidence: 0.9,
    enforcement: "block",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-14T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "preset",
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

/**
 * 契约测试套件——任何 KnowledgeStore 实现都应通过。
 *
 * 使用方式：
 *   describe("InMemoryKnowledgeStore", () => {
 *     runKnowledgeStoreContract(() => new InMemoryKnowledgeStore());
 *   });
 */
export function runKnowledgeStoreContract(factory: () => KnowledgeStore): void {
  describe("KnowledgeStore contract", () => {
    let store: KnowledgeStore;

    beforeEach(() => {
      store = factory();
    });

    it("starts empty", () => {
      expect(store.getAll()).toEqual([]);
      expect(store.count()).toBe(0);
    });

    it("add + getById", () => {
      const e = makeEntry({ id: "a" });
      store.add(e);
      expect(store.getById("a")?.id).toBe("a");
      expect(store.count()).toBe(1);
    });

    it("duplicate id throws", () => {
      store.add(makeEntry({ id: "dup" }));
      expect(() => store.add(makeEntry({ id: "dup" }))).toThrow();
    });

    it("update applies patch", () => {
      store.add(makeEntry({ id: "u1", hit_count: 0 }));
      store.update("u1", { hit_count: 5 });
      expect(store.getById("u1")?.hit_count).toBe(5);
    });

    it("update non-existent throws", () => {
      expect(() => store.update("nope", { hit_count: 1 })).toThrow();
    });

    it("delete returns true when present, false when not", () => {
      store.add(makeEntry({ id: "d1" }));
      expect(store.delete("d1")).toBe(true);
      expect(store.delete("d1")).toBe(false);
      expect(store.count()).toBe(0);
    });

    it("getActive filters out archived", () => {
      store.add(makeEntry({ id: "a1", status: "active" }));
      store.add(makeEntry({ id: "a2", status: "archived" }));
      const active = store.getActive();
      expect(active).toHaveLength(1);
      expect(active[0]?.id).toBe("a1");
    });

    it("getAll returns all including archived", () => {
      store.add(makeEntry({ id: "a1", status: "active" }));
      store.add(makeEntry({ id: "a2", status: "archived" }));
      expect(store.getAll()).toHaveLength(2);
    });

    describe("query", () => {
      beforeEach(() => {
        store.add(
          makeEntry({
            id: "py",
            category: "C",
            tags: ["syntax-error", "python"],
            trigger: "python command",
            confidence: 0.95,
          }),
        );
        store.add(
          makeEntry({
            id: "prisma",
            category: "C",
            tags: ["api", "prisma"],
            trigger: "Prisma date filter",
            confidence: 0.92,
          }),
        );
        store.add(
          makeEntry({
            id: "zustand",
            category: "E",
            tags: ["tech-choice"],
            trigger: "state management",
            confidence: 0.82,
            nature: "subjective",
            enforcement: "warn",
          }),
        );
        store.add(
          makeEntry({
            id: "archived",
            status: "archived",
            confidence: 0.3,
            enforcement: "passive",
          }),
        );
      });

      it("excludes archived by default", () => {
        const results = store.query({});
        expect(results.find((e) => e.id === "archived")).toBeUndefined();
      });

      it("includeArchived returns them", () => {
        const results = store.query({ includeArchived: true });
        expect(results.find((e) => e.id === "archived")).toBeDefined();
      });

      it("filters by category", () => {
        const results = store.query({ category: "E" });
        expect(results).toHaveLength(1);
        expect(results[0]?.id).toBe("zustand");
      });

      it("filters by minConfidence", () => {
        const results = store.query({ minConfidence: 0.9 });
        expect(results.every((e) => e.confidence >= 0.9)).toBe(true);
      });

      it("keyword matches trigger / tags", () => {
        const results = store.query({ keyword: "prisma" });
        expect(results[0]?.id).toBe("prisma");
      });

      it("respects limit", () => {
        const results = store.query({ limit: 2 });
        expect(results.length).toBeLessThanOrEqual(2);
      });
    });
  });
}
