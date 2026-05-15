import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { PersistedEvent } from "@teamagent/types";

const CORE_KEYS = new Set(["id", "kind", "knowledge_id", "tool_use_id", "timestamp", "schema_version"]);

export class SqliteEventLog {
  private readonly db: DatabaseSyncType;

  constructor(db: DatabaseSyncType) {
    this.db = db;
  }

  append(e: PersistedEvent): void {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e)) {
      if (!CORE_KEYS.has(k)) payload[k] = v;
    }

    // Stable event IDs (e.g. `e-recur-{session}-{turn}-{kid}`) are intentionally
    // idempotent: re-running the same Stop for the same turn must not error.
    // OR IGNORE makes duplicate inserts a no-op rather than throwing
    // SQLITE_CONSTRAINT, which previously aborted the whole batch.
    this.db.prepare(`
      INSERT OR IGNORE INTO events (id, kind, knowledge_id, tool_use_id, timestamp, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      e.id,
      e.kind,
      (e as any).knowledge_id ?? null,
      (e as any).tool_use_id ?? null,
      e.timestamp,
      Object.keys(payload).length ? JSON.stringify(payload) : null,
    );
  }

  readAll(): PersistedEvent[] {
    const rows = this.db.prepare("SELECT * FROM events ORDER BY timestamp ASC").all() as any[];
    return rows.map(this.hydrate);
  }

  readByKind(kind: string): PersistedEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM events WHERE kind = ? ORDER BY timestamp ASC")
      .all(kind) as any[];
    return rows.map(this.hydrate);
  }

  readLast(n: number): PersistedEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM events ORDER BY timestamp DESC LIMIT ?")
      .all(n) as any[];
    return rows.map(this.hydrate);
  }

  close(): void {
    this.db.close();
  }

  private hydrate = (row: any): PersistedEvent => {
    // B-056: guard against malformed payload JSON (DB corruption / external writes)
    let extra: Record<string, unknown> = {};
    if (row.payload) {
      try {
        extra = JSON.parse(row.payload) as Record<string, unknown>;
      } catch {
        // malformed payload — silently treat as no extra fields
      }
    }
    return {
      id: row.id,
      kind: row.kind,
      knowledge_id: row.knowledge_id ?? undefined,
      tool_use_id: row.tool_use_id ?? undefined,
      timestamp: row.timestamp,
      schema_version: 1,
      ...extra,
    };
  };
}
