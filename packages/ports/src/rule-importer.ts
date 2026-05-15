import type { KnowledgeEntry } from "@teamagent/types";

/**
 * 从文本规则文件导入结构化知识。M5 的 ClaudeMdRuleImporter /
 * CursorRulesImporter 实现此接口。
 *
 * 内部通常调用 KnowledgeExtractor（依赖 LLM）将每条文本规则
 * 转为 KnowledgeEntry。
 */
export interface RuleImporter {
  /**
   * 读取 filepath，解析 bullet/规则文本，转为结构化 entries。
   *
   * 返回的 entries 应已补全所有 KnowledgeEntry 必需字段
   * （由 importer 实现负责 id 分配、confidence 初始化、source="imported"）。
   */
  import(filepath: string): Promise<KnowledgeEntry[]>;
}
