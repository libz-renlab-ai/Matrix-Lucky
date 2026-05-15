import type { KnowledgeEntry } from "@teamagent/types";
import type { AttributionBus } from "@teamagent/ports";
import { llmBasedKnowledgeExtractor } from "../extractor/llm-based.js";

/**
 * 把一段已有的文本规则（来自 CLAUDE.md / .cursorrules / 人口头）
 * 通过 LLM 结构化为 Partial<KnowledgeEntry>。
 *
 * 复用 M4 的 llmBasedKnowledgeExtractor，kind="rule-text"。
 * 导入来源的规则默认置信度 0.7——比 LLM 从纠正信号提取的低，
 * 因为"人写下来的规则"的权威度高但适用性未验证，给中等置信度。
 *
 * 纯函数：callLLM 依赖注入。返回 null 表示 LLM 判定这段文本
 * 不能结构化成有用条目（太泛、没内容等）。
 */
export async function structureRuleText(
  text: string,
  callLLM: (prompt: string) => Promise<string>,
): Promise<Partial<KnowledgeEntry> | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return llmBasedKnowledgeExtractor.extract(
    { kind: "rule-text", context: trimmed, weight: DEFAULT_IMPORT_CONFIDENCE },
    callLLM,
  );
}

/** 导入来源的默认 confidence。Pipeline 补全 KnowledgeEntry 时用。 */
export const DEFAULT_IMPORT_CONFIDENCE = 0.7;

/**
 * 批量结构化：给定一组规则文本 + callLLM，顺序（非并发，避免打爆 LLM）
 * 处理，返回分桶结果。调用方通常再喂给 store.add。
 *
 * 保持纯：不写 store、不打 log；仅返回结构。bus 可选——若提供，每条
 * 完成/失败都 emit 一条 extractor.* 事件供 renderer 展示。
 */
export async function structureRuleTextsBatch(
  texts: string[],
  callLLM: (prompt: string) => Promise<string>,
  opts: { bus?: AttributionBus; now?: () => Date } = {},
): Promise<RuleStructureResult> {
  const now = opts.now ?? (() => new Date());
  const result: RuleStructureResult = {
    total: texts.length,
    structured: [],
    skipped: 0,
    failed: 0,
  };

  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed) {
      result.skipped++;
      continue;
    }
    try {
      const partial = await structureRuleText(trimmed, callLLM);
      if (partial === null) {
        result.skipped++;
        opts.bus?.emit({
          kind: "importer.skipped",
          source: "importer",
          severity: "info",
          userFacingValue: `规则文本无法结构化: ${truncate(trimmed, 60)}`,
          timestamp: now().toISOString(),
        });
      } else {
        result.structured.push({ sourceText: trimmed, partial });
        opts.bus?.emit({
          kind: "importer.structured",
          source: "importer",
          severity: "highlight",
          userFacingValue: `已导入: ${truncate(trimmed, 60)}`,
          timestamp: now().toISOString(),
        });
      }
    } catch (err) {
      result.failed++;
      opts.bus?.emit({
        kind: "importer.failed",
        source: "importer",
        severity: "warning",
        userFacingValue: `导入失败 (${String(err).slice(0, 80)}): ${truncate(trimmed, 40)}`,
        timestamp: now().toISOString(),
      });
    }
  }

  return result;
}

export interface RuleStructureResult {
  total: number;
  /** 每条成功的：原始文本 + LLM 产出的 Partial */
  structured: Array<{
    sourceText: string;
    partial: Partial<KnowledgeEntry>;
  }>;
  skipped: number;
  failed: number;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + "…";
}
