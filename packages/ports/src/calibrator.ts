import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

/**
 * 置信度校准器：根据一条知识条目过去发生过的事件，算出更新后的
 * confidence + status。纯函数。
 *
 * 设计意图：
 * - 给定 (entry, events)，输出 (newConfidence, newStatus, delta)
 * - 不写 store、不写 events.jsonl —— 那是 calibration-pipeline 的责任
 * - 多个 calibrator 实现可并存（rule-based / ML-based / 用户自定义）
 *   都通过此接口暴露，行为差异由 contract 测试约束
 *
 * 调用方典型用法：
 *   const result = calibrator.calibrate(entry, eventsForEntry);
 *   if (result.delta !== 0) store.update(entry.id, { confidence: result.confidence, status: result.status });
 */
export interface Calibrator {
  calibrate(entry: KnowledgeEntry, events: PersistedEvent[]): CalibrationResult;
}

export interface CalibrationResult {
  /** 新的 confidence（已 clamp 到 [0, 1]） */
  confidence: number;
  /** 新的 status（可能由 active 自动归档为 archived） */
  status: KnowledgeEntry["status"];
  /** 与旧 confidence 的差值（正=上升，负=下降，0=无变化） */
  delta: number;
  /** 触发本次校准的信号明细，供 stats / Portal 展示 */
  applied_signals: AppliedSignal[];
}

export interface AppliedSignal {
  /** 信号类别（hook-pre.blocked / hook-post.success_after_warn / etc.） */
  kind: string;
  /** 该信号对 confidence 的贡献（正=加分，负=扣分） */
  weight: number;
  /** 触发该信号的事件 id 列表（可空） */
  event_ids?: string[];
}
