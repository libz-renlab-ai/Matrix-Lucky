import type { DatabaseSync } from "node:sqlite";
import type { KnowledgeEntry, Scope } from "@teamagent/types";
import { DEFAULT_FIRE_THRESHOLD } from "@teamagent/types";
import { normalizeChannel } from "@teamagent/types";
import type { RuleEmbedder } from "@teamagent/ports";
import { syncRuleVectors, syncToolVector, deleteRuleVectors } from "./vec-sync.js";

export interface SqliteKnowledgeStoreOptions {
  /** Optional rule embedder. When provided, addWithEmbedding/updateWithEmbedding
   *  automatically populate knowledge_trigger_vec/knowledge_pattern_vec/knowledge_tool_vec
   *  and stamp embedder_model_id, eliminating the need to run migrate-v6 manually. */
  embedder?: RuleEmbedder;
}

/** Flattened row shape coming from SQLite. */
export interface KnowledgeRow {
  id: string;
  scope_level: string;
  scope_project: string | null;
  scope_paths: string | null;
  scope_file_types: string | null;
  scope_branches: string | null;
  category: string;
  tags: string | null;
  type: string;
  nature: string;
  trigger: string;
  wrong_pattern: string;
  correct_pattern: string;
  correct_pattern_code_example: string | null;
  correct_pattern_import_path: string | null;
  correct_pattern_tldr: string | null;
  reasoning: string;
  when_expression: string | null;
  confidence: number;
  demerit: number;
  demerit_last_updated: string | null;
  current_tier: string;
  max_tier_ever: string;
  tier_entered_at: string;
  enforcement: string;
  status: string;
  hit_count: number;
  success_count: number;
  override_count: number;
  resurrect_count: number;
  evidence: string | null;
  source: string;
  conflict_with: string | null;
  created_at: string;
  last_hit_at: string | null;
  last_validated_at: string | null;
  channel: string | null;
  // v6 semantic matching fields (may be absent in old rows)
  trigger_description: string | null;
  pattern_description: string | null;
  hard_negatives: Buffer | string | null;
  threshold_alpha: number | null;
  threshold_beta: number | null;
  fire_threshold: number | null;
  observation_window: Buffer | string | null;
  embedder_model_id: string | null;
}

function serializeEntry(entry: KnowledgeEntry): Record<string, unknown> {
  const e = entry as any;
  const toJson = (value: unknown): string | null => {
    if (value == null) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  };
  return {
    id: entry.id,
    scope_level: entry.scope.level,
    scope_project: entry.scope.project ?? null,
    scope_paths: entry.scope.paths ? JSON.stringify(entry.scope.paths) : null,
    scope_file_types: entry.scope.file_types ? JSON.stringify(entry.scope.file_types) : null,
    scope_branches: entry.scope.branches ? JSON.stringify(entry.scope.branches) : null,
    category: entry.category,
    tags: JSON.stringify(entry.tags),
    type: entry.type,
    nature: entry.nature,
    trigger: entry.trigger,
    wrong_pattern: entry.wrong_pattern,
    correct_pattern: entry.correct_pattern,
    correct_pattern_code_example: e.correct_pattern_code_example ?? null,
    correct_pattern_import_path: e.correct_pattern_import_path ?? null,
    correct_pattern_tldr: e.correct_pattern_tldr ?? null,
    reasoning: entry.reasoning,
    when_expression: e.when_expression ?? null,
    confidence: entry.confidence,
    demerit: e.demerit ?? 0,
    demerit_last_updated: e.demerit_last_updated ?? null,
    current_tier: e.current_tier ?? "experimental",
    max_tier_ever: e.max_tier_ever ?? "experimental",
    tier_entered_at: (e.tier_entered_at && e.tier_entered_at.length > 0) ? e.tier_entered_at : entry.created_at,
    enforcement: entry.enforcement,
    status: entry.status,
    hit_count: entry.hit_count,
    success_count: entry.success_count,
    override_count: entry.override_count,
    resurrect_count: e.resurrect_count ?? 0,
    evidence: JSON.stringify(entry.evidence),
    source: entry.source,
    conflict_with: JSON.stringify(entry.conflict_with),
    created_at: entry.created_at,
    last_hit_at: entry.last_hit_at || null,
    last_validated_at: entry.last_validated_at || null,
    channel: normalizeChannel((entry as any).channel),
    // v6 semantic matching fields
    trigger_description: e.trigger_description ?? null,
    pattern_description: e.pattern_description ?? null,
    hard_negatives: toJson(e.hard_negatives),
    threshold_alpha: e.threshold_alpha ?? null,
    threshold_beta: e.threshold_beta ?? null,
    fire_threshold: e.fire_threshold ?? null,
    observation_window: toJson(e.observation_window),
    embedder_model_id: e.embedder_model_id ?? null,
  };
}

