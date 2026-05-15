import type { KnowledgeEntry } from "@teamagent/types";

export interface SemanticCandidate {
  rule: KnowledgeEntry;
  bm25Score: number;      // -1 表示 BM25 未命中
  triggerSim: number;     // cosine 相似度 [-1, 1]
  patternSim: number;
  rrfScore: number;       // reciprocal rank fusion
}

export interface SemanticRetriever {
  /**
   * 给定上下文 + 动作向量，返回 top-K 候选规则及其相似度。
   * - BM25 对 trigger_description + pattern_description 全文检索 top-20
   * - 密集 kNN 对 trigger_vec/pattern_vec 各取 top-20
   * - RRF 融合取 top-K（默认 20）
   * - 只返回 scope.level 匹配的规则
   */
  retrieve(args: {
    contextText: string;
    actionText: string;
    contextVec: Float32Array;
    actionVec: Float32Array;
    scope: { level: "personal" | "team" | "global"; project?: string };
    topK?: number;
  }): Promise<SemanticCandidate[]>;
}
