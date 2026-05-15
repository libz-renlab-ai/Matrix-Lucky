import type { AttributionEvent } from "@teamagent/types";
import type { AttributionBus, Unsubscribe } from "@teamagent/ports";

/**
 * 内存归因总线。
 * - emit 同步通知所有订阅者，并把事件存入 buffer
 * - drain 返回并清空 buffer
 *
 * 适用于单进程内的 CLI 命令——命令开始时创建 bus，结束时 drain 渲染。
 * 跨进程场景（Hook 是短命进程）需要另一个 adapter：写 events.jsonl。
 */
export class InMemoryAttributionBus implements AttributionBus {
  private buffer: AttributionEvent[] = [];
  private subscribers = new Set<(event: AttributionEvent) => void>();

  emit(event: AttributionEvent): void {
    this.buffer.push(event);
    for (const handler of this.subscribers) {
      handler(event);
    }
  }

  subscribe(handler: (event: AttributionEvent) => void): Unsubscribe {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  drain(): AttributionEvent[] {
    const copy = this.buffer.slice();
    this.buffer = [];
    return copy;
  }
}
