import type { KnowledgeEntry } from "@teamagent/types";

/** 查询知识库时的过滤条件。 */
export interface QueryOptions {
  /** 关键词（匹配 trigger / tags / wrong_pattern / correct_pattern）*/
  keyword?: string;
  category?: "C" | "E" | "S" | "K";
  tags?: string[];
  minConfidence?: number;
  /** 作用域过滤 */
  scope?: { level?: "personal" | "team" | "global"; project?: string };
  /** 是否包含 archived。默认 false。 */
  includeArchived?: boolean;
  /** 返回条数上限 */
  limit?: number;
}

/**
 * 知识库存储。负责持久化、CRUD、检索。
 *
 * 实现约束：
 * - add 重复 id 必须抛错
 * - update 不存在的 id 必须抛错
 * - getAll 默认包含所有状态；getActive 仅返回 status=active
 */
export interface KnowledgeStore {
  /** 读取所有条目（含 archived） */
  getAll(): KnowledgeEntry[];

  /** 读取 status=active 的条目 */
  getActive(): KnowledgeEntry[];

  /** 按 id 查询 */
  getById(id: string): KnowledgeEntry | undefined;

  /** 按条件查询。默认只返回 active 条目，除非 options.includeArchived=true */
  query(options: QueryOptions): KnowledgeEntry[];

  /** 新增条目。重复 id 抛错。 */
  add(entry: KnowledgeEntry): void;

  /**
   * 新增条目并触发向量同步。实现可选；若 store 注入了 RuleEmbedder 则在
   * insert 后自动写 knowledge_*_vec 表 + stamp embedder_model_id；否则
   * 行为等同于 add()。调用方应当在 await 之后再继续，确保 dense 检索在下一
   * 次 PreToolUse 调用时立即可用。
   */
  addWithEmbedding?(entry: KnowledgeEntry): Promise<void>;

  /** 更新条目。id 不存在抛错。patch 合并到现有条目上。 */
  update(id: string, patch: Partial<KnowledgeEntry>): void;

  /**
   * 更新条目并触发向量同步（同 addWithEmbedding 的语义）。实现可选。
   */
  updateWithEmbedding?(id: string, patch: Partial<KnowledgeEntry>): Promise<void>;

  /** 删除条目。返回是否删除了记录。 */
  delete(id: string): boolean;

  /** 条目总数（含 archived） */
  count(): number;
}
