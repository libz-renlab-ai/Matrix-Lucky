import { createRequire } from "node:module";
import type {
  SemanticRetriever,
  SemanticCandidate,
} from "@teamagent/ports";
import {
  deserializeRow,
  type KnowledgeRow,
} from "../storage/sqlite/sqlite-knowledge-store.js";

const require = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = require("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSyncCtor>;

const RRF_K = 60;
const DEFAULT_TOP_K = 20;

interface ScoreEntry {
  rrf: number;
  bm25: number;
  triggerSim: number;
  patternSim: number;
}

export class SqliteSemanticRetriever implements SemanticRetriever {
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
    const scores = new Map<string, ScoreEntry>();

    const addRRF = (
      id: string,
      rank: number,
      update: { bm25?: number; triggerSim?: number; patternSim?: number },
    ) => {
      const prev = scores.get(id) ?? {
        rrf: 0,
        bm25: -1,
        triggerSim: -1,
        patternSim: -1,
      };
      prev.rrf += 1 / (RRF_K + rank);
      if (update.bm25 !== undefined) prev.bm25 = update.bm25;
      if (update.triggerSim !== undefined) prev.triggerSim = update.triggerSim;
      if (update.patternSim !== undefined) prev.patternSim = update.patternSim;
      scores.set(id, prev);
    };

    // Stage 1: BM25 via FTS5 (try/catch — FTS5 may not be available in Node 22 sqlite)
    try {
      const query = [args.contextText, args.actionText]
        .join(" ")
        .replace(/[^\w\s一-鿿]/g, " ")
        .trim();
      if (query.length > 0) {
        const bm25Rows = this.db
          .prepare(
            `SELECT id, rank as bm25_rank
             FROM knowledge_fts
             WHERE knowledge_fts MATCH ?
             ORDER BY rank
             LIMIT ?`,
          )
          .all(query, topK) as Array<{ id: string; bm25_rank: number }>;
        bm25Rows.forEach((r, i) => addRRF(r.id, i + 1, { bm25: r.bm25_rank }));
      }
    } catch (err) {
      if (process.env.TEAMAGENT_HOOK_DEBUG === "1") {
        process.stderr.write(`[teamagent-retriever] BM25 stage failed: ${(err as Error).message}\n`);
      }
    }

    // Stage 2: dense trigger top-K (vec0 kNN)
    try {
      const denseT = this.db
        .prepare(
          `SELECT id, distance
           FROM knowledge_trigger_vec
           WHERE vec MATCH ?
           ORDER BY distance
           LIMIT ?`,
        )
        .all(new Uint8Array(args.contextVec.buffer), topK) as Array<{
        id: string;
        distance: number;
      }>;
      denseT.forEach((r, i) =>
        addRRF(r.id, i + 1, { triggerSim: 1 - r.distance }),
      );
    } catch (err) {
      if (process.env.TEAMAGENT_HOOK_DEBUG === "1") {
        process.stderr.write(`[teamagent-retriever] dense stage failed: ${(err as Error).message}\n`);
      }
    }

    // Stage 3: dense pattern top-K (vec0 kNN)
    try {
      const denseP = this.db
        .prepare(
          `SELECT id, distance
           FROM knowledge_pattern_vec
           WHERE vec MATCH ?
           ORDER BY distance
           LIMIT ?`,
        )
        .all(new Uint8Array(args.actionVec.buffer), topK) as Array<{
        id: string;
        distance: number;
      }>;
      denseP.forEach((r, i) =>
        addRRF(r.id, i + 1, { patternSim: 1 - r.distance }),
      );
    } catch (err) {
      if (process.env.TEAMAGENT_HOOK_DEBUG === "1") {
        process.stderr.write(`[teamagent-retriever] dense stage failed: ${(err as Error).message}\n`);
      }
    }

    const debug = process.env.TEAMAGENT_HOOK_DEBUG === "1";
    if (debug) {
      process.stderr.write(
        `[teamagent-retriever] scope=${args.scope.level} stage1+2+3 → ${scores.size} candidates\n`,
      );
    }

    if (scores.size === 0) return [];

    // Stage 4: fetch full rule rows + scope filter
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

    if (debug) {
      process.stderr.write(
        `[teamagent-retriever] scope=${args.scope.level} after scope filter → ${rows.length} rows\n`,
      );
    }

    const out = rows
      .map((r) => {
        const s = scores.get(r.id)!;
        return {
          rule: deserializeRow(r),
          bm25Score: s.bm25,
          triggerSim: s.triggerSim,
          patternSim: s.patternSim,
          rrfScore: s.rrf,
        };
      })
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, topK);

    if (debug && out.length > 0) {
      for (const c of out.slice(0, 3)) {
        process.stderr.write(
          `[teamagent-retriever]   ${c.rule.id} bm25=${c.bm25Score.toFixed(3)} ` +
          `triggerSim=${c.triggerSim.toFixed(3)} patternSim=${c.patternSim.toFixed(3)} ` +
          `rrf=${c.rrfScore.toFixed(4)}\n`,
        );
      }
    }
    return out;
  }
}
