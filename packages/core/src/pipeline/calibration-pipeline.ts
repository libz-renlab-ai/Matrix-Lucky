import type {
  AppliedSignal,
  Calibrator,
  KnowledgeStore,
  AttributionBus,
} from "@teamagent/ports";
import type { KnowledgeEntry, PersistedEvent } from "@teamagent/types";

/**
 * 校准 Pipeline 的依赖。所有 IO（store / bus）通过注入；events 列表
 * 由调用方读好后塞进来——这样 core 不依赖 fs / event-log adapter。
 */
export interface CalibrationPipelineDeps {
  calibrator: Calibrator;
  store: KnowledgeStore;
  /** 已读好的全部事件（calibration-pipeline 不重复读盘） */
  events: PersistedEvent[];
  bus?: AttributionBus;
  now: () => Date;
}

export interface CalibrationPipelineResult {
  scanned: number;
  /** 实际 confidence 发生变化的条目（含被自动归档的） */
  adjusted: AdjustmentRecord[];
  archivedNew: string[];
}

export interface AdjustmentRecord {
  knowledge_id: string;
  before: number;
  after: number;
  delta: number;
  status_before: KnowledgeEntry["status"];
  status_after: KnowledgeEntry["status"];
  signals: AppliedSignal[];
}

/**
 * 编排：扫所有 active 条目 → 找它的事件 → calibrate → store.update。
 * 纯函数式接口（IO 全注入）。
 *
 * 性能：events 按 knowledge_id 索引一次，O(n_entries + n_events)。
 */
export async function runCalibrationPipeline(
  deps: CalibrationPipelineDeps,
): Promise<CalibrationPipelineResult> {
  const allEntries = deps.store.getAll();
  const eventsByKnowledgeId = indexEventsByKnowledgeId(deps.events);

  const adjusted: AdjustmentRecord[] = [];
  const archivedNew: string[] = [];

  for (const entry of allEntries) {
    // 跳过已 archived / conflict 的条目（calibrator 也会跳过，但这里早返避免无谓调用）
    if (entry.status !== "active") continue;

    const entryEvents = eventsByKnowledgeId.get(entry.id) ?? [];
    if (entryEvents.length === 0) continue;

    const result = deps.calibrator.calibrate(entry, entryEvents);
    if (result.delta === 0 && result.status === entry.status) continue;

    deps.store.update(entry.id, {
      confidence: result.confidence,
      status: result.status,
      last_validated_at: deps.now().toISOString(),
    });

    adjusted.push({
      knowledge_id: entry.id,
      before: entry.confidence,
      after: result.confidence,
      delta: result.delta,
      status_before: entry.status,
      status_after: result.status,
      signals: result.applied_signals,
    });

    if (result.status === "archived" && entry.status === "active") {
      archivedNew.push(entry.id);
    }

    deps.bus?.emit({
      kind: "calibrator.adjusted",
      source: "calibrator",
      knowledgeId: entry.id,
      confidenceBefore: entry.confidence,
      confidenceAfter: result.confidence,
      statusBefore: entry.status,
      statusAfter: result.status,
      severity: result.status === "archived" && entry.status === "active" ? "warning" : "info",
      userFacingValue:
        result.status === "archived" && entry.status === "active"
          ? `${entry.id} 自动归档（confidence ${entry.confidence.toFixed(2)} → ${result.confidence.toFixed(2)}）`
          : `${entry.id} confidence ${entry.confidence.toFixed(2)} → ${result.confidence.toFixed(2)} (${result.delta > 0 ? "+" : ""}${result.delta.toFixed(2)})`,
      timestamp: deps.now().toISOString(),
    });
  }

  return {
    scanned: allEntries.length,
    adjusted,
    archivedNew,
  };
}

function indexEventsByKnowledgeId(
  events: PersistedEvent[],
): Map<string, PersistedEvent[]> {
  const idx = new Map<string, PersistedEvent[]>();
  for (const e of events) {
    if (!e.knowledge_id) continue;
    const list = idx.get(e.knowledge_id);
    if (list) list.push(e);
    else idx.set(e.knowledge_id, [e]);
  }
  return idx;
}
