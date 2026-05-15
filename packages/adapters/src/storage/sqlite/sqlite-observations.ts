import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

export interface Observation {
  id: string;
  knowledge_id: string;
  timestamp: string;
  outcome: "success" | "failure";
  source_event?: string;
  tool_use_id?: string;
}

export class SqliteObservations {
  private readonly db: DatabaseSyncType;

  constructor(db: DatabaseSyncType) {
    this.db = db;
  }

  add(o: Observation): void {
    this.db.prepare(`
      INSERT INTO observations (id, knowledge_id, timestamp, outcome, source_event, tool_use_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(o.id, o.knowledge_id, o.timestamp, o.outcome, o.source_event ?? null, o.tool_use_id ?? null);
  }

  listForKnowledge(knowledge_id: string): Observation[] {
    return this.db.prepare(`
      SELECT id, knowledge_id, timestamp, outcome, source_event, tool_use_id
      FROM observations WHERE knowledge_id = ?
      ORDER BY timestamp DESC
    `).all(knowledge_id) as unknown as Observation[];
  }

  countByOutcome(knowledge_id: string, outcome: "success" | "failure"): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as n FROM observations
      WHERE knowledge_id = ? AND outcome = ?
    `).get(knowledge_id, outcome) as { n: number };
    return row.n;
  }

  close(): void {
    this.db.close();
  }
}
