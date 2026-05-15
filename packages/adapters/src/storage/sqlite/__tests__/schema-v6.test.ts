import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../schema.js";

describe("Schema v6 migration", () => {
  let dbPath: string;
  beforeEach(() => {
    dbPath = join(mkdtempSync(join(tmpdir(), "m4b-schema-")), "test.db");
  });

  it("adds trigger_description and pattern_description columns", () => {
    const db = openDb(dbPath);
    const cols = db
      .prepare("PRAGMA table_info(knowledge)")
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("trigger_description");
    expect(names).toContain("pattern_description");
    expect(names).toContain("fire_threshold");
  });

  it("creates knowledge_fts virtual table for BM25 (skipped if FTS5 unavailable)", () => {
    const db = openDb(dbPath);
    // Node 22 experimental SQLite may not have FTS5 compiled in
    // Check if FTS5 is available by attempting a test CREATE
    let fts5Available = true;
    try {
      const testDb = openDb(join(mkdtempSync(join(tmpdir(), "m4b-fts5-probe-")), "probe.db"));
      testDb.exec("CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_probe USING fts5(x)");
      testDb.exec("DROP TABLE IF EXISTS _fts5_probe");
      testDb.close();
    } catch {
      fts5Available = false;
    }
    if (!fts5Available) {
      return; // FTS5 not available in this SQLite build, skip
    }
    const tbl = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_fts'",
      )
      .get();
    expect(tbl).toBeTruthy();
  });

  it("creates knowledge_trigger_vec and knowledge_pattern_vec vec0 tables (skipped if sqlite-vec unavailable)", () => {
    const db = openDb(dbPath);
    // Check if sqlite-vec is available by seeing if knowledge_vec (existing vec0 table) was created
    const knowledgeVec = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name='knowledge_vec'",
      )
      .get();
    if (!knowledgeVec) {
      // sqlite-vec not available, skip this test
      return;
    }
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name LIKE 'knowledge_%_vec'",
      )
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain("knowledge_trigger_vec");
    expect(names).toContain("knowledge_pattern_vec");
  });

  it("is idempotent: reopening existing db does not error", () => {
    openDb(dbPath);
    openDb(dbPath);
  });
});
