import { describe, it, expect, beforeEach } from "vitest";
import type { AttributionBus } from "../attribution-bus.js";
import type { AttributionEvent } from "@teamagent/types";

/**
 * 契约测试 fixture：用 skeleton.knowledge-added 这条 kind 当代表事件，
 * 因为它字段最少（且 source/severity/timestamp 都是固定字面量），便于覆盖。
 *
 * `userFacingValue` overrides 用 `userFacingValue` 字段而非旧版的自由 `action`
 * 字符串——commit 4 起 AttributionEvent 是 discriminated union by `kind`。
 */
function makeEvent(
  overrides: Partial<Omit<AttributionEvent, "kind" | "source">> & {
    userFacingValue?: string;
  } = {},
): AttributionEvent {
  return {
    kind: "skeleton.knowledge-added",
    source: "skeleton",
    knowledgeId: "test",
    knowledgeCountBefore: 0,
    knowledgeCountAfter: 1,
    blockLines: 0,
    severity: "info",
    timestamp: "2026-04-14T00:00:00Z",
    ...overrides,
  };
}

/**
 * 契约测试：任何 AttributionBus 实现都应通过。
 */
export function runAttributionBusContract(factory: () => AttributionBus): void {
  describe("AttributionBus contract", () => {
    let bus: AttributionBus;

    beforeEach(() => {
      bus = factory();
    });

    it("emit + drain roundtrip", () => {
      const e = makeEvent({ userFacingValue: "test" });
      bus.emit(e);
      const drained = bus.drain();
      expect(drained).toHaveLength(1);
      expect(drained[0]?.userFacingValue).toBe("test");
    });

    it("drain clears the buffer", () => {
      bus.emit(makeEvent());
      bus.drain();
      expect(bus.drain()).toEqual([]);
    });

    it("subscribe receives emitted events", () => {
      const seen: AttributionEvent[] = [];
      bus.subscribe((e) => seen.push(e));
      bus.emit(makeEvent({ userFacingValue: "one" }));
      bus.emit(makeEvent({ userFacingValue: "two" }));
      expect(seen.map((e) => e.userFacingValue)).toEqual(["one", "two"]);
    });

    it("unsubscribe stops delivery", () => {
      const seen: AttributionEvent[] = [];
      const unsub = bus.subscribe((e) => seen.push(e));
      bus.emit(makeEvent({ userFacingValue: "before" }));
      unsub();
      bus.emit(makeEvent({ userFacingValue: "after" }));
      expect(seen.map((e) => e.userFacingValue)).toEqual(["before"]);
    });

    it("multiple subscribers each receive every event", () => {
      const a: string[] = [];
      const b: string[] = [];
      bus.subscribe((e) => a.push(e.userFacingValue ?? ""));
      bus.subscribe((e) => b.push(e.userFacingValue ?? ""));
      bus.emit(makeEvent({ userFacingValue: "x" }));
      expect(a).toEqual(["x"]);
      expect(b).toEqual(["x"]);
    });

    it("delivery field roundtrips through emit + drain (ADR-0009)", () => {
      // delivery 字段是 metadata only (per ADR-0009, α2 决议保留 ADR-0008 always-exit-0)
      // 但 bus 必须保证字段经 emit + drain 不丢失，否则 future Renderer 装饰 / 退码扩展失效
      bus.emit(makeEvent({ delivery: "log" }));
      bus.emit(makeEvent({ delivery: "context" }));
      bus.emit(makeEvent({ delivery: "block" }));
      bus.emit(makeEvent({})); // delivery undefined → 默认 "log" 语义
      const drained = bus.drain();
      expect(drained.map((e) => e.delivery)).toEqual(["log", "context", "block", undefined]);
    });

    it("subscribe handler receives delivery field (ADR-0009)", () => {
      // delivery roundtrip 用例只覆盖 emit→drain；future Renderer 装饰会走 subscribe
      // 路径，因此 subscribe handler 也必须能拿到 delivery 不丢字段。
      const seen: Array<AttributionEvent["delivery"]> = [];
      bus.subscribe((e) => seen.push(e.delivery));
      bus.emit(makeEvent({ delivery: "context" }));
      bus.emit(makeEvent({ delivery: "block" }));
      bus.emit(makeEvent({})); // undefined 默认语义
      expect(seen).toEqual(["context", "block", undefined]);
    });
  });
}
