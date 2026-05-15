import type {
  AttributionBus,
  ExtractionInput,
  KnowledgeExtractor,
  KnowledgeStore,
  Validator,
} from "@teamagent/ports";
import type { KnowledgeEntry, Scope } from "@teamagent/types";
import { computeEnforcement } from "@teamagent/types";

/**
 * source-agnostic ingest pipeline。所有非 correction 源共用的通路：
 * ExtractionInput[] → extractor → L0 → store。
 *
 * 与 extract-pipeline 的区别：前者从 ParsedSession 抽 correction moments 喂
 * extractor，后者直接吃 ExtractionInput[]。共用 L0 门闸 + store + extractor。
 */
export interface IngestPipelineDeps {
  inputs: ExtractionInput[];
  extractor: KnowledgeExtractor;
  callLLM: (prompt: string) => Promise<string>;
  validator: Pick<Validator, "validateLevel0">;
  store: KnowledgeStore;
  bus?: AttributionBus;
  /** 新条目挂的 scope。 */
  scope: Scope;
  /** 新条目 source 字段（通常 "ingested"） */
  source: KnowledgeEntry["source"];
  /** 项目 stack，L0 file_types 一致性检查。 */
  projectStack: string[];
  now: () => Date;
  idGen: () => string;
  /** true 时 extractor 和 validator 照跑，但不 store.add。用于预览。 */
  dryRun?: boolean;
}

export interface IngestPipelineResult {
  scanned: number;
  accepted: KnowledgeEntry[];
  rejected: { entry: KnowledgeEntry; reasons: string[] }[];
  /** LLM 返 null（信号不足）的条数 */
  skipped: number;
  /** extractor 异常的条数 */
  failed: number;
}

export async function runIngestPipeline(
  deps: IngestPipelineDeps,
): Promise<IngestPipelineResult> {
  const accepted: KnowledgeEntry[] = [];
  const rejected: { entry: KnowledgeEntry; reasons: string[] }[] = [];
  let skipped = 0;
  let failed = 0;

  for (const input of deps.inputs) {
    let partial: Partial<KnowledgeEntry> | null = null;
    try {
      partial = await deps.extractor.extract(input, deps.callLLM);
    } catch {
      failed += 1;
      emit(deps.bus, {
        kind: "ingest.failed",
        source: "ingest",
        count: 1,
        severity: "warning",
        userFacingValue: `提取失败（kind=${input.kind}）`,
        timestamp: deps.now().toISOString(),
      });
      continue;
    }
    if (!partial) {
      skipped += 1;
      emit(deps.bus, {
        kind: "ingest.skipped",
        source: "ingest",
        count: 1,
        severity: "info",
        userFacingValue: `信号不足，未提取（kind=${input.kind}）`,
        timestamp: deps.now().toISOString(),
      });
      continue;
    }

    const entry = completeEntry(partial, input, deps);

    const l0 = deps.validator.validateLevel0({
      entry,
      sourceText: input.context,
      existingRules: deps.store.getAll().map((r) => ({
        id: r.id,
        trigger: r.trigger,
        wrong_pattern: r.wrong_pattern,
      })),
      projectStack: deps.projectStack,
    });

    if (!l0.ok) {
      rejected.push({ entry, reasons: l0.failed_checks });
      emit(deps.bus, {
        kind: "ingest.rejected-l0",
        source: "ingest",
        knowledgeId: entry.id,
        severity: "info",
        userFacingValue: `L0 拒绝：${l0.failed_checks.join(", ")}`,
        timestamp: deps.now().toISOString(),
      });
      continue;
    }

    if (!deps.dryRun) {
      if (deps.store.addWithEmbedding) {
        await deps.store.addWithEmbedding(entry);
      } else {
        deps.store.add(entry);
      }
    }
    accepted.push(entry);
    emit(deps.bus, {
      kind: "ingest.accepted",
      source: "ingest",
      knowledgeId: entry.id,
      severity: "highlight",
      userFacingValue: `入库：${entry.trigger}`,
      timestamp: deps.now().toISOString(),
    });
  }

  return {
    scanned: deps.inputs.length,
    accepted,
    rejected,
    skipped,
    failed,
  };
}

function completeEntry(
  partial: Partial<KnowledgeEntry>,
  input: ExtractionInput,
  deps: IngestPipelineDeps,
): KnowledgeEntry {
  const nowIso = deps.now().toISOString();
  const nature = partial.nature ?? "subjective";
  const confidence = partial.confidence ?? Math.max(0, Math.min(1, input.weight));
  return {
    id: partial.id ?? deps.idGen(),
    scope: partial.scope ?? deps.scope,
    category: partial.category ?? "E",
    tags: partial.tags ?? [],
    type: partial.type ?? "avoidance",
    nature,
    trigger: partial.trigger ?? "",
    wrong_pattern: partial.wrong_pattern ?? "",
    correct_pattern: partial.correct_pattern ?? "",
    reasoning: partial.reasoning ?? "",
    confidence,
    enforcement: partial.enforcement ?? computeEnforcement(confidence, nature),
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: {
      success_sessions: 0,
      success_users: 0,
      correction_sessions: 0,
    },
    created_at: nowIso,
    last_hit_at: "",
    last_validated_at: nowIso,
    source: deps.source,
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: nowIso,
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action",
  };
}

function emit(
  bus: AttributionBus | undefined,
  event: Parameters<AttributionBus["emit"]>[0],
): void {
  if (!bus) return;
  try {
    bus.emit(event);
  } catch {
    // ignore
  }
}
