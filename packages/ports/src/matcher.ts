import type { KnowledgeEntry } from "@teamagent/types";

/** Hook 拦截时的工具调用上下文。 */
export interface ToolCallContext {
  toolName: string;
  input: Record<string, unknown>;
}

/**
 * 规则匹配器。给定工具调用和规则集，返回命中的规则。
 * 纯函数，无副作用。
 *
 * 关键约束：必须非常快（<5ms 于 100 条规则上）以满足 Hook 延迟目标。
 */
export interface Matcher {
  match(context: ToolCallContext, rules: KnowledgeEntry[]): KnowledgeEntry[];
}
