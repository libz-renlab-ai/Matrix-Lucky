import type { AttributionEvent } from "@teamagent/types";

/**
 * 归因事件总线。组件通过 emit 发送事件，Renderer 或持久化层通过 subscribe 消费。
 *
 * M0 的 InMemoryAttributionBus 只做内存存储+同步订阅。M2 起会有 adapter
 * 把事件落盘到 ~/.teamagent/events.jsonl 供跨进程消费（Hook 是短进程）。
 */
export interface AttributionBus {
  emit(event: AttributionEvent): void;
  subscribe(handler: (event: AttributionEvent) => void): Unsubscribe;
  /** 返回本次 session 内收集的所有事件（主要给 CLI 命令结束时汇总渲染）*/
  drain(): AttributionEvent[];
}

/** 取消订阅的函数。 */
export type Unsubscribe = () => void;
