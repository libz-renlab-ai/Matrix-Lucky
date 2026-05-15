import type { KnowledgeEntry } from "@teamagent/types";

/**
 * 知识编译器——把知识条目编译为目标格式。
 *
 * 不同目标格式用不同泛型参数实例化：
 * - Compiler<string>：编译为 CLAUDE.md 片段或 .cursorrules 文本
 * - 将来可能有 Compiler<object>：编译为 Hook 规则 JSON 等
 */
export interface Compiler<T> {
  compile(entries: KnowledgeEntry[]): T;
}
