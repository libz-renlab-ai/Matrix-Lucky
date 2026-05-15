import { createRequire } from "node:module";
import type { SemanticRetriever, SemanticCandidate } from "@teamagent/ports";
import {
  deserializeRow,
  type KnowledgeRow,
} from "../storage/sqlite/sqlite-knowledge-store.js";

const require = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = require("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSyncCtor>;

const DEFAULT_TOP_K = 20;
const RRF_K = 60;

/**
 * 专供 PreToolUse 使用的语义检索器：只查 knowledge_tool_vec。
 * 用 actionVec（buildToolActionSummary 的 embedding）做 kNN 搜索。
 */
export class SqliteToolRetriever implements SemanticRetriever {
  constructor(private readonly db: DatabaseSync) {}

  async retrieve(args: {
    contextText: string;
    actionText: string;
    contextVec: Float32Array;
    actionVec: Float32Array;
    scope: { level: "personal" | "team" | "global"; project?: string };
    topK?: number;
  }): Promise<SemanticCandidate[]> {
    const topK = args.topK ?? DEFAULT_TOP_K;
    const scores = new Map<string, { rrf: number; toolSim: number }>();

    // kNN on knowledge_tool_vec using actionVec
    try {
      const rows = this.db
        .prepare(
          `SELECT id, distance
           FROM knowledge_tool_vec
           WHERE vec MATCH ?
           ORDER BY distance
           LIMIT ?`,
        )
        .all(new Uint8Array(args.actionVec.buffer), topK) as Array<{
        id: string;
        distance: number;
      }>;
      rows.forEach((r, i) => {
        const sim = 1 - r.distance;
        scores.set(r.id, {
          rrf: 1 / (RRF_K + i + 1),
          toolSim: sim,
        });
      });
    } catch {
      /* knowledge_tool_vec not available */
    }

    if (scores.size === 0) return [];

    // Fetch full rows + scope filter
    const ids = [...scores.keys()];
    const placeholders = ids.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT * FROM knowledge
         WHERE id IN (${placeholders})
           AND status = 'active'
           AND scope_level = ?`,
      )
      .all(...ids, args.scope.level) as unknown as KnowledgeRow[];

    return rows
      .map((r) => {
        const s = scores.get(r.id)!;
        const sim = s.toolSim;
        return {
          rule: deserializeRow(r),
          bm25Score: -1,
          triggerSim: sim,
          patternSim: sim,
          rrfScore: s.rrf,
        };
      })
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, topK);
  }
}
