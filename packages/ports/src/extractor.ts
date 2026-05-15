import type { KnowledgeEntry } from "@teamagent/types";

/** 提取 Extractor 支持的输入来源类型。M2.3 扩至 8 类以覆盖 6 源摄入。 */
export type ExtractionKind =
  | "correction"
  | "success"
  | "rule-text"
  | "insights"
  | "npm-audit"
  | "pr-review"
  | "git-hotspot"
  | "ci-failure";

/** 提取 Extractor 的输入。 */
export interface ExtractionInput {
  /** 来源 kind，见 ExtractionKind。prompt 按 kind 分派 header。 */
  kind: ExtractionKind;
  /** 上下文说明（纠正文本、AI 上下文、规则原文、日志片段等） */
  context: string;
  /** 信号的权重或原始置信度（0-1） */
  weight: number;
}

/**
 * 调用 LLM 把非结构化信号提取成结构化知识条目。
 *
 * 返回 Partial<KnowledgeEntry>——只含 LLM 可以提取的字段（category/tags/
 * type/nature/trigger/wrong_pattern/correct_pattern/reasoning）。
 * 其余字段（id/confidence/enforcement/timestamps/evidence）由调用方
 * （通常是 Pipeline）补全。
 *
 * callLLM 通过依赖注入传入，便于测试时 mock。
 */
export interface KnowledgeExtractor {
  extract(
    input: ExtractionInput,
    callLLM: (prompt: string) => Promise<string>,
  ): Promise<Partial<KnowledgeEntry> | null>;
}