export function deserializeRow(row: KnowledgeRow): KnowledgeEntry {
  const scope: Scope = {
    level: row.scope_level as Scope["level"],
    ...(row.scope_project != null ? { project: row.scope_project } : {}),
    ...(row.scope_paths != null ? { paths: JSON.parse(row.scope_paths) } : {}),
    ...(row.scope_file_types != null ? { file_types: JSON.parse(row.scope_file_types) } : {}),
    ...(row.scope_branches != null ? { branches: JSON.parse(row.scope_branches) } : {}),
  };

  return {
    id: row.id,
    scope,
    category: row.category as KnowledgeEntry["category"],
    tags: row.tags ? JSON.parse(row.tags) : [],
    type: row.type as KnowledgeEntry["type"],
    nature: row.nature as KnowledgeEntry["nature"],
    trigger: row.trigger,
    wrong_pattern: row.wrong_pattern ?? "",
    correct_pattern: row.correct_pattern,
    reasoning: row.reasoning ?? "",
    confidence: row.confidence,
    current_tier: (row.current_tier ?? "experimental") as KnowledgeEntry["current_tier"],
    max_tier_ever: (row.max_tier_ever ?? "experimental") as KnowledgeEntry["max_tier_ever"],
    tier_entered_at: (row.tier_entered_at as string) ?? "",
    demerit: (row.demerit as number) ?? 0,
    demerit_last_updated: (row.demerit_last_updated as string) ?? "",
    resurrect_count: (row.resurrect_count as number) ?? 0,
    enforcement: row.enforcement as KnowledgeEntry["enforcement"],
    status: row.status as KnowledgeEntry["status"],
    hit_count: row.hit_count,
    success_count: row.success_count,
    override_count: row.override_count,
    evidence: row.evidence
      ? JSON.parse(row.evidence)
      : { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: row.created_at,
    last_hit_at: row.last_hit_at ?? "",
    last_validated_at: row.last_validated_at ?? "",
    source: row.source as KnowledgeEntry["source"],
    conflict_with: row.conflict_with ? JSON.parse(row.conflict_with) : [],
    channel: normalizeChannel(row.channel),
    // v6 semantic matching fields (default-safe for old rows)
    trigger_description: row.trigger_description ?? "",
    pattern_description: row.pattern_description ?? "",
    fire_threshold: row.fire_threshold ?? DEFAULT_FIRE_THRESHOLD,
    threshold_alpha: row.threshold_alpha ?? 1.0,
    threshold_beta: row.threshold_beta ?? 1.0,
    embedder_model_id: row.embedder_model_id ?? "",
    hard_negatives: (() => {
      const v = row.hard_negatives;
      if (!v) return [];
      const s = typeof v === "string" ? v : Buffer.from(v as Buffer).toString("utf8");
      try { return JSON.parse(s); } catch { return []; }
    })(),
    observation_window: (() => {
      const v = row.observation_window;
      if (!v) return [];
      const s = typeof v === "string" ? v : Buffer.from(v as Buffer).toString("utf8");
      try { return JSON.parse(s); } catch { return []; }
    })(),
  };
}

const INSERT_SQL = `
INSERT INTO knowledge (
  id, scope_level, scope_project, scope_paths, scope_file_types, scope_branches,
  category, tags, type, nature, trigger, wrong_pattern, correct_pattern,
  correct_pattern_code_example, correct_pattern_import_path, correct_pattern_tldr,
  reasoning, when_expression, confidence, demerit, demerit_last_updated,
  current_tier, max_tier_ever, tier_entered_at, enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  evidence, source, conflict_with, created_at, last_hit_at, last_validated_at,
  channel,
  trigger_description, pattern_description, hard_negatives,
  threshold_alpha, threshold_beta, fire_threshold, observation_window, embedder_model_id
) VALUES (
  @id, @scope_level, @scope_project, @scope_paths, @scope_file_types, @scope_branches,
  @category, @tags, @type, @nature, @trigger, @wrong_pattern, @correct_pattern,
  @correct_pattern_code_example, @correct_pattern_import_path, @correct_pattern_tldr,
  @reasoning, @when_expression, @confidence, @demerit, @demerit_last_updated,
  @current_tier, @max_tier_ever, @tier_entered_at, @enforcement, @status,
  @hit_count, @success_count, @override_count, @resurrect_count,
  @evidence, @source, @conflict_with, @created_at, @last_hit_at, @last_validated_at,
  @channel,
  @trigger_description, @pattern_description, @hard_negatives,
  @threshold_alpha, @threshold_beta, @fire_threshold, @observation_window, @embedder_model_id
)`;

const SELECT_BY_ID = "SELECT * FROM knowledge WHERE id = @id";
const SELECT_ALL = "SELECT * FROM knowledge";
const SELECT_BY_SCOPE = "SELECT * FROM knowledge WHERE scope_level = @level";
const SELECT_ACTIVE = "SELECT * FROM knowledge WHERE status = 'active'";
const DELETE_BY_ID = "DELETE FROM knowledge WHERE id = @id";

export class SqliteKnowledgeStore {
  private db: DatabaseSync;
  private embedder: RuleEmbedder | undefined;

  constructor(db: DatabaseSync, opts: SqliteKnowledgeStoreOptions = {}) {
    this.db = db;
    this.embedder = opts.embedder;
  }

  /**
   * Insert + auto-embed in one shot. Behaviour:
   *   1. Persist row via add() (synchronous SQL + FTS5).
   *   2. If an embedder is wired and at least one description field is non-empty,
   *      encode trigger/pattern/tool_context descriptions, write vec0 rows,
   *      and stamp embedder_model_id so downstream semanticMatch can see the rule.
   *   3. Embedding failure is swallowed (logged to stderr) — the row is not lost;
   *      operators can run `pnpm teamagent migrate-v6 --repair-all` to retry.
   *
   * Returning a Promise lets callers (init/pitfall/extract pipelines) await
   * embedding completion before status output. Hot-path PreToolUse hook reads
   * via findActive(); this is the rule write-path, so a few hundred ms of
   * embedder latency is acceptable here.
   */
  async addWithEmbedding(entry: KnowledgeEntry): Promise<void> {
    this.add(entry);
    await this.syncEmbeddingsFor(entry).catch((err) => {
      process.stderr.write(
        `[teamagent] auto-embed failed for ${entry.id}: ${(err as Error).message}\n`,
      );
    });
  }

  async updateWithEmbedding(
    id: string,
    patch: Partial<KnowledgeEntry> & Record<string, unknown>,
  ): Promise<void> {
    this.update(id, patch);
    const merged = this.getById(id);
    if (!merged) return;
    await this.syncEmbeddingsFor(merged).catch((err) => {
      process.stderr.write(
        `[teamagent] auto-embed update failed for ${id}: ${(err as Error).message}\n`,
      );
    });
  }

  private async syncEmbeddingsFor(entry: KnowledgeEntry): Promise<void> {
    if (!this.embedder) return;
    const e = entry as any;
    const trigDescr: string = e.trigger_description ?? "";
    const patDescr: string = e.pattern_description ?? "";
    const toolDescr: string = e.tool_context_description ?? "";
    if (!trigDescr && !patDescr && !toolDescr) return;

    // Encode in one batch so the model is loaded only once across descriptions.
    const texts = [trigDescr || " ", patDescr || " ", toolDescr || " "];
    const vecs = await this.embedder.embed(texts);
    const t = vecs?.[0];
    const p = vecs?.[1];
    if (!t || !p) {
      throw new Error("embedder returned insufficient vectors");
    }
    syncRuleVectors(this.db, entry.id, new Float32Array(t), new Float32Array(p));
    const toolVec = vecs[2];
    if (toolDescr && toolVec) {
      syncToolVector(this.db, entry.id, new Float32Array(toolVec));
    }
    // Stamp the model id so future migrations / health checks know this row
    // is up to date with the current embedder.
    this.db
      .prepare("UPDATE knowledge SET embedder_model_id = ? WHERE id = ?")
      .run(this.embedder.modelId, entry.id);
  }

  add(entry: KnowledgeEntry): void {
    const params = serializeEntry(entry);
    this.db.prepare(INSERT_SQL).run(params as Record<string, any>);
    // Sync FTS5 index (BM25 search). vec0 requires embedder — deferred to migrate-v6.
    if ((entry as any).trigger_description || (entry as any).pattern_description) {
      try {
        this.db.prepare(
          `INSERT OR REPLACE INTO knowledge_fts(id, trigger_description, pattern_description)
           VALUES (?, ?, ?)`,
        ).run(
          entry.id,
          (entry as any).trigger_description ?? "",
          (entry as any).pattern_description ?? "",
        );
      } catch { /* FTS5 not compiled in this SQLite build */ }
    }
  }

  getById(id: string): KnowledgeEntry | undefined {
    const row = this.db.prepare(SELECT_BY_ID).get({ id }) as KnowledgeRow | undefined;
    return row ? deserializeRow(row) : undefined;
  }

  /** Batch fetch by a list of ids. Missing ids are silently omitted. */
  byIds(ids: string[]): KnowledgeEntry[] {
    if (ids.length === 0) return [];
    return ids
      .map((id) => this.getById(id))
      .filter((e): e is KnowledgeEntry => e !== undefined);
  }

  getAll(): KnowledgeEntry[] {
    const rows = this.db.prepare(SELECT_ALL).all() as unknown as KnowledgeRow[];
    return rows.map(deserializeRow);
  }

  findByScopeLevel(level: "personal" | "team" | "global"): KnowledgeEntry[] {
    const rows = this.db.prepare(SELECT_BY_SCOPE).all({ level }) as unknown as KnowledgeRow[];
    return rows.map(deserializeRow);
  }

  findActive(): KnowledgeEntry[] {
    const rows = this.db.prepare(SELECT_ACTIVE).all() as unknown as KnowledgeRow[];
    return rows.map(deserializeRow);
  }

  /** KnowledgeStore port compatibility */
  getActive(): KnowledgeEntry[] {
    return this.findActive();
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as n FROM knowledge").get() as { n: number };
    return row.n;
  }

  query(options: {
    keyword?: string;
    category?: string;
    minConfidence?: number;
    includeArchived?: boolean;
    limit?: number;
  } = {}): KnowledgeEntry[] {
    let entries = options.includeArchived ? this.getAll() : this.findActive();
    if (options.keyword) {
      const kw = options.keyword.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.trigger.toLowerCase().includes(kw) ||
          e.correct_pattern.toLowerCase().includes(kw) ||
          (e.wrong_pattern ?? "").toLowerCase().includes(kw) ||
          e.tags.some((t) => t.toLowerCase().includes(kw)),
      );
    }
    if (options.category) {
      entries = entries.filter((e) => e.category === options.category);
    }
    if (options.minConfidence !== undefined) {
      entries = entries.filter((e) => e.confidence >= options.minConfidence!);
    }
    if (options.limit !== undefined) {
      entries = entries.slice(0, options.limit);
    }
    return entries;
  }

  update(id: string, patch: Partial<KnowledgeEntry> & Record<string, unknown>): void {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error(`Knowledge entry not found: ${id}`);
    }

    // Merge patch into existing, then re-serialize and overwrite
    const merged = { ...existing, ...patch } as KnowledgeEntry;
    // Handle scope merge specially — if patch has scope, merge it
    if (patch.scope) {
      merged.scope = { ...existing.scope, ...patch.scope };
    }

    const params = serializeEntry(merged);

    // Build UPDATE SET clause for all columns
    const setClauses = [
      "scope_level = @scope_level", "scope_project = @scope_project",
      "scope_paths = @scope_paths", "scope_file_types = @scope_file_types",
      "scope_branches = @scope_branches", "category = @category", "tags = @tags",
      "type = @type", "nature = @nature", "trigger = @trigger",
      "wrong_pattern = @wrong_pattern", "correct_pattern = @correct_pattern",
      "correct_pattern_code_example = @correct_pattern_code_example",
      "correct_pattern_import_path = @correct_pattern_import_path",
      "correct_pattern_tldr = @correct_pattern_tldr",
      "reasoning = @reasoning", "when_expression = @when_expression",
      "confidence = @confidence", "demerit = @demerit",
      "demerit_last_updated = @demerit_last_updated",
      "current_tier = @current_tier", "max_tier_ever = @max_tier_ever",
      "tier_entered_at = @tier_entered_at", "enforcement = @enforcement",
      "status = @status", "hit_count = @hit_count", "success_count = @success_count",
      "override_count = @override_count", "resurrect_count = @resurrect_count",
      "evidence = @evidence", "source = @source", "conflict_with = @conflict_with",
      "created_at = @created_at", "last_hit_at = @last_hit_at",
      "last_validated_at = @last_validated_at",
      "channel = @channel",
      "trigger_description = @trigger_description",
      "pattern_description = @pattern_description",
      "hard_negatives = @hard_negatives",
      "threshold_alpha = @threshold_alpha",
      "threshold_beta = @threshold_beta",
      "fire_threshold = @fire_threshold",
      "observation_window = @observation_window",
      "embedder_model_id = @embedder_model_id",
    ];

    const sql = `UPDATE knowledge SET ${setClauses.join(", ")} WHERE id = @id`;
    this.db.prepare(sql).run(params as Record<string, any>);
    // Sync FTS5 index (BM25 search). Use DELETE+INSERT because FTS5 virtual tables
    // don't support UPDATE. vec0 requires embedder — deferred to migrate-v6.
    // TODO(Phase C): after accumulateHardNegative wiring, trigger_vec/pattern_vec
    // sync should also happen here when embedder_model_id is present.
    const trigDescr = merged.trigger_description ?? (merged as any).trigger_description;
    const patDescr = merged.pattern_description ?? (merged as any).pattern_description;
    if (trigDescr || patDescr) {
      try {
        this.db.prepare(`DELETE FROM knowledge_fts WHERE id = ?`).run(id);
        this.db.prepare(
          `INSERT INTO knowledge_fts(id, trigger_description, pattern_description)
           VALUES (?, ?, ?)`,
        ).run(id, trigDescr ?? "", patDescr ?? "");
      } catch { /* FTS5 not compiled in this SQLite build */ }
    }
  }

  delete(id: string): void {
    this.db.prepare(DELETE_BY_ID).run({ id });
  }

  close(): void {
    this.db.close();
  }
}
