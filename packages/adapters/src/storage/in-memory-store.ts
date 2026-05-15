import type { KnowledgeEntry } from "@teamagent/types";
import type { KnowledgeStore, QueryOptions } from "@teamagent/ports";

/**
 * 内存知识库实现。用于 skeleton-demo 和测试。
 */
export class InMemoryKnowledgeStore implements KnowledgeStore {
  private entries = new Map<string, KnowledgeEntry>();

  getAll(): KnowledgeEntry[] {
    return [...this.entries.values()];
  }

  getActive(): KnowledgeEntry[] {
    return this.getAll().filter((e) => e.status === "active");
  }

  getById(id: string): KnowledgeEntry | undefined {
    return this.entries.get(id);
  }

  add(entry: KnowledgeEntry): void {
    if (this.entries.has(entry.id)) {
      throw new Error(`Duplicate entry id: ${entry.id}`);
    }
    this.entries.set(entry.id, entry);
  }

  update(id: string, patch: Partial<KnowledgeEntry>): void {
    const existing = this.entries.get(id);
    if (!existing) {
      throw new Error(`Entry not found: ${id}`);
    }
    this.entries.set(id, { ...existing, ...patch });
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  count(): number {
    return this.entries.size;
  }

  query(options: QueryOptions): KnowledgeEntry[] {
    let result = options.includeArchived ? this.getAll() : this.getActive();

    if (options.category) {
      result = result.filter((e) => e.category === options.category);
    }
    if (options.tags && options.tags.length > 0) {
      result = result.filter((e) =>
        options.tags!.some((tag) => e.tags.includes(tag)),
      );
    }
    if (options.minConfidence !== undefined) {
      result = result.filter((e) => e.confidence >= options.minConfidence!);
    }
    if (options.scope?.level) {
      result = result.filter((e) => e.scope.level === options.scope!.level);
    }
    if (options.scope?.project) {
      result = result.filter(
        (e) => !e.scope.project || e.scope.project === options.scope!.project,
      );
    }
    if (options.keyword) {
      const kw = options.keyword.toLowerCase();
      result = result.filter(
        (e) =>
          e.trigger.toLowerCase().includes(kw) ||
          e.tags.some((t) => t.toLowerCase().includes(kw)) ||
          e.wrong_pattern.toLowerCase().includes(kw) ||
          e.correct_pattern.toLowerCase().includes(kw),
      );
    }

    if (options.limit !== undefined) {
      result = result.slice(0, options.limit);
    }
    return result;
  }
}
