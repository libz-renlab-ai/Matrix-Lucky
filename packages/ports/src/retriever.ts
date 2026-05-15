import type { KnowledgeEntry } from "@teamagent/types";

/** 检索上下文——"当前场景" 的描述。 */
export interface RetrievalContext {
  /** 当前 tool 名 */
  toolName?: string;
  /** 当前 tool input（字符串化）*/
  toolInputText?: string;
  /** 文件路径（若有）*/
  filePath?: string;
  /** 项目名（用于 scope 过滤）*/
  project?: string;
  /** 自由查询关键词 */
  query?: string;
  /** 返回上限；默认 5 */
  limit?: number;
}

/**
 * 知识检索器。Phase 1 关键词 + BM25；Phase 2 叠加语义向量。
 * 策略可替换（Strategy Pattern），通过换实现即切换。
 */
export interface Retriever {
  query(context: RetrievalContext, entries: KnowledgeEntry[]): KnowledgeEntry[];
}
